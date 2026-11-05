import { record } from '@/types/admin'
import type {
  IdentityCase,
  IdentityListItem,
  IdentityListView,
  IdentityPage,
  IdentityReceipt,
  IdentitySummary,
} from '@/types/identity'

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
/** 只保留当前列表所需的业务字段，学生卡和内部版本由详情单独读取。 */
export function parseIdentityPage(value: unknown, view: IdentityListView): IdentityPage {
  if (!record(value) || !Array.isArray(value['items'])) return invalid()
  const cursor = value['next_cursor']
  if (cursor !== null && typeof cursor !== 'string') return invalid()
  const items = value['items'].map((item: unknown): IdentityListItem => {
    if (!record(item)) return invalid()
    const status = item['status']
    const reviewedAt = item['reviewed_at']
    if (status !== 'pending' && status !== 'approved' && status !== 'rejected') return invalid()
    if ((view === 'pending') !== (status === 'pending')) return invalid()
    if (reviewedAt !== undefined && typeof reviewedAt !== 'string') return invalid()
    return {
      id: text(item['id']),
      name: text(item['name']),
      student_number: text(item['student_number']),
      status,
      reviewed_at: reviewedAt ?? null,
    }
  })
  return { items, next_cursor: cursor }
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
