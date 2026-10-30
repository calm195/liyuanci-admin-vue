import { ApiError } from './admin'
import { record } from '@/types/admin'
import { resourceStatuses } from '@/types/resources'
import type {
  AdminResourceCategory,
  ResourceBase,
  ResourceCategory,
  ResourceDetail,
  ResourceFilters,
  ResourceInput,
  ResourcePage,
  ResourceSummary,
  ResourcesClient,
} from '@/types/resources'

function invalid(): never {
  throw new Error('资料数据不符合契约，请重试或联系管理员')
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
function integer(value: unknown, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    return invalid()
  return value
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') return invalid()
  return value
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  for (const item of choices) if (value === item) return item
  return invalid()
}
export function resourceId(value: unknown): string {
  const id = text(value)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(id)) return invalid()
  return id
}
function date(value: unknown): string {
  const result = text(value)
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(result) ||
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString().slice(0, 19) !== result.slice(0, 19)
  )
    return invalid()
  return result
}
function isControl(char: string) {
  const point = char.codePointAt(0) ?? 0
  return point < 32 || (point >= 127 && point <= 159) || point === 0x2028 || point === 0x2029
}
const spaces =
  '[\\u0009-\\u000d\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]'
const edges = new RegExp(`^${spaces}+|${spaces}+$`, 'gu')
const internalSpace = new RegExp(spaces, 'u')
type TextKind =
  'title' | 'name' | 'description' | 'download_url' | 'extraction_code' | 'q' | 'reason'
/** 精确保留协议允许的内部字符与链接原串，仅裁去约定的首尾空白。 */
export function normalizeResourceText(
  kind: Exclude<TextKind, 'extraction_code'>,
  value: unknown,
): string
export function normalizeResourceText(kind: 'extraction_code', value: unknown): string | null
export function normalizeResourceText(kind: TextKind, value: unknown): string | null {
  const original =
    value === null && (kind === 'description' || kind === 'extraction_code') ? '' : text(value)
  if (/[\ud800-\udfff]/u.test(original)) return invalid()
  const result = (kind === 'description' ? original.replace(/\r\n?/gu, '\n') : original).replace(
    edges,
    '',
  )
  if (kind === 'download_url') {
    if (
      !result ||
      new TextEncoder().encode(result).length > 2048 ||
      internalSpace.test(result) ||
      [...result].some((char) => isControl(char) || char === '\\') ||
      /%(?![a-f0-9]{2})/iu.test(result)
    )
      return invalid()
    const authority = /^https?:\/\/([^/?#]+)/iu.exec(result)?.[1]
    if (!authority || authority.includes('@') || authority.endsWith(':')) return invalid()
    try {
      const url = new URL(result)
      if (!url.hostname || (url.port && (+url.port < 1 || +url.port > 65535))) return invalid()
    } catch {
      return invalid()
    }
    return result
  }
  const limits = {
    title: [1, 100],
    name: [1, 30],
    description: [0, 2000],
    extraction_code: [0, 64],
    q: [0, 100],
    reason: [1, 500],
  } as const
  const [low, high] = limits[kind]
  const size = [...result].length
  const multiline = kind === 'description' || kind === 'reason'
  if (
    size < low ||
    size > high ||
    [...result].some((char) => isControl(char) && !(multiline && (char === '\n' || char === '\t')))
  )
    return invalid()
  return kind === 'extraction_code' && !result ? null : result
}
function canonical(kind: Exclude<TextKind, 'extraction_code'>, value: unknown): string {
  const result = normalizeResourceText(kind, value)
  if (result !== value) return invalid()
  return result
}
function categoryBase(data: Record<string, unknown>): ResourceCategory {
  return {
    id: resourceId(data['id']),
    name: canonical('name', data['name']),
  }
}
export function parseResourceCategory(value: unknown): AdminResourceCategory {
  const data = object(value, [
    'id',
    'name',
    'sort_order',
    'enabled',
    'version',
    'created_at',
    'updated_at',
  ])
  return {
    ...categoryBase(data),
    sort_order: integer(data['sort_order'], 0, 9999),
    enabled: bool(data['enabled']),
    version: integer(data['version']),
    created_at: date(data['created_at']),
    updated_at: date(data['updated_at']),
  }
}
const baseFields = [
  'id',
  'title',
  'category',
  'version',
  'content_version',
  'status',
  'created_at',
  'updated_at',
  'published_at',
  'visibility_blocked',
  'feedback_summary',
  'allowed_actions',
]
function base(data: Record<string, unknown>): ResourceBase {
  const status = choice(data['status'], resourceStatuses)
  const content_version = integer(data['content_version'])
  const version = integer(data['version'])
  const visibility_blocked = bool(data['visibility_blocked'])
  const published_at = data['published_at'] === null ? null : date(data['published_at'])
  const counts = object(data['feedback_summary'], [
    'content_version',
    'valid',
    'link_invalid',
    'outdated',
    'incomplete',
    'total',
  ])
  const feedback_summary = {
    content_version: integer(counts['content_version']),
    valid: integer(counts['valid'], 0),
    link_invalid: integer(counts['link_invalid'], 0),
    outdated: integer(counts['outdated'], 0),
    incomplete: integer(counts['incomplete'], 0),
    total: integer(counts['total'], 0),
  }
  const actions = data['allowed_actions']
  if (!Array.isArray(actions)) return invalid()
  const allowed_actions = actions.map((item) =>
    choice(item, ['update', 'publish', 'offline'] as const),
  )
  const expected =
    status === 'published' ? ['offline'] : visibility_blocked ? ['update'] : ['update', 'publish']
  if (
    content_version > version ||
    feedback_summary.content_version !== content_version ||
    feedback_summary.total !==
      feedback_summary.valid +
        feedback_summary.link_invalid +
        feedback_summary.outdated +
        feedback_summary.incomplete ||
    JSON.stringify(allowed_actions) !== JSON.stringify(expected) ||
    (status === 'draft' && published_at !== null) ||
    (status === 'published' && (published_at === null || visibility_blocked))
  )
    return invalid()
  return {
    id: resourceId(data['id']),
    title: canonical('title', data['title']),
    category: categoryBase(object(data['category'], ['id', 'name'])),
    version,
    content_version,
    status,
    created_at: date(data['created_at']),
    updated_at: date(data['updated_at']),
    published_at,
    visibility_blocked,
    feedback_summary,
    allowed_actions,
  }
}
export function parseResourceSummary(value: unknown): ResourceSummary {
  const data = object(value, [...baseFields, 'description_excerpt'])
  const excerpt = text(data['description_excerpt'])
  if ([...excerpt].length > 120 || /[\ud800-\udfff]/u.test(excerpt)) return invalid()
  return { ...base(data), description_excerpt: excerpt }
}
export function parseResourceDetail(value: unknown): ResourceDetail {
  const data = object(value, [...baseFields, 'description', 'download_url', 'extraction_code'])
  const code = normalizeResourceText('extraction_code', data['extraction_code'])
  if (code !== data['extraction_code']) return invalid()
  return {
    ...base(data),
    description: canonical('description', data['description']),
    download_url: canonical('download_url', data['download_url']),
    extraction_code: code,
  }
}
export function parseResourcePage<T>(
  value: unknown,
  parse: (value: unknown) => T,
  max: number,
): ResourcePage<T> {
  const data = object(value, ['items', 'next_cursor'])
  const cursor = data['next_cursor'] === null ? null : text(data['next_cursor'])
  if (
    !Array.isArray(data['items']) ||
    data['items'].length > max ||
    (cursor !== null && (!cursor || [...cursor].length > 2048))
  )
    return invalid()
  return { items: data['items'].map(parse), next_cursor: cursor }
}
export function normalizeResourceInput(input: ResourceInput): ResourceInput {
  return {
    title: normalizeResourceText('title', input.title),
    category_id: resourceId(input.category_id),
    description: normalizeResourceText('description', input.description),
    download_url: normalizeResourceText('download_url', input.download_url),
    extraction_code: normalizeResourceText('extraction_code', input.extraction_code),
  }
}
export function normalizeResourceFilters(input: ResourceFilters): ResourceFilters {
  return {
    q: normalizeResourceText('q', input.q),
    category_id: input.category_id ? resourceId(input.category_id) : '',
    status: input.status ? choice(input.status, resourceStatuses) : '',
    limit: integer(input.limit, 1, 50),
  }
}
export class ResourceApiError extends ApiError {
  constructor(
    status: number,
    public errorCode: string,
  ) {
    super(status)
  }
}
export function resourceErrorMessage(error: unknown): string {
  if (error instanceof ResourceApiError) {
    const messages: Record<string, string> = {
      VALIDATION_FAILED: '字段或分页已失效，请检查输入或从首页重新查询',
      NOT_FOUND: '资料或分类已不可访问，旧内容已清除',
      VERSION_CONFLICT: '版本已变化，请重新读取并核对后再操作',
      STATE_CONFLICT: '当前状态不允许此操作，请重新读取核对',
      IDEMPOTENCY_CONFLICT: '操作标识与输入冲突，请重新读取核对，勿直接重复提交',
      CATEGORY_IN_USE: '分类仍被资料引用，无法停用；请查看该分类资料',
      CATEGORY_NAME_CONFLICT: '分类名称已存在，请修改名称',
      PAYLOAD_TOO_LARGE: '提交内容过大，请缩短输入',
      UNSUPPORTED_MEDIA_TYPE: '提交格式不受支持，请联系管理员',
      RATE_LIMITED: '操作过于频繁，请稍后重试',
      INTERNAL_ERROR: '服务异常，结果尚未确认，可原样重试',
      DEPENDENCY_UNAVAILABLE: '服务暂不可用，结果尚未确认，可原样重试',
    }
    return messages[error.errorCode] ?? '会话或权限已变化，请重新登录'
  }
  return error instanceof Error && error.message.startsWith('资料数据')
    ? error.message
    : '请求结果尚未确认，请原样重试或重新读取核对'
}
const errors: Record<number, readonly string[]> = {
  400: ['VALIDATION_FAILED'],
  401: ['UNAUTHENTICATED'],
  403: ['FORBIDDEN'],
  404: ['NOT_FOUND'],
  409: [
    'VERSION_CONFLICT',
    'STATE_CONFLICT',
    'IDEMPOTENCY_CONFLICT',
    'CATEGORY_IN_USE',
    'CATEGORY_NAME_CONFLICT',
  ],
  413: ['PAYLOAD_TOO_LARGE'],
  415: ['UNSUPPORTED_MEDIA_TYPE'],
  429: ['RATE_LIMITED'],
  500: ['INTERNAL_ERROR'],
  503: ['DEPENDENCY_UNAVAILABLE'],
}
/** 在 JSON 解码前保留数字词法及重复字段信息，避免解析后静默丢失协议错误。 */
export function parseResourceJson(source: string): unknown {
  const value: unknown = JSON.parse(source)
  const tokens =
    source.match(
      /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\]:,]/gu,
    ) ?? []
  const stack: (Set<string> | null)[] = []
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (!token) return invalid()
    if (token === '{') stack.push(new Set())
    else if (token === '[') stack.push(null)
    else if (token === '}' || token === ']') stack.pop()
    else if (token.startsWith('"') && tokens[index + 1] === ':') {
      const key: unknown = JSON.parse(token)
      const names = stack.at(-1)
      if (typeof key !== 'string' || !names || names.has(key)) return invalid()
      names.add(key)
    } else if (
      /^-?\d/u.test(token) &&
      (!/^-?\d+$/u.test(token) || !Number.isSafeInteger(Number(token)))
    )
      return invalid()
  }
  return value
}
export function createResourcesClient(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch = fetch,
): ResourcesClient {
  function guard(signal: AbortSignal) {
    signal.throwIfAborted()
    if (!token) throw new ApiError(401)
    if (!allowed()) throw new ApiError(403)
  }
  async function request(
    path: string,
    signal: AbortSignal,
    init: RequestInit = {},
    status = 200,
  ): Promise<unknown> {
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
    // 失权响应即使正文损坏也先清理当前工作区，不能保留旧资料。
    if (response.status === 401 || response.status === 403)
      throw new ResourceApiError(
        response.status,
        response.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      )
    const raw = parseResourceJson(await response.text())
    guard(signal)
    const success = response.status === status
    const envelope = object(
      raw,
      success
        ? ['code', 'message', 'data', 'request_id']
        : ['code', 'message', 'error_code', 'request_id'],
    )
    if (
      typeof envelope['message'] !== 'string' ||
      !text(envelope['request_id']) ||
      !response.headers
        .get('Cache-Control')
        ?.split(',')
        .some((v) => v.trim().toLowerCase() === 'no-store')
    )
      return invalid()
    if (!success) {
      if (
        envelope['code'] !== response.status ||
        !errors[response.status]?.includes(text(envelope['error_code']))
      )
        return invalid()
      const method = init.method ?? 'GET'
      const collection = path.split('?')[0]?.split('/') ?? []
      const category = collection[0] === 'resource-categories'
      const targeted = collection.length > 1
      const code = text(envelope['error_code'])
      if (
        (response.status === 404 && !targeted && !(method === 'POST' && !category)) ||
        ([409, 413, 415].includes(response.status) && method === 'GET')
      )
        return invalid()
      if (response.status === 409) {
        const allowedCodes = category
          ? targeted
            ? [
                'IDEMPOTENCY_CONFLICT',
                'VERSION_CONFLICT',
                'CATEGORY_NAME_CONFLICT',
                'CATEGORY_IN_USE',
              ]
            : ['IDEMPOTENCY_CONFLICT', 'CATEGORY_NAME_CONFLICT']
          : targeted
            ? ['IDEMPOTENCY_CONFLICT', 'VERSION_CONFLICT', 'STATE_CONFLICT']
            : ['IDEMPOTENCY_CONFLICT', 'STATE_CONFLICT']
        if (!allowedCodes.includes(code)) return invalid()
      }
      throw new ResourceApiError(response.status, code)
    }
    if (envelope['code'] !== 0) return invalid()
    return envelope['data']
  }
  function command(body: unknown, key: string, method = 'POST'): RequestInit {
    if (!/^[\u0021-\u007e]{1,128}$/u.test(key)) return invalid()
    const serialized = JSON.stringify(body)
    if (new TextEncoder().encode(serialized).length > 65536) return invalid()
    return {
      method,
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: serialized,
    }
  }
  function query(cursor: string | null, limit: number) {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor !== null) {
      if (!cursor || [...cursor].length > 2048) return invalid()
      params.set('cursor', cursor)
    }
    return params
  }
  async function detailResult(
    path: string,
    target: string | null,
    signal: AbortSignal,
    init?: RequestInit,
    status?: number,
  ) {
    const value = parseResourceDetail(await request(path, signal, init, status))
    if (target && value.id !== target) return invalid()
    return value
  }
  async function categoryResult(
    path: string,
    target: string | null,
    signal: AbortSignal,
    init?: RequestInit,
    status?: number,
  ) {
    const value = parseResourceCategory(await request(path, signal, init, status))
    if (target && value.id !== target) return invalid()
    return value
  }
  return {
    async list(filters, cursor, signal) {
      const values = normalizeResourceFilters(filters),
        params = query(cursor, values.limit)
      for (const key of ['q', 'category_id', 'status'] as const)
        if (values[key]) params.set(key, values[key])
      return parseResourcePage(
        await request(`resources?${params}`, signal),
        parseResourceSummary,
        values.limit,
      )
    },
    detail(id, signal) {
      const target = resourceId(id)
      return detailResult(`resources/${target}`, target, signal)
    },
    create(input, key, signal) {
      return detailResult(
        'resources',
        null,
        signal,
        command(normalizeResourceInput(input), key),
        201,
      )
    },
    update(id, input, key, signal) {
      const target = resourceId(id)
      return detailResult(
        `resources/${target}/content`,
        target,
        signal,
        command(
          { ...normalizeResourceInput(input), expected_version: integer(input.expected_version) },
          key,
          'PUT',
        ),
      )
    },
    publish(id, version, key, signal) {
      const target = resourceId(id)
      return detailResult(
        `resources/${target}/publish`,
        target,
        signal,
        command({ expected_version: integer(version) }, key),
      )
    },
    offline(id, version, reason, key, signal) {
      const target = resourceId(id)
      return detailResult(
        `resources/${target}/offline`,
        target,
        signal,
        command(
          { expected_version: integer(version), reason: normalizeResourceText('reason', reason) },
          key,
        ),
      )
    },
    async categories(enabled, cursor, signal) {
      const params = query(cursor, 100)
      if (enabled !== null) params.set('enabled', String(bool(enabled)))
      return parseResourcePage(
        await request(`resource-categories?${params}`, signal),
        parseResourceCategory,
        100,
      )
    },
    category(id, signal) {
      const target = resourceId(id)
      return categoryResult(`resource-categories/${target}`, target, signal)
    },
    createCategory(input, key, signal) {
      return categoryResult(
        'resource-categories',
        null,
        signal,
        command(
          {
            name: normalizeResourceText('name', input.name),
            sort_order: integer(input.sort_order, 0, 9999),
          },
          key,
        ),
        201,
      )
    },
    updateCategory(id, input, key, signal) {
      const target = resourceId(id)
      return categoryResult(
        `resource-categories/${target}`,
        target,
        signal,
        command(
          {
            name: normalizeResourceText('name', input.name),
            sort_order: integer(input.sort_order, 0, 9999),
            enabled: bool(input.enabled),
            expected_version: integer(input.expected_version),
          },
          key,
          'PUT',
        ),
      )
    },
  }
}
