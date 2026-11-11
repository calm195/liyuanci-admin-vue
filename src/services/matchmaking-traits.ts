import { record } from '@/types/admin'
import { ApiError } from './admin'
import { MatchmakingError } from './matchmaking'
import type {
  Trait,
  TraitDetail,
  TraitFilters,
  TraitReviewCommand,
  TraitStatus,
  TraitWord,
} from '@/types/matchmaking-traits'

const invalid = () => new Error('特质响应格式异常，请重新读取')
function object(value: unknown) {
  if (!record(value)) throw invalid()
  return value
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw invalid()
  return value
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw invalid()
  return value
}
function id(value: unknown): string {
  const v = text(value)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(v)) throw invalid()
  return v
}
function status(value: unknown): TraitStatus {
  if (value !== 'approved' && value !== 'pending' && value !== 'rejected') throw invalid()
  return value
}
function array<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw invalid()
  return value.map(parse)
}
function word(value: unknown): TraitWord {
  const v = object(value)
  return { id: id(v['id']), name: text(v['name']), heat: count(v['heat']) }
}
function trait(value: unknown): Trait {
  const v = object(value)
  return {
    ...word(v),
    version: count(v['version']),
    status: status(v['status']),
    male_count: count(v['male_count']),
    female_count: count(v['female_count']),
    undisclosed_count: count(v['undisclosed_count']),
    created_at: text(v['created_at']),
    reason: text(v['reason']),
  }
}
export function parseTraitPage(value: unknown) {
  const v = object(value)
  return { items: array(v['items'], trait), total: count(v['total']) }
}
export function parseTraitCloud(value: unknown) {
  const v = object(value)
  return { items: array(v['items'], word), total: count(v['total']) }
}
export function parseTraitDetail(value: unknown): TraitDetail {
  const v = object(value),
    evidence = object(v['evidence'])
  const out: TraitDetail = {
    ...trait(v),
    evidence: {
      routes: array(evidence['routes'], text),
      matches: array(evidence['matches'], (item) => {
        const m = object(item)
        return {
          word: text(m['word']),
          source: text(m['source']),
          kind: text(m['kind']),
          disposition: text(m['disposition']),
          start: count(m['start']),
          end: count(m['end']),
          ...(m['label'] === undefined ? {} : { label: text(m['label']) }),
          ...(m['field'] === undefined ? {} : { field: text(m['field']) }),
        }
      }),
    },
  }
  if (evidence['truncated'] !== undefined) {
    if (typeof evidence['truncated'] !== 'boolean') throw invalid()
    out.evidence.truncated = evidence['truncated']
  }
  if (v['reviewed_at'] !== undefined) out.reviewed_at = text(v['reviewed_at'])
  if (v['reviewed_by'] !== undefined) out.reviewed_by = text(v['reviewed_by'])
  return out
}
export function traitQuery(filters: TraitFilters, page?: number): string {
  const params = new URLSearchParams()
  params.set('status', filters.status)
  params.set('purpose', filters.purpose)
  params.set('sort', filters.sort)
  if (filters.q.trim()) params.set('q', filters.q.trim())
  if (filters.gender) params.set('gender', filters.gender)
  for (const key of ['min_heat', 'max_heat'] as const) {
    if (filters[key] === '') continue
    if (!/^\d+$/u.test(filters[key]) || !Number.isSafeInteger(Number(filters[key])))
      throw new Error('热度须为非负整数')
    params.set(key, filters[key])
  }
  if (
    filters.min_heat !== '' &&
    filters.max_heat !== '' &&
    Number(filters.min_heat) > Number(filters.max_heat)
  )
    throw new Error('最低热度不能大于最高热度')
  params.set('limit', page === undefined ? '100' : '20')
  if (page !== undefined) params.set('page', String(page))
  return params.toString()
}
export function createTraitClient(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch = fetch,
) {
  async function request(suffix: string, signal: AbortSignal, command?: TraitReviewCommand) {
    if (!allowed()) throw new ApiError(403)
    const response = await transport(`/api/v1/admin/matchmaking/traits${suffix}`, {
      signal,
      method: command ? 'POST' : 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(command ? { 'Content-Type': 'application/json', 'Idempotency-Key': command.key } : {}),
      },
      ...(command ? { body: JSON.stringify(command.body) } : {}),
    })
    signal.throwIfAborted()
    if (!allowed()) throw new ApiError(403)
    const raw: unknown = await response.json().catch(() => undefined)
    signal.throwIfAborted()
    if (!allowed()) throw new ApiError(403)
    if (!response.ok)
      throw new MatchmakingError(
        response.status,
        record(raw) && typeof raw['error_code'] === 'string' ? raw['error_code'] : '',
      )
    const root = object(raw)
    if (root['code'] !== 0) throw invalid()
    return root['data']
  }
  return {
    async list(filters: TraitFilters, page: number, signal: AbortSignal) {
      return parseTraitPage(await request(`?${traitQuery(filters, page)}`, signal))
    },
    async cloud(filters: TraitFilters, signal: AbortSignal) {
      return parseTraitCloud(await request(`/cloud?${traitQuery(filters)}`, signal))
    },
    async detail(traitID: string, signal: AbortSignal) {
      const result = parseTraitDetail(await request(`/${id(traitID)}`, signal))
      if (result.id !== traitID) throw invalid()
      return result
    },
    async review(command: TraitReviewCommand, signal: AbortSignal) {
      const result = object(await request(`/${id(command.id)}/review`, signal, command))
      if (id(result['id']) !== command.id) throw invalid()
    },
  }
}
