import { parseNumberedPage } from './numbered-page'
import { record } from '@/types/admin'
import type {
  IdentityCase,
  IdentityHistory,
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
export function parseIdentityPage(
  value: unknown,
  view: IdentityListView,
  withCreatedAt = false,
): IdentityPage {
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
      ...(withCreatedAt ? { created_at: timestamp(item['created_at']) } : {}),
    }
  })
  return { items, next_cursor: cursor, ...parseNumberedPage(value, items.length, cursor) }
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

function timestamp(value: unknown): string {
  const result = text(value)
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    return invalid()
  return result
}
/** 完成案件仅保留审核结论投影，不携带学生卡与学生账号标识。 */
export function parseIdentityHistory(value: unknown): IdentityHistory {
  if (!record(value) || (value['status'] !== 'approved' && value['status'] !== 'rejected'))
    return invalid()
  const nullable = (input: unknown) => (input === null ? null : text(input))
  return {
    id: text(value['id']),
    version: version(value['version']),
    status: value['status'],
    name: text(value['name']),
    student_number: text(value['student_number']),
    created_at: timestamp(value['created_at']),
    reviewed_at: value['reviewed_at'] === null ? null : timestamp(value['reviewed_at']),
    reviewer_id: nullable(value['reviewer_id']),
    reason: nullable(value['reason']),
    revision_suggestion: nullable(value['revision_suggestion']),
  }
}
