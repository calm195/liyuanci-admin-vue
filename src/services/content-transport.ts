import { ApiError } from './admin'
import { record } from '@/types/admin'
import { parseModerationCase, parseModerationOutcome, parseModerationPage } from './moderation'
import { parseWordlist, parseWordlistDetail, parseWordlistPage } from './wordlists'
import { reviewText, reviewVersion } from './review-boundary'
import { wordlistKinds } from '@/types/wordlists'
import type { ModerationClient } from '@/types/moderation'
import type { WordlistClient } from '@/types/wordlists'

/** 词库和内容审核共用当前后台会话及标准封装，取消或撤权后丢弃响应。 */
function createContentRequest(token: string, allowed: () => boolean, transport: typeof fetch) {
  function guard(signal: AbortSignal) {
    signal.throwIfAborted()
    if (!token.trim()) throw new ApiError(401)
    if (!allowed()) throw new ApiError(403)
  }
  return async (path: string, signal: AbortSignal, init: RequestInit = {}, status = 200) => {
    guard(signal)
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const response = await transport(`/api/v1/admin/${path}`, {
      ...init,
      headers,
      signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    })
    guard(signal)
    if (response.status !== status) throw new ApiError(response.status)
    const value: unknown = await response.json()
    guard(signal)
    if (
      !record(value) ||
      value['code'] !== 0 ||
      typeof value['message'] !== 'string' ||
      typeof value['request_id'] !== 'string' ||
      !('data' in value)
    )
      throw new Error('内容管理响应封装不符合契约')
    return value['data']
  }
}
function resource(collection: string, id: string): string {
  if (!id.trim() || id === '.' || id === '..') throw new Error('资源标识不能为空或相对路径')
  return `${collection}/${encodeURIComponent(id)}`
}
function query(cursor: string | null): string {
  const params = new URLSearchParams({ limit: '20' })
  if (cursor !== null) params.set('cursor', cursor)
  return params.toString()
}
function command(input: unknown, key: string): RequestInit {
  if (!key.trim() || key.length > 128 || /[\r\n]/u.test(key)) throw new Error('缺少有效操作标识')
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(input),
  }
}
/** 审核意见使用后端约定的 UTF-8 字节预算，避免中文超限后才被服务端拒绝。 */
export function validModerationFeedback(value: string): boolean {
  return !!value.trim() && new TextEncoder().encode(value).byteLength <= 2000
}

export function createModerationTransport(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch = fetch,
): ModerationClient {
  const request = createContentRequest(token, allowed, transport)
  return {
    async list(cursor, signal) {
      return parseModerationPage(await request(`moderation-tasks?${query(cursor)}`, signal))
    },
    async detail(id, signal) {
      const value = parseModerationCase(await request(resource('moderation-tasks', id), signal))
      if (value.id !== id) throw new Error('审核案件响应不匹配')
      return value
    },
    async decide(id, input, key, signal) {
      reviewVersion(input.expected_version)
      if (
        input.decision === 'rejected' &&
        (!validModerationFeedback(input.reason) ||
          !validModerationFeedback(input.revision_suggestion))
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
      return parseModerationOutcome(
        await request(`${resource('moderation-tasks', id)}/decision`, signal, command(body, key)),
      )
    },
  }
}

export function createWordlistTransport(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch = fetch,
): WordlistClient {
  const request = createContentRequest(token, allowed, transport)
  return {
    async list(cursor, signal) {
      return parseWordlistPage(await request(`wordlists?${query(cursor)}`, signal))
    },
    async detail(id, signal) {
      const value = parseWordlistDetail(await request(resource('wordlists', id), signal))
      if (value.id !== id) throw new Error('词库详情响应不匹配')
      return value
    },
    async create(input, key, signal) {
      reviewVersion(input.expected_version)
      if (!wordlistKinds.includes(input.kind) || !Array.isArray(input.entries))
        throw new Error('词库分类或完整快照格式异常')
      const entries = input.entries.map(reviewText)
      if (
        new Set(entries).size !== entries.length ||
        entries.some((entry) => [...entry].length > 1000)
      )
        throw new Error('词条不能重复，且每条不得超过 1000 个字符')
      const value = parseWordlist(
        await request(
          'wordlists/versions',
          signal,
          command(
            {
              kind: input.kind,
              entries,
              expected_version: input.expected_version,
            },
            key,
          ),
          201,
        ),
      )
      if (value.kind !== input.kind) throw new Error('词库创建响应分类不匹配')
      return value
    },
    async publish(id, input, key, signal) {
      reviewVersion(input.expected_version)
      reviewVersion(input.expected_head_version)
      const value = parseWordlist(
        await request(
          `${resource('wordlists', id)}/publish`,
          signal,
          command(
            {
              expected_version: input.expected_version,
              expected_head_version: input.expected_head_version,
            },
            key,
          ),
        ),
      )
      if (value.id !== id) throw new Error('词库发布响应不匹配')
      return value
    },
  }
}
