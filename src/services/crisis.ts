import { ApiError } from './admin'
import { record } from '@/types/admin'
import { reviewPage, reviewRecord, reviewText, reviewVersion } from './review-boundary'
import { crisisActions } from '@/types/crisis'
import type {
  CrisisClient,
  CrisisDetail,
  CrisisEvent,
  CrisisEvidence,
  CrisisReason,
  CrisisSummary,
  CrisisWork,
} from '@/types/crisis'

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('危机案件文本格式异常')
  return value
}
function time(value: unknown): string {
  const result = reviewText(value)
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(result) || !Number.isFinite(Date.parse(result)))
    throw new Error('危机案件时间格式异常')
  return result
}
export function parseCrisisSummary(value: unknown): CrisisSummary {
  const data = reviewRecord(value)
  return {
    id: reviewText(data['id']),
    version: reviewVersion(data['version']),
    status: reviewText(data['status']),
  }
}
/** 列表和写回执始终使用最小投影，只有具体详情可进入敏感材料状态。 */
export function parseCrisisDetail(value: unknown): CrisisDetail {
  const data = reviewRecord(value)
  const refs = data['timeline']
  if (refs !== undefined && !Array.isArray(refs)) throw new Error('危机案件引用格式异常')
  return {
    ...parseCrisisSummary(value),
    student_number: text(data['student_number']),
    body: text(data['body']),
    timeline: (refs ?? []).map((item: unknown) => {
      const ref = reviewRecord(item)
      return { ...parseCrisisSummary(item), kind: reviewText(ref['kind']) }
    }),
  }
}
export function parseCrisisTimeline(value: unknown): CrisisEvent[] {
  if (!Array.isArray(value)) throw new Error('危机时间线格式异常')
  return value.map((item: unknown) => {
    const data = reviewRecord(item)
    return {
      id: reviewText(data['id']),
      action: reviewText(data['action']),
      actor: reviewText(data['actor']),
      at: time(data['at']),
      reason: data['reason'] === undefined ? '' : text(data['reason']),
    }
  })
}
export function parseCrisisWork(value: unknown): CrisisWork {
  const data = reviewRecord(value)
  if (!Array.isArray(data['items'])) throw new Error('危机待办格式异常')
  return {
    handoff_at: data['handoff_at'] === null ? null : time(data['handoff_at']),
    items: data['items'].map((item: unknown) => {
      const row = reviewRecord(item)
      const attempts = row['attempts']
      if (typeof attempts !== 'number' || !Number.isSafeInteger(attempts) || attempts < 0)
        throw new Error('危机投递次数格式异常')
      return {
        id: reviewText(row['id']),
        kind: reviewText(row['kind']),
        status: reviewText(row['status']),
        attempts,
        next_at: time(row['next_at']),
      }
    }),
  }
}
export function parseCrisisEvidence(value: unknown): CrisisEvidence {
  const data = reviewRecord(value)
  return {
    ...parseCrisisSummary(value),
    case_id: reviewText(data['case_id']),
    body: text(data['body']),
    student_number: text(data['student_number']),
  }
}
/** 后端危机理由以 Unicode 码点限制，不使用中文 UTF-8 字节数代替。 */
export function validCrisisReason(value: string): boolean {
  return !!value.trim() && [...value].length <= 2000
}
function segment(id: string): string {
  if (!id.trim() || id === '.' || id === '..') throw new Error('危机案件标识无效')
  return encodeURIComponent(id)
}
function command(input: CrisisReason, body: unknown, key: string): RequestInit {
  reviewVersion(input.expected_version)
  if (!validCrisisReason(input.reason)) throw new Error('请填写处理理由，最多 2000 个字符')
  if (!key.trim() || key.length > 128 || /[\r\n]/u.test(key)) throw new Error('操作标识无效')
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  }
}
export function createCrisisClient(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch = fetch,
): CrisisClient {
  function guard(signal: AbortSignal) {
    signal.throwIfAborted()
    if (!token.trim()) throw new ApiError(401)
    if (!allowed()) throw new ApiError(403)
  }
  async function request(
    path: string,
    signal: AbortSignal,
    init: RequestInit = {},
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
    if (response.status !== 200) throw new ApiError(response.status)
    const value: unknown = await response.json()
    guard(signal)
    if (
      !record(value) ||
      value['code'] !== 0 ||
      typeof value['message'] !== 'string' ||
      typeof value['request_id'] !== 'string' ||
      !('data' in value)
    )
      throw new Error('危机工作台响应封装不符合契约')
    return value['data']
  }
  function bound(value: unknown, id: string) {
    const result = parseCrisisSummary(value)
    if (result.id !== id) throw new Error('危机案件回执不匹配')
    return result
  }
  return {
    async list(cursor, signal) {
      const query = new URLSearchParams({ limit: '20' })
      if (cursor !== null) query.set('cursor', cursor)
      return reviewPage(await request(`crisis-cases?${query}`, signal), parseCrisisSummary)
    },
    async detail(id, signal) {
      const value = parseCrisisDetail(await request(`crisis-cases/${segment(id)}`, signal))
      if (value.id !== id) throw new Error('危机案件详情不匹配')
      return value
    },
    async timeline(id, signal) {
      return parseCrisisTimeline(await request(`crisis-cases/${segment(id)}/timeline`, signal))
    },
    async work(id, signal) {
      return parseCrisisWork(await request(`crisis-cases/${segment(id)}/work`, signal))
    },
    async evidence(caseId, evidenceId, signal) {
      const value = parseCrisisEvidence(await request(`evidence/${segment(evidenceId)}`, signal))
      if (value.case_id !== caseId || value.id !== evidenceId)
        throw new Error('限定证据与当前案件不匹配')
      return value
    },
    async act(id, input, key, signal) {
      if (!crisisActions.includes(input.action)) throw new Error('危机处置动作无效')
      return bound(
        await request(
          `crisis-cases/${segment(id)}/actions`,
          signal,
          command(
            input,
            {
              action: input.action,
              reason: input.reason,
              expected_version: input.expected_version,
            },
            key,
          ),
        ),
        id,
      )
    },
    async falsePositive(id, input, key, signal) {
      return bound(
        await request(
          `crisis-cases/${segment(id)}/resolve-false-positive`,
          signal,
          command(input, { reason: input.reason, expected_version: input.expected_version }, key),
        ),
        id,
      )
    },
    async escalate(source, id, input, key, signal) {
      if (source !== 'task' && source !== 'report') throw new Error('危机升级来源无效')
      return parseCrisisSummary(
        await request(
          `${source === 'task' ? 'moderation-tasks' : 'reports'}/${segment(id)}/escalate-crisis`,
          signal,
          command(input, { reason: input.reason, expected_version: input.expected_version }, key),
        ),
      )
    },
  }
}
