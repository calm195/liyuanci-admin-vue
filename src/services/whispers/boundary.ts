import { record } from '@/types/admin'

function invalid(): never {
  throw new Error('树洞数据不符合契约')
}
export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!record(value) || Object.keys(value).some((key) => !keys.includes(key))) invalid()
  return value
}
export function text(
  value: unknown,
  rules: { minLength?: number; maxLength?: number; pattern?: string; format?: string } = {},
): string {
  if (
    typeof value !== 'string' ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
  )
    invalid()
  const length = [...value].length
  if (length < (rules.minLength ?? 0) || length > (rules.maxLength ?? Infinity)) invalid()
  if (rules.pattern && !new RegExp(rules.pattern, 'u').test(value)) invalid()
  if (rules.format === 'date-time') {
    const time = Date.parse(value)
    if (!Number.isFinite(time) || new Date(time).toISOString().replace('.000Z', 'Z') !== value)
      invalid()
  }
  return value
}
export function integer(value: unknown, minimum = 1): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) invalid()
  return value
}
export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid()
  return value
}
export function choice<const T extends string>(value: unknown, options: readonly T[]): T {
  const result = options.find((item) => item === value)
  if (result === undefined) invalid()
  return result
}
export function literal<const T extends string | number>(value: unknown, expected: T): T {
  if (value !== expected) invalid()
  return expected
}
export function array<T>(value: unknown, parse: (item: unknown) => T, unique = false): T[] {
  if (!Array.isArray(value)) invalid()
  const result = value.map((item: unknown) => parse(item))
  if (unique && new Set(result).size !== result.length) invalid()
  return result
}
export function empty(value: unknown): never[] {
  if (!Array.isArray(value) || value.length !== 0) invalid()
  return []
}
export function uuid(value: unknown): string {
  return text(value, { pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' })
}
