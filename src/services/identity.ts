import { ApiError, mockEnabled } from './admin'
import { record } from '@/types/admin'
import type {
  IdentityCase,
  IdentityDecision,
  IdentityPage,
  IdentityReceipt,
  IdentityReviewClient,
  IdentitySummary,
} from '@/types/identity'

function invalid(): never {
  throw new Error('身份审核响应格式不符合契约')
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return invalid()
  return value
}
function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return invalid()
  return value
}
function summary(value: unknown): IdentitySummary {
  if (!record(value)) return invalid()
  return {
    id: text(value['id']),
    version: version(value['version']),
    status: text(value['status']),
  }
}
/** 仅提取脱敏列表字段，额外身份字段不会进入页面状态。 */
export function parseIdentityPage(value: unknown): IdentityPage {
  if (!record(value) || !Array.isArray(value['items'])) return invalid()
  const cursor = value['next_cursor']
  if (cursor !== null && typeof cursor !== 'string') return invalid()
  return { items: value['items'].map(summary), next_cursor: cursor }
}
export function parseIdentityCase(value: unknown): IdentityCase {
  if (!record(value)) return invalid()
  return {
    ...summary(value),
    name: text(value['name']),
    student_number: text(value['student_number']),
    asset_id: text(value['asset_id']),
  }
}
export function parseIdentityReceipt(value: unknown): IdentityReceipt {
  if (!record(value)) return invalid()
  const status = value['status']
  if (status !== 'pending' && status !== 'approved' && status !== 'rejected') return invalid()
  const result: IdentityReceipt = {
    request_id: text(value['request_id']),
    version: version(value['version']),
    status,
  }
  if (value['reason'] !== undefined) result.reason = text(value['reason'])
  if (value['revision_suggestion'] !== undefined)
    result.revision_suggestion = text(value['revision_suggestion'])
  return result
}

/** 每次调用都重新核对本地角色；服务端案件授权仍须在真实接入时验证。 */
export function createIdentityReviewClient(allowed: () => boolean): IdentityReviewClient {
  const cases: IdentityCase[] = Array.from({ length: 5 }, (_, index) => ({
    id: `synthetic-case-${index + 1}`,
    version: 1,
    status: 'pending',
    name: `合成学生${index + 1}`,
    student_number: `合成学号-${index + 1}`,
    asset_id: `synthetic-card-${index + 1}`,
  }))
  const receipts = new Map<string, { fingerprint: string; receipt: IdentityReceipt }>()
  async function guard(signal: AbortSignal) {
    signal.throwIfAborted()
    if (!mockEnabled) throw new ApiError(503)
    if (!allowed()) throw new ApiError(403)
    await Promise.resolve()
    signal.throwIfAborted()
    if (!allowed()) throw new ApiError(403)
  }
  function find(id: string) {
    const item = cases.find((entry) => entry.id === id)
    if (!item) throw new ApiError(404)
    return item
  }
  return {
    async list(cursor, signal) {
      await guard(signal)
      const start = cursor === null ? 0 : cases.findIndex((entry) => entry.id === cursor)
      if (start < 0) throw new ApiError(400)
      const items = cases.slice(start, start + 2)
      return parseIdentityPage({ items, next_cursor: cases[start + 2]?.id ?? null })
    },
    async detail(id, signal) {
      await guard(signal)
      return parseIdentityCase(find(id))
    },
    async card(id, signal) {
      await guard(signal)
      find(id)
      // 图片由本地固定合成内容生成，不读取真实资料或公开对象地址。
      return new Blob(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" rx="24" fill="#e3f2ed"/><text x="40" y="100" font-size="32" fill="#183c3a">合成学生卡 · 仅供演示</text><text x="40" y="170" font-size="22" fill="#183c3a">此图片不包含真实姓名、学号或证件</text><text x="40" y="250" font-size="22" fill="#183c3a">真实查看须经案件授权并记录审计</text></svg>',
        ],
        { type: 'image/svg+xml' },
      )
    },
    async decide(id, input: IdentityDecision, key, signal) {
      await guard(signal)
      const item = find(id)
      if (
        !key.trim() ||
        !Number.isSafeInteger(input.expected_version) ||
        input.expected_version < 1
      )
        throw new ApiError(400)
      if (
        input.decision === 'rejected' &&
        (!input.reason.trim() || !input.revision_suggestion.trim())
      )
        throw new Error('驳回原因和修改建议均不能为空')
      const fingerprint = JSON.stringify([id, input])
      const previous = receipts.get(key)
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new ApiError(409)
        return { ...previous.receipt }
      }
      if (item.version !== input.expected_version || item.status !== 'pending')
        throw new ApiError(409)
      item.status = input.decision
      item.version++
      const receipt = parseIdentityReceipt({
        request_id: id,
        version: item.version,
        status: item.status,
        ...(input.decision === 'rejected'
          ? { reason: input.reason.trim(), revision_suggestion: input.revision_suggestion.trim() }
          : {}),
      })
      receipts.set(key, { fingerprint, receipt })
      return { ...receipt }
    },
  }
}
