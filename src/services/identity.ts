import { record } from '@/types/admin'
import type { IdentityCase, IdentityPage, IdentityReceipt, IdentitySummary } from '@/types/identity'

/** 与人工认证契约的意见资源上限一致，按 UTF-8 字节计数。 */
export function validIdentityFeedback(value: string): boolean {
  return !!value.trim() && new TextEncoder().encode(value).byteLength <= 2000
}

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
