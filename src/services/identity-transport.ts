import { ApiError } from './admin'
import {
  parseIdentityCase,
  parseIdentityPage,
  parseIdentityReceipt,
  validIdentityFeedback,
} from './identity'
import { record } from '@/types/admin'
import type { IdentityReviewClient } from '@/types/identity'

/** 仅消费标准成功封装，错误正文不进入页面或日志。 */
function data(value: unknown): unknown {
  if (
    !record(value) ||
    value['code'] !== 0 ||
    typeof value['message'] !== 'string' ||
    typeof value['request_id'] !== 'string' ||
    !('data' in value)
  )
    throw new Error('身份审核响应封装不符合契约')
  return value['data']
}

/** 显式注入当前后台会话；授权回调在请求前后复核，取消后丢弃敏感响应。 */
export function createIdentityTransport(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch = fetch,
): IdentityReviewClient {
  function guard(signal: AbortSignal) {
    signal.throwIfAborted()
    if (!token.trim()) throw new ApiError(401)
    if (!allowed()) throw new ApiError(403)
  }
  function path(id: string) {
    if (!id.trim() || id === '.' || id === '..') throw new Error('案件标识不能为空或相对路径')
    return `/api/v1/admin/identity-reviews/${encodeURIComponent(id)}`
  }
  async function request(url: string, signal: AbortSignal, init: RequestInit = {}) {
    guard(signal)
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const response = await transport(url, {
      ...init,
      headers,
      signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    })
    guard(signal)
    if (response.status !== 200) throw new ApiError(response.status)
    return response
  }
  async function json(url: string, signal: AbortSignal, init?: RequestInit) {
    const response = await request(url, signal, init)
    const value: unknown = await response.json()
    guard(signal)
    return data(value)
  }
  return {
    async list(cursor, signal) {
      const query = new URLSearchParams({ limit: '20' })
      if (cursor !== null) query.set('cursor', cursor)
      return parseIdentityPage(await json(`/api/v1/admin/identity-reviews?${query}`, signal))
    },
    async detail(id, signal) {
      const result = parseIdentityCase(await json(path(id), signal))
      if (result.id !== id) throw new Error('案件响应不匹配')
      return result
    },
    async card(id, signal) {
      const response = await request(`${path(id)}/student-card`, signal)
      if (response.headers.get('Content-Type')?.split(';')[0]?.trim() !== 'image/png')
        throw new Error('学生卡响应必须为规范化 PNG 图片')
      const image = await response.blob()
      guard(signal)
      if (!image.size) throw new Error('学生卡图片不能为空')
      return image
    },
    async decide(id, input, key, signal) {
      if (
        !key.trim() ||
        !Number.isSafeInteger(input.expected_version) ||
        input.expected_version < 1
      )
        throw new Error('缺少有效版本或操作标识')
      if (
        input.decision === 'rejected' &&
        (!validIdentityFeedback(input.reason) || !validIdentityFeedback(input.revision_suggestion))
      )
        throw new Error('驳回原因和修改建议均不能为空，且每项不得超过 2000 字节')
      const body =
        input.decision === 'approved'
          ? { decision: input.decision, expected_version: input.expected_version }
          : {
              decision: input.decision,
              expected_version: input.expected_version,
              reason: input.reason,
              revision_suggestion: input.revision_suggestion,
            }
      const result = parseIdentityReceipt(
        await json(`${path(id)}/decision`, signal, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
          body: JSON.stringify(body),
        }),
      )
      if (result.request_id !== id) throw new Error('案件回执不匹配')
      return result
    },
  }
}
