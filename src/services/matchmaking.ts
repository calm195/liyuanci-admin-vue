import { ApiError } from './admin'
import { record } from '@/types/admin'
import {
  activityPhases,
  activityStatuses,
  enrollmentStatuses,
  pairStatuses,
} from '@/types/matchmaking'
import type {
  Activity,
  ActivityPage,
  Candidate,
  Enrollment,
  LibraryPage,
  LibraryTask,
  Pair,
  PendingCommand,
  Profile,
  ScoreDetails,
  TaskTemplate,
  Workspace,
} from '@/types/matchmaking'

const invalid = () => new Error('包分配响应格式异常，请刷新或联系维护人员')
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
function object(value: unknown) {
  if (!record(value)) throw invalid()
  return value
}
function text(value: unknown, max = 2000): string {
  if (typeof value !== 'string' || [...value].length > max) throw invalid()
  return value
}
function identifier(value: unknown): string {
  const result = text(value, 36)
  if (!uuid.test(result)) throw invalid()
  return result
}
function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw invalid()
  return value
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const result = number(value, min, max)
  if (!Number.isSafeInteger(result)) throw invalid()
  return result
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw invalid()
  return value
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  const result = choices.find((item) => item === value)
  if (result === undefined) throw invalid()
  return result
}
function list<T>(value: unknown, parse: (item: unknown) => T, max = 1000): T[] {
  if (!Array.isArray(value) || value.length > max) throw invalid()
  return value.map((item: unknown) => parse(item))
}
function unique<T extends { id: string }>(items: T[]): T[] {
  if (new Set(items.map((item) => item.id)).size !== items.length) throw invalid()
  return items
}
function timestamp(value: unknown): string {
  const result = text(value, 40)
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/u.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    throw invalid()
  return result
}
function envelope(value: unknown) {
  const root = object(value)
  if (
    root['code'] !== 0 ||
    typeof root['message'] !== 'string' ||
    typeof root['request_id'] !== 'string'
  )
    throw invalid()
  return object(root['data'])
}
function activity(value: unknown): Activity {
  const v = object(value)
  const out: Activity = {
    id: identifier(v['id']),
    version: integer(v['version'], 1),
    expected_version: integer(v['expected_version'] ?? 0),
    title: text(v['title'], 80),
    description: text(v['description']),
    campuses: list(
      v['campuses'],
      (c) => choice(c, ['wushan', 'university_town', 'international']),
      3,
    ),
    registration_opens_at: timestamp(v['registration_opens_at']),
    registration_closes_at: timestamp(v['registration_closes_at']),
    results_at: timestamp(v['results_at']),
    starts_at: timestamp(v['starts_at']),
    ends_at: timestamp(v['ends_at']),
    days: integer(v['days'], 1, 30),
    status: choice(v['status'], activityStatuses),
    phase: choice(v['phase'], activityPhases),
  }
  const dates = [
    out.registration_opens_at,
    out.registration_closes_at,
    out.results_at,
    out.starts_at,
    out.ends_at,
  ].map(Date.parse)
  if (
    !out.title.trim() ||
    !out.description.trim() ||
    new Set(out.campuses).size !== out.campuses.length ||
    dates.some((value, index) => index > 0 && value < (dates[index - 1] ?? value)) ||
    out.registration_opens_at === out.registration_closes_at ||
    out.starts_at === out.ends_at ||
    (out.status === 'draft') !== (out.phase === 'draft') ||
    (out.status === 'cancelled') !== (out.phase === 'cancelled')
  )
    throw invalid()
  return out
}
function profile(value: unknown): Profile {
  const v = object(value)
  const out: Profile = {
    name: text(v['name'], 32),
    gender: choice(v['gender'], ['male', 'female']),
    education: text(v['education'], 32),
    grade: text(v['grade'], 32),
    campus: choice(v['campus'], ['wushan', 'university_town', 'international']),
    mbti: choice(v['mbti'], [
      '',
      'INFP',
      'ENFP',
      'INFJ',
      'ENFJ',
      'INTJ',
      'ENTJ',
      'INTP',
      'ENTP',
      'ISFP',
      'ESFP',
      'ISTP',
      'ESTP',
      'ISFJ',
      'ESFJ',
      'ISTJ',
      'ESTJ',
    ]),
    age: integer(v['age'], 18, 80),
    age_min: integer(v['age_min'], 18, 80),
    age_max: integer(v['age_max'], 18, 80),
    height: integer(v['height'], 100, 250),
    height_min: integer(v['height_min'], 100, 250),
    height_max: integer(v['height_max'], 100, 250),
    weight: integer(v['weight'], 50, 500),
    weight_min: integer(v['weight_min'], 50, 500),
    weight_max: integer(v['weight_max'], 50, 500),
    wechat: text(v['wechat'], 64),
    introduction: text(v['introduction'], 500),
    consent: bool(v['consent']),
  }
  if (
    out.age_min > out.age_max ||
    out.height_min > out.height_max ||
    out.weight_min > out.weight_max
  )
    throw invalid()
  return out
}
function enrollment(value: unknown): Enrollment {
  const v = object(value)
  const result: Enrollment = {
    id: identifier(v['id']),
    version: integer(v['version'], 1),
    status: choice(v['status'], enrollmentStatuses),
    reason: text(v['reason'], 500),
    eligible: bool(v['eligible']),
  }
  if (v['profile'] !== undefined && v['profile'] !== null) result.profile = profile(v['profile'])
  return result
}
function score(value: unknown): ScoreDetails {
  const v = object(value)
  return {
    mbti: number(v['mbti'], 0, 30),
    age: number(v['age'], 0, 20),
    campus: number(v['campus'], 0, 25),
    height: number(v['height'], 0, 15),
    weight: number(v['weight'], 0, 10),
  }
}
function pair(value: unknown): Pair {
  const v = object(value)
  return {
    id: identifier(v['id']),
    version: integer(v['version'], 1),
    status: choice(v['status'], pairStatuses),
    score: integer(v['score'], 0, 100),
    score_details: score(v['score_details']),
    algorithm: text(v['algorithm'], 80),
    enrollments: list(v['enrollments'] ?? [], identifier, 2),
    member_names: list(v['member_names'] ?? [], (item) => text(item, 80), 2),
    accessible: bool(v['accessible']),
    reason: text(v['reason'] ?? '', 500),
  }
}
function template(value: unknown): TaskTemplate {
  const v = object(value)
  return {
    kind: choice(v['kind'], ['online', 'offline']),
    body: text(v['body'], 1000),
    fixed_day: integer(v['fixed_day'], 0, 30),
  }
}
function libraryTask(value: unknown): LibraryTask {
  const v = object(value)
  return {
    id: identifier(v['id']),
    version: integer(v['version'], 1),
    kind: choice(v['kind'], ['online', 'offline']),
    body: text(v['body'], 1000),
    min_day: integer(v['min_day'], 0, 30),
    enabled: bool(v['enabled']),
  }
}
export function parseLibraryPage(value: unknown): LibraryPage {
  const v = envelope(value)
  const out = { items: unique(list(v['items'], libraryTask, 50)), total: integer(v['total']) }
  if (out.items.length > out.total) throw invalid()
  return out
}
export function parseActivityPage(value: unknown): ActivityPage {
  const v = envelope(value)
  const out = { items: unique(list(v['items'], activity, 50)), total: integer(v['total']) }
  if (out.items.length > out.total) throw invalid()
  return out
}
export function parseMatchmakingWorkspace(value: unknown): Workspace {
  const v = envelope(value)
  const out: Workspace = {
    activity: activity(v['activity']),
    enrollments: unique(list(v['enrollments'], enrollment, 50)),
    total: integer(v['total']),
    pairs: unique(list(v['pairs'], pair, 50)),
    pair_total: integer(v['pair_total']),
    templates: list(v['templates'], template, 30),
    templates_locked: bool(v['templates_locked']),
  }
  if (v['task_plan'] !== undefined) {
    const plan = object(v['task_plan'])
    out.task_plan = {
      first_task_id: identifier(plan['first_task_id']),
      first_task_body: text(plan['first_task_body'], 1000),
      missing_day: integer(plan['missing_day'], 0, out.activity.days),
    }
  }
  const fixedDays = out.templates.filter((item) => item.fixed_day > 0).map((item) => item.fixed_day)
  if (
    out.enrollments.length > out.total ||
    out.pairs.length > out.pair_total ||
    out.templates.some((item) => item.fixed_day > out.activity.days) ||
    new Set(fixedDays).size !== fixedDays.length
  )
    throw invalid()
  return out
}
export function parseCandidates(value: unknown): Candidate[] {
  const out = list(
    envelope(value)['items'],
    (item) => {
      const v = object(item)
      return {
        enrollment: enrollment(v['enrollment']),
        score: integer(v['score'], 0, 100),
        score_details: score(v['score_details']),
      }
    },
    50,
  )
  unique(out.map((item) => item.enrollment))
  return out
}

export class MatchmakingError extends ApiError {
  constructor(
    status: number,
    public code: string,
  ) {
    super(status)
  }
}
export function matchmakingErrorMessage(error: unknown): string {
  if (error instanceof MatchmakingError) {
    const messages: Record<string, string> = {
      INVALID_INPUT: '填写内容不符合要求，请核对时间、任务和资料。',
      VERSION_CONFLICT: '数据版本已变化，请重新读取后核对。',
      IDEMPOTENCY_CONFLICT: '本次操作凭据冲突，请重新读取核对。',
      STATE_CONFLICT: '当前状态不允许此操作，请核对报名、配对和任务配置。',
      REVIEW_PENDING: '内容需要调整后重新审核，请核对活动说明或任务内容。',
      BLOCKED_INTERACTION: '双方当前不可配对，请刷新候选。',
    }
    if (messages[error.code]) return messages[error.code] ?? error.message
    if (error.status === 404) return '活动或报名已不可访问，请重新读取。'
    if (error.status === 409) return '活动、资料或配对已变化，请重新读取核对。'
    if (error.status === 400 || error.status === 422) return '填写内容不符合要求，请核对表单。'
    if (error.status === 429) return '操作过于频繁，请稍后原样重试。'
    return error.message
  }
  return error instanceof Error ? error.message : '请求未完成，请重试。'
}

/** 请求仅发往固定同源后台包分配路径；分页参数由数值构造，响应按当前会话丢弃。 */
export function createMatchmakingClient(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch = fetch,
) {
  async function request(
    path: string,
    signal: AbortSignal,
    command?: PendingCommand,
    page?: number,
  ) {
    if (!allowed()) throw new ApiError(403)
    if (
      !/^\/admin\/matchmaking\/(?:activities(?:\/[a-z0-9-]+)*|task-library(?:\/[a-z0-9-]+)?)$/u.test(
        path,
      )
    )
      throw new Error('无效包分配路径')
    const query = page === undefined ? '' : `?page=${integer(page, 1)}&limit=20`
    const response = await transport(`/api/v1${path}${query}`, {
      method: command?.method ?? 'GET',
      signal,
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
    return raw
  }
  const base = '/admin/matchmaking/activities'
  return {
    async library(page: number, signal: AbortSignal) {
      return parseLibraryPage(
        await request('/admin/matchmaking/task-library', signal, undefined, page),
      )
    },
    async activities(page: number, signal: AbortSignal) {
      return parseActivityPage(await request(base, signal, undefined, page))
    },
    async workspace(id: string, page: number, signal: AbortSignal) {
      const result = parseMatchmakingWorkspace(
        await request(`${base}/${identifier(id)}`, signal, undefined, page),
      )
      if (result.activity.id !== id) throw new Error('返回活动与当前选择不一致，请重新读取')
      return result
    },
    async candidates(id: string, enrollmentID: string, signal: AbortSignal) {
      return parseCandidates(
        await request(`${base}/${identifier(id)}/candidates/${identifier(enrollmentID)}`, signal),
      )
    },
    async execute(command: PendingCommand, signal: AbortSignal) {
      return { id: identifier(envelope(await request(command.path, signal, command))['id']) }
    },
  }
}
