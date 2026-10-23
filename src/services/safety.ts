import { ApiError } from './admin'
import { record } from '@/types/admin'
import { reviewPage, reviewRecord, reviewText, reviewVersion } from './review-boundary'
import { contentKinds, penaltyLevels } from '@/types/safety'
import type {
  AppealDetail,
  ContentKind,
  ReasonInput,
  ReportDetail,
  SafetyClient,
  SafetySummary,
} from '@/types/safety'

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('案件文本格式异常')
  return value
}
function reason(value: unknown): string | null {
  return value === undefined || value === null ? null : text(value)
}
function kind(value: unknown): ContentKind {
  const found = contentKinds.find((item) => item === value)
  if (!found) throw new Error('案件内容类型异常')
  return found
}
export function parseSafetySummary(value: unknown): SafetySummary {
  const data = reviewRecord(value)
  const result: SafetySummary = {
    id: reviewText(data['id']),
    version: reviewVersion(data['version']),
    status: reviewText(data['status']),
  }
  if (data['kind'] !== undefined) result.kind = kind(data['kind'])
  if (data['content_version'] !== undefined)
    result.content_version = reviewVersion(data['content_version'])
  return result
}
/** 正文允许为空：换版、注销或隐私屏障后，后台仍可能返回可处置案件的技术字段。 */
export function parseReportDetail(value: unknown): ReportDetail {
  const data = reviewRecord(value)
  return {
    ...parseSafetySummary(value),
    target_kind: kind(data['target_kind']),
    target_id: reviewText(data['target_id']),
    type_code: reviewText(data['type_code']),
    content_ref: reviewText(data['content_ref']),
    content_version: reviewVersion(data['content_version']),
    subject_id: reviewText(data['subject_id']),
    body: text(data['body']),
    description: text(data['description']),
    reason: reason(data['reason']),
  }
}
export function parseAppealDetail(value: unknown): AppealDetail {
  const data = reviewRecord(value)
  return {
    ...parseSafetySummary(value),
    penalty_id: reviewText(data['penalty_id']),
    body: text(data['body']),
    penalty_reason: text(data['penalty_reason']),
    reason: reason(data['reason']),
  }
}
function segment(value: string): string {
  if (!value.trim() || value === '.' || value === '..') throw new Error('案件或目标标识无效')
  return encodeURIComponent(value)
}
function command(input: ReasonInput, body: unknown, key: string): RequestInit {
  reviewVersion(input.expected_version)
  if (!input.reason.trim()) throw new Error('请填写处理理由')
  if (!key.trim() || key.length > 128 || /[\r\n]/u.test(key)) throw new Error('操作标识无效')
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  }
}
/** 当前会话与授权回调绑定进入页面时的主体，禁止通过案件选择切换操作者身份。 */
export function createSafetyClient(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch = fetch,
): SafetyClient {
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
      throw new Error('安全治理响应封装不符合契约')
    return value['data']
  }
  async function list(path: string, cursor: string | null, signal: AbortSignal) {
    const query = new URLSearchParams({ limit: '20' })
    if (cursor !== null) query.set('cursor', cursor)
    return reviewPage(await request(`${path}?${query}`, signal), parseSafetySummary)
  }
  function bound(value: unknown, id: string) {
    const result = parseSafetySummary(value)
    if (result.id !== id) throw new Error('案件处理回执不匹配')
    return result
  }
  return {
    reports: (cursor, signal) => list('reports', cursor, signal),
    appeals: (cursor, signal) => list('appeals', cursor, signal),
    async report(id, signal) {
      const value = parseReportDetail(await request(`reports/${segment(id)}`, signal))
      if (value.id !== id) throw new Error('举报详情响应不匹配')
      return value
    },
    async appeal(id, signal) {
      const value = parseAppealDetail(await request(`appeals/${segment(id)}`, signal))
      if (value.id !== id) throw new Error('申诉详情响应不匹配')
      return value
    },
    async decideReport(id, input, key, signal) {
      if (input.decision !== 'confirmed' && input.decision !== 'dismissed')
        throw new Error('举报决定无效')
      return bound(
        await request(
          `reports/${segment(id)}/decision`,
          signal,
          command(
            input,
            {
              decision: input.decision,
              reason: input.reason,
              expected_version: input.expected_version,
            },
            key,
          ),
        ),
        id,
      )
    },
    async decideAppeal(id, input, key, signal) {
      if (input.decision !== 'uphold' && input.decision !== 'revoke')
        throw new Error('申诉决定无效')
      return bound(
        await request(
          `appeals/${segment(id)}/decision`,
          signal,
          command(
            input,
            {
              decision: input.decision,
              reason: input.reason,
              expected_version: input.expected_version,
            },
            key,
          ),
        ),
        id,
      )
    },
    async penalize(subjectId, input, key, signal) {
      segment(input.violation_ref)
      segment(input.content_ref)
      reviewVersion(input.content_version)
      if (!penaltyLevels.includes(input.level)) throw new Error('处罚等级无效')
      return parseSafetySummary(
        await request(
          `users/${segment(subjectId)}/penalties`,
          signal,
          command(
            input,
            {
              violation_ref: input.violation_ref,
              content_ref: input.content_ref,
              content_version: input.content_version,
              level: input.level,
              reason: input.reason,
              expected_version: input.expected_version,
            },
            key,
          ),
        ),
      )
    },
    async restrict(contentKind, id, action, input, key, signal) {
      kind(contentKind)
      if (action !== 'offline' && action !== 'release-restriction')
        throw new Error('内容处置操作无效')
      const result = bound(
        await request(
          `contents/${contentKind}/${segment(id)}/${action}`,
          signal,
          command(input, { reason: input.reason, expected_version: input.expected_version }, key),
        ),
        id,
      )
      if (result.kind !== contentKind) throw new Error('内容处置回执类型不匹配')
      return result
    },
  }
}
