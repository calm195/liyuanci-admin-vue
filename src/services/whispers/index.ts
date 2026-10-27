import { ApiError } from '@/services/admin'
import type * as T from '@/types/whispers'
import * as P from './parsers'
import { object, text, uuid, choice } from './boundary'

export type WhisperScope =
  'admin-review' | 'admin-review-and-crisis' | 'admin-safety' | 'admin-crisis' | 'admin-super'

/** 仅保留契约错误码及定位信息，不展示服务端错误正文。 */
export class WhisperApiError extends ApiError {
  constructor(
    status: number,
    public readonly errorCode: T.Error['error_code'],
    public readonly requestId: string,
    public readonly retryAfterSeconds: number | null,
  ) {
    super(status)
  }
}

function contentKind(value: T.ContentRef['kind']) {
  return choice(value, ['whisper_post', 'whisper_comment', 'whisper_nickname', 'whisper_capsule'])
}
function pageQuery(cursor: string | null): string {
  const query = new URLSearchParams({ limit: '20' })
  if (cursor !== null) query.set('cursor', text(cursor, { minLength: 1, maxLength: 4096 }))
  return query.toString()
}
function command(method: string, input: unknown, key: string): RequestInit {
  const body = JSON.stringify(input)
  if (body === undefined || new TextEncoder().encode(body).length > 16384)
    throw new Error('树洞请求超过允许大小')
  return {
    method,
    body,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': uuid(key) },
  }
}

/** 权限回调须同时绑定当前会话及操作域；不缓存正文或自动重试写入。 */
export function createWhispersClient(
  token: string,
  allowed: (scope: WhisperScope) => boolean,
  transport: typeof fetch = fetch,
) {
  function guard(scope: WhisperScope, signal: AbortSignal) {
    signal.throwIfAborted()
    if (!token.trim()) throw new ApiError(401)
    if (!allowed(scope)) throw new ApiError(403)
  }
  async function request(
    path: string,
    scope: WhisperScope,
    signal: AbortSignal,
    status: number,
    init: RequestInit = {},
  ): Promise<unknown> {
    guard(scope, signal)
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const response = await transport(`/api/v1/admin/whispers/${path}`, {
      ...init,
      headers,
      signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    guard(scope, signal)
    if (response.status !== status) {
      if (response.ok) throw new Error('树洞响应状态码不符合契约')
      let error: T.Error | undefined
      try {
        error = P.parseError(await response.json())
      } catch {
        /* 非契约错误页仅保留HTTP状态，不回显正文。 */
      }
      guard(scope, signal)
      if (error)
        throw new WhisperApiError(
          response.status,
          error.error_code,
          error.request_id,
          error.retry_after_seconds ?? null,
        )
      throw new ApiError(response.status)
    }
    let value: unknown
    try {
      value = await response.json()
    } catch {
      throw new Error('树洞响应封装不符合契约')
    }
    guard(scope, signal)
    const envelope = object(value, ['code', 'message', 'request_id', 'data'])
    if (envelope['code'] !== 0 || !Object.hasOwn(envelope, 'data'))
      throw new Error('树洞响应封装不符合契约')
    text(envelope['message'])
    text(envelope['request_id'])
    return envelope['data']
  }
  return {
    async whisperAdminReviewsList(cursor: string | null, signal: AbortSignal) {
      const result = P.parseReviewSummaryPage(
        await request(`reviews?${pageQuery(cursor)}`, 'admin-review', signal, 200),
      )
      return result
    },
    async whisperAdminReviewGet(review_id: string, signal: AbortSignal) {
      const result = P.parseReviewDetail(
        await request(`reviews/${uuid(review_id)}`, 'admin-review', signal, 200),
      )
      if (result.id !== review_id) throw new Error('树洞资源回执不匹配')
      return result
    },
    async whisperAdminReviewDecide(
      review_id: string,
      input: T.ReviewCommand,
      key: string,
      signal: AbortSignal,
    ) {
      const result = P.parseReviewOutcome(
        await request(
          `reviews/${uuid(review_id)}/decision`,
          'admin-review',
          signal,
          200,
          command('POST', P.parseReviewCommand(input), key),
        ),
      )
      if (result.id !== review_id) throw new Error('树洞资源回执不匹配')
      return result
    },
    async whisperAdminReviewEscalate(
      review_id: string,
      input: T.ReasonCommand,
      key: string,
      signal: AbortSignal,
    ) {
      const result = P.parseCrisisSummary(
        await request(
          `reviews/${uuid(review_id)}/escalate`,
          'admin-review-and-crisis',
          signal,
          200,
          command('POST', P.parseReasonCommand(input), key),
        ),
      )
      return result
    },
    async whisperAdminContentGet(
      kind: T.ContentRef['kind'],
      content_id: string,
      signal: AbortSignal,
    ) {
      const result = P.parseContentControl(
        await request(
          `contents/${contentKind(kind)}/${uuid(content_id)}`,
          'admin-safety',
          signal,
          200,
        ),
      )
      if (result.source.id !== content_id || result.source.kind !== kind)
        throw new Error('树洞治理来源不匹配')
      return result
    },
    async whisperAdminRestrictionSet(
      kind: T.ContentRef['kind'],
      content_id: string,
      input: T.RestrictionCommand,
      key: string,
      signal: AbortSignal,
    ) {
      const result = P.parseContentControl(
        await request(
          `contents/${contentKind(kind)}/${uuid(content_id)}/restriction`,
          'admin-safety',
          signal,
          200,
          command('PUT', P.parseRestrictionCommand(input), key),
        ),
      )
      if (result.source.id !== content_id || result.source.kind !== kind)
        throw new Error('树洞治理来源不匹配')
      return result
    },
    async whisperAdminPenaltyCreate(
      kind: T.ContentRef['kind'],
      content_id: string,
      input: T.PenaltyCommand,
      key: string,
      signal: AbortSignal,
    ) {
      const result = P.parsePenaltyResult(
        await request(
          `contents/${contentKind(kind)}/${uuid(content_id)}/penalties`,
          'admin-safety',
          signal,
          200,
          command('POST', P.parsePenaltyCommand(input), key),
        ),
      )
      return result
    },
    async whisperAdminReportsList(cursor: string | null, signal: AbortSignal) {
      const result = P.parseReportSummaryPage(
        await request(`reports?${pageQuery(cursor)}`, 'admin-safety', signal, 200),
      )
      return result
    },
    async whisperAdminReportGet(report_id: string, signal: AbortSignal) {
      const result = P.parseReportDetail(
        await request(`reports/${uuid(report_id)}`, 'admin-safety', signal, 200),
      )
      if (result.id !== report_id) throw new Error('树洞资源回执不匹配')
      return result
    },
    async whisperAdminReportDecide(
      report_id: string,
      input: T.ReportDecision,
      key: string,
      signal: AbortSignal,
    ) {
      const result = P.parseReportSummary(
        await request(
          `reports/${uuid(report_id)}/decision`,
          'admin-safety',
          signal,
          200,
          command('POST', P.parseReportDecision(input), key),
        ),
      )
      if (result.id !== report_id) throw new Error('树洞资源回执不匹配')
      return result
    },
    async whisperAdminReportEscalate(
      report_id: string,
      input: T.ReasonCommand,
      key: string,
      signal: AbortSignal,
    ) {
      const result = P.parseCrisisSummary(
        await request(
          `reports/${uuid(report_id)}/escalate`,
          'admin-crisis',
          signal,
          200,
          command('POST', P.parseReasonCommand(input), key),
        ),
      )
      return result
    },
    async whisperAdminCrisesList(cursor: string | null, signal: AbortSignal) {
      const result = P.parseCrisisSummaryPage(
        await request(`crises?${pageQuery(cursor)}`, 'admin-crisis', signal, 200),
      )
      return result
    },
    async whisperAdminCrisisGet(crisis_id: string, signal: AbortSignal) {
      const result = P.parseCrisisDetail(
        await request(`crises/${uuid(crisis_id)}`, 'admin-crisis', signal, 200),
      )
      if (result.id !== crisis_id) throw new Error('树洞资源回执不匹配')
      return result
    },
    async whisperAdminCrisisAct(
      crisis_id: string,
      input: T.CrisisCommand,
      key: string,
      signal: AbortSignal,
    ) {
      const result = P.parseCrisisDetail(
        await request(
          `crises/${uuid(crisis_id)}/actions`,
          'admin-crisis',
          signal,
          200,
          command('POST', P.parseCrisisCommand(input), key),
        ),
      )
      if (result.id !== crisis_id) throw new Error('树洞资源回执不匹配')
      return result
    },
    async whisperAdminCrisisFalsePositive(
      crisis_id: string,
      input: T.ReasonCommand,
      key: string,
      signal: AbortSignal,
    ) {
      const result = P.parseCrisisDetail(
        await request(
          `crises/${uuid(crisis_id)}/false-positive`,
          'admin-crisis',
          signal,
          200,
          command('POST', P.parseReasonCommand(input), key),
        ),
      )
      if (result.id !== crisis_id) throw new Error('树洞资源回执不匹配')
      return result
    },
    async whisperAdminEvidenceGet(evidence_id: string, signal: AbortSignal) {
      const result = P.parseEvidenceScope(
        await request(`evidence/${uuid(evidence_id)}`, 'admin-super', signal, 200),
      )
      if (result.id !== evidence_id) throw new Error('树洞资源回执不匹配')
      return result
    },
    async whisperAdminEvidenceDelete(
      evidence_id: string,
      input: T.EvidenceDelete,
      key: string,
      signal: AbortSignal,
    ) {
      const result = P.parseDeletionJob(
        await request(
          `evidence/${uuid(evidence_id)}/deletion-requests`,
          'admin-super',
          signal,
          202,
          command('POST', P.parseEvidenceDelete(input), key),
        ),
      )
      return result
    },
    async whisperAdminDeletionGet(job_id: string, signal: AbortSignal) {
      const result = P.parseDeletionJob(
        await request(`deletions/${uuid(job_id)}`, 'admin-super', signal, 200),
      )
      if (result.id !== job_id) throw new Error('树洞资源回执不匹配')
      return result
    },
  }
}
