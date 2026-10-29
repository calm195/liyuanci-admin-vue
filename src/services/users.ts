import { ApiError } from './admin'
import { record } from '@/types/admin'
import { restrictionActions, restrictions, userActions, verifications } from '@/types/users'
import type {
  UserRestrictionState,
  ActivePenalty,
  UserDetail,
  UserFilters,
  UserPage,
  UserPenalty,
  UserSummary,
  UsersClient,
} from '@/types/users'

function invalid(): never {
  throw new Error('用户管理数据不符合契约，请重试或联系管理员')
}
function object(value: unknown, fields: readonly string[]) {
  if (
    !record(value) ||
    Object.keys(value).some((key) => !fields.includes(key)) ||
    fields.some((key) => !(key in value))
  )
    return invalid()
  return value
}
function text(value: unknown): string {
  if (typeof value !== 'string') return invalid()
  return value
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value)
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  for (const item of values) if (value === item) return item
  return invalid()
}
export function userId(value: unknown): string {
  const id = text(value)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)) return invalid()
  return id.toLowerCase()
}
function date(value: unknown): string {
  const result = text(value)
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    return invalid()
  return result
}
function nullableDate(value: unknown) {
  return value === null ? null : date(value)
}
const summaryFields = [
  'id',
  'display_name',
  'verification',
  'restriction',
  'muted_until',
  'created_at',
  'as_of',
]
function summary(data: Record<string, unknown>): UserSummary {
  const restriction = choice(data['restriction'], restrictions)
  const muted_until = nullableDate(data['muted_until'])
  if ((restriction === 'muted') !== (muted_until !== null)) return invalid()
  return {
    id: userId(data['id']),
    display_name: nullableText(data['display_name']),
    verification: choice(data['verification'], verifications),
    restriction,
    muted_until,
    created_at: date(data['created_at']),
    as_of: date(data['as_of']),
  }
}
export function parseUser(value: unknown): UserSummary {
  return summary(object(value, summaryFields))
}
function active(value: unknown): ActivePenalty {
  const data = object(value, ['id', 'kind', 'starts_at', 'ends_at'])
  const kind = choice(data['kind'], ['mute', 'ban'])
  const ends_at = nullableDate(data['ends_at'])
  if ((kind === 'mute') !== (ends_at !== null)) return invalid()
  return { id: userId(data['id']), kind, starts_at: date(data['starts_at']), ends_at }
}
export function parseUserDetail(value: unknown): UserDetail {
  const data = object(value, [
    ...summaryFields,
    'account_version',
    'active_penalties',
    'allowed_actions',
  ])
  const version = data['account_version']
  if (
    typeof version !== 'number' ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !Array.isArray(data['active_penalties']) ||
    !Array.isArray(data['allowed_actions'])
  )
    return invalid()
  const actions = data['allowed_actions'].map((value) => choice(value, userActions))
  if (new Set(actions).size !== actions.length) return invalid()
  return {
    ...summary(data),
    account_version: version,
    active_penalties: data['active_penalties'].map(active),
    allowed_actions: actions,
  }
}
export function parseUserPenalty(value: unknown): UserPenalty {
  const data = object(value, [
    'id',
    'level',
    'kind',
    'status',
    'starts_at',
    'ends_at',
    'revoked_at',
    'reason',
    'case_link',
    'appeal_id',
  ])
  const level = choice(data['level'], ['minor', 'general', 'severe'])
  const kind = choice(data['kind'], ['warning', 'mute', 'ban'])
  const status = choice(data['status'], ['active', 'expired', 'revoked'])
  const ends_at = nullableDate(data['ends_at'])
  const revoked_at = nullableDate(data['revoked_at'])
  if (
    { minor: 'warning', general: 'mute', severe: 'ban' }[level] !== kind ||
    (kind === 'mute') !== (ends_at !== null) ||
    (status === 'revoked') !== (revoked_at !== null) ||
    (status === 'expired' && kind !== 'mute')
  )
    return invalid()
  const link = data['case_link'] === null ? null : object(data['case_link'], ['kind', 'id'])
  return {
    id: userId(data['id']),
    level,
    kind,
    status,
    starts_at: date(data['starts_at']),
    ends_at,
    revoked_at,
    reason: nullableText(data['reason']),
    case_link:
      link === null
        ? null
        : {
            kind: choice(link['kind'], ['ordinary_report', 'ordinary_review']),
            id: userId(link['id']),
          },
    appeal_id: data['appeal_id'] === null ? null : userId(data['appeal_id']),
  }
}
export function parseUserPage<T>(value: unknown, parse: (item: unknown) => T): UserPage<T> {
  const data = object(value, ['items', 'next_cursor'])
  if (!Array.isArray(data['items'])) return invalid()
  const cursor = nullableText(data['next_cursor'])
  if (cursor === '') return invalid()
  return { items: data['items'].map(parse), next_cursor: cursor }
}
export function parseUserRestrictionState(value: unknown): UserRestrictionState {
  const data = object(value, [
    'user_id',
    'account_version',
    'banned',
    'muted',
    'muted_until',
    'as_of',
    'allowed_actions',
  ])
  const version = data['account_version']
  if (
    typeof version !== 'number' ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    typeof data['banned'] !== 'boolean' ||
    typeof data['muted'] !== 'boolean' ||
    !Array.isArray(data['allowed_actions'])
  )
    return invalid()
  const muted_until = nullableDate(data['muted_until'])
  const actions = data['allowed_actions'].map((value) => choice(value, restrictionActions))
  if (
    (muted_until !== null) !== data['muted'] ||
    new Set(actions).size !== actions.length ||
    actions.some(
      (action) =>
        (action === 'ban' && data['banned']) ||
        (action === 'unban' && !data['banned']) ||
        (action === 'mute' && data['muted']) ||
        (action === 'unmute' && !data['muted']),
    )
  )
    return invalid()
  return {
    user_id: userId(data['user_id']),
    account_version: version,
    banned: data['banned'],
    muted: data['muted'],
    muted_until,
    as_of: date(data['as_of']),
    allowed_actions: actions,
  }
}
/** 只裁去协议指定的 White_Space；FEFF 和零宽字符仍属于关键词。 */
export function normalizeNickname(value: string): string {
  const spaces = new Set([
    9, 10, 11, 12, 13, 32, 133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200,
    8201, 8202, 8232, 8233, 8239, 8287, 12288,
  ])
  let start = 0
  let end = value.length
  while (start < end && spaces.has(value.charCodeAt(start))) start++
  while (end > start && spaces.has(value.charCodeAt(end - 1))) end--
  const result = value.slice(start, end)
  if ([...result].length > 50) throw new Error('昵称关键词最多为50个字符')
  return result
}
export function normalizeUserFilters(filters: UserFilters): UserFilters {
  if (!Number.isInteger(filters.limit) || filters.limit < 1 || filters.limit > 50)
    throw new Error('每页数量应为1至50')
  return {
    user_id: filters.user_id.trim() ? userId(filters.user_id.trim()) : '',
    nickname: normalizeNickname(filters.nickname),
    verification: filters.verification === '' ? '' : choice(filters.verification, verifications),
    restriction: filters.restriction === '' ? '' : choice(filters.restriction, restrictions),
    limit: filters.limit,
  }
}
export function createUsersClient(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch = fetch,
): UsersClient {
  function guard(signal: AbortSignal) {
    signal.throwIfAborted()
    if (!token.trim()) throw new ApiError(401)
    if (!allowed()) throw new ApiError(403)
  }
  async function request(path: string, signal: AbortSignal, init: RequestInit = {}) {
    guard(signal)
    const response = await transport(`/api/v1/admin/users${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    })
    guard(signal)
    if (response.status !== 200) throw new ApiError(response.status)
    const raw: unknown = await response.json()
    guard(signal)
    const envelope = object(raw, ['code', 'message', 'data', 'request_id'])
    if (
      envelope['code'] !== 0 ||
      typeof envelope['message'] !== 'string' ||
      typeof envelope['request_id'] !== 'string' ||
      !envelope['request_id'] ||
      response.headers.get('X-Request-ID') !== envelope['request_id'] ||
      !response.headers
        .get('Cache-Control')
        ?.split(',')
        .some((value) => value.trim().toLowerCase() === 'no-store')
    )
      return invalid()
    return envelope['data']
  }
  function pageQuery(cursor: string | null) {
    const query = new URLSearchParams({ limit: '20' })
    if (cursor !== null) {
      if (!cursor) return invalid()
      query.set('cursor', cursor)
    }
    return query
  }
  async function restrictionResult(
    path: string,
    target: string,
    signal: AbortSignal,
    init?: RequestInit,
  ) {
    const result = parseUserRestrictionState(await request(path, signal, init))
    if (result.user_id !== target) return invalid()
    return result
  }
  return {
    async restrictions(id, signal) {
      const target = userId(id)
      return restrictionResult(`/${target}/restrictions`, target, signal)
    },
    async changeRestriction(id, action, input, key, signal) {
      const target = userId(id)
      const selected = choice(action, restrictionActions)
      if (
        !input.reason.trim() ||
        new TextEncoder().encode(input.reason.trim()).length > 2000 ||
        !Number.isSafeInteger(input.expected_version) ||
        input.expected_version < 1 ||
        !key.trim()
      )
        throw new Error('请填写有效理由并重新核对用户状态')
      return restrictionResult(`/${target}/restrictions/${selected}`, target, signal, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          reason: input.reason.trim(),
          expected_version: input.expected_version,
        }),
      })
    },
    async users(filters, cursor, signal) {
      const normalized = normalizeUserFilters(filters)
      const query = pageQuery(cursor)
      query.set('limit', String(normalized.limit))
      for (const key of ['user_id', 'nickname', 'verification', 'restriction'] as const)
        if (normalized[key]) query.set(key, normalized[key])
      return parseUserPage(await request(`?${query}`, signal), parseUser)
    },
    async user(id, signal) {
      const target = userId(id)
      const result = parseUserDetail(await request(`/${target}`, signal))
      if (result.id !== target) return invalid()
      return result
    },
    async userPenalties(id, cursor, signal) {
      return parseUserPage(
        await request(`/${userId(id)}/penalties?${pageQuery(cursor)}`, signal),
        parseUserPenalty,
      )
    },
  }
}
