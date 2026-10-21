import { record } from '@/types/admin'
import { ApiError, mockEnabled } from './admin'
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
export function mockPage<T extends { id: string }>(
  items: T[],
  cursor: string | null,
): CursorPage<T> {
  const start = cursor === null ? 0 : items.findIndex((item) => item.id === cursor)
  if (start < 0) throw new ApiError(400)
  return { items: items.slice(start, start + 2), next_cursor: items[start + 2]?.id ?? null }
}
/** 合成写操作共用授权与幂等边界，模拟回执不落盘，也不代表服务端持久幂等。 */
export function createReviewBoundary(allowed: () => boolean) {
  const receipts = new Map<string, { fingerprint: string; value: unknown }>()
  async function authorize(signal: AbortSignal) {
    signal.throwIfAborted()
    if (!mockEnabled) throw new ApiError(503)
    if (!allowed()) throw new ApiError(403)
    await Promise.resolve()
    signal.throwIfAborted()
    if (!allowed()) throw new ApiError(403)
  }
  async function command<T>(
    resource: string,
    input: unknown,
    key: string,
    signal: AbortSignal,
    parse: (value: unknown) => T,
    execute: () => T,
  ): Promise<T> {
    await authorize(signal)
    if (!key.trim()) throw new ApiError(400)
    const fingerprint = JSON.stringify([resource, input])
    const previous = receipts.get(key)
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new ApiError(409)
      return parse(previous.value)
    }
    const value = parse(execute())
    receipts.set(key, { fingerprint, value })
    return parse(value)
  }
  return { authorize, command }
}
