import { record } from '@/types/admin'
import type { CursorPage } from '@/types/moderation'

export function reviewRecord(value: unknown): Record<string, unknown> {
  if (!record(value)) throw new Error('管理响应格式不符合契约')
  return value
}
export function reviewText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('管理响应文本格式异常')
  return value
}
export function reviewVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('资源版本格式异常')
  return value
}
export function reviewPage<T>(value: unknown, parse: (item: unknown) => T): CursorPage<T> {
  const data = reviewRecord(value)
  if (
    !Array.isArray(data['items']) ||
    (data['next_cursor'] !== null && typeof data['next_cursor'] !== 'string')
  )
    throw new Error('分页响应格式异常')
  return { items: data['items'].map(parse), next_cursor: data['next_cursor'] }
}
