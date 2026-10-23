import { ApiError } from './admin'
import { record } from '@/types/admin'
import { reviewRecord, reviewText, reviewVersion } from './review-boundary'
import type {
  DeletionJob,
  DeletionProgress,
  EvidenceDeletionInput,
  EvidenceTarget,
} from '@/types/privacy'

export function validDeletionId(value: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value) &&
    value !== '00000000-0000-0000-0000-000000000000'
  )
}
/** 匿名回执是带校验串的访问凭据，不能以待办 ID 或网址代替。 */
export function validDeletionReceipt(value: string): boolean {
  const [receiptId, tag] = value.split('.')
  return (
    !!receiptId &&
    validDeletionId(receiptId) &&
    !!tag &&
    /^[A-Za-z0-9_-]{43}$/u.test(tag) &&
    value === `${receiptId}.${tag}`
  )
}
/** 删除理由按后端 UTF-8 字节上限校验，保留原文用于幂等重试。 */
export function validDeletionReason(value: string): boolean {
  return !!value.trim() && new TextEncoder().encode(value).length <= 2000
}
export function parseDeletionProgress(value: unknown): DeletionProgress {
  const data = reviewRecord(value)
  if (data['status'] !== 'processing' && data['status'] !== 'completed')
    throw new Error('删除进度状态异常')
  const error = data['retryable_error']
  if (error !== undefined && typeof error !== 'string') throw new Error('删除进度提示异常')
  return {
    status: data['status'],
    ...(data['status'] === 'processing' && error
      ? {
          retryable_error:
            error === 'external_cleanup_unavailable' || error === 'database_cleanup_unavailable'
              ? error
              : ('cleanup_unavailable' as const),
        }
      : {}),
  }
}
export function createPrivacyClient(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch = fetch,
) {
  function guard(signal: AbortSignal) {
    signal.throwIfAborted()
    if (!token.trim()) throw new ApiError(401)
    if (!allowed()) throw new ApiError(403)
  }
  function id(value: string) {
    if (!validDeletionId(value)) throw new Error('请填写有效的证据或待办标识')
    return value
  }
  async function request(
    path: string,
    signal: AbortSignal,
    init: RequestInit = {},
    anonymous = false,
  ): Promise<unknown> {
    guard(signal)
    const headers = new Headers(init.headers)
    if (!anonymous) headers.set('Authorization', `Bearer ${token}`)
    const response = await transport(`/api/v1/${path}`, {
      ...init,
      headers,
      signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    guard(signal)
    if (response.status !== (init.method === 'DELETE' ? 202 : 200))
      throw new ApiError(response.status)
    const value: unknown = await response.json()
    guard(signal)
    if (
      !record(value) ||
      value['code'] !== 0 ||
      typeof value['message'] !== 'string' ||
      typeof value['request_id'] !== 'string' ||
      !('data' in value)
    )
      throw new Error('删除管理响应封装不符合契约')
    return value['data']
  }
  return {
    async evidence(evidenceId: string, signal: AbortSignal): Promise<EvidenceTarget> {
      const data = reviewRecord(await request(`admin/evidence/${id(evidenceId)}`, signal))
      const target = {
        id: reviewText(data['id']),
        case_id: reviewText(data['case_id']),
        version: reviewVersion(data['version']),
        status: reviewText(data['status']),
      }
      if (target.id !== evidenceId) throw new Error('证据目标不匹配')
      return target
    },
    async remove(
      evidenceId: string,
      input: EvidenceDeletionInput,
      key: string,
      signal: AbortSignal,
    ): Promise<DeletionJob> {
      reviewVersion(input.expected_version)
      if (!validDeletionReason(input.reason)) throw new Error('删除理由不能为空或超过 2000 字节')
      if (!key.trim() || key.length > 128 || /[\r\n]/u.test(key)) throw new Error('操作标识无效')
      const data = reviewRecord(
        await request(`admin/evidence/${id(evidenceId)}`, signal, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
          body: JSON.stringify({ reason: input.reason, expected_version: input.expected_version }),
        }),
      )
      if (
        data['status'] !== 'pending' ||
        typeof data['id'] !== 'string' ||
        !validDeletionId(data['id'])
      )
        throw new Error('删除受理回执异常，请核对待办')
      return { id: data['id'], version: reviewVersion(data['version']), status: 'pending' }
    },
    async job(jobId: string, signal: AbortSignal): Promise<DeletionProgress> {
      return parseDeletionProgress(
        await request(`admin/evidence-deletion-jobs/${id(jobId)}`, signal),
      )
    },
    async receipt(handle: string, signal: AbortSignal): Promise<DeletionProgress> {
      if (!validDeletionReceipt(handle)) throw new Error('请填写完整的删除回执')
      return parseDeletionProgress(
        await request(`deletion-receipts/${encodeURIComponent(handle)}`, signal, {}, true),
      )
    },
  }
}
