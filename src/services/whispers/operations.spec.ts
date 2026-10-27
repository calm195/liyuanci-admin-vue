import { describe, expect, it, vi } from 'vitest'
import { createWhispersClient } from './index'
import * as P from './parsers'
import fixtures from './contract.spec.json'
type Client = ReturnType<typeof createWhispersClient>
const signal = () => new AbortController().signal
const cases = [
  {
    name: 'whisperAdminReviewsList',
    scope: 'admin-review',
    url: '/api/v1/admin/whispers/reviews?limit=20',
    method: 'GET',
    status: 200,
    run: (client: Client, abort: AbortSignal) => client.whisperAdminReviewsList(null, abort),
  },
  {
    name: 'whisperAdminReviewGet',
    scope: 'admin-review',
    url: '/api/v1/admin/whispers/reviews/6c500000-0000-4000-8000-000000000001',
    method: 'GET',
    status: 200,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminReviewGet('6c500000-0000-4000-8000-000000000001', abort),
  },
  {
    name: 'whisperAdminReviewDecide',
    scope: 'admin-review',
    url: '/api/v1/admin/whispers/reviews/6c500000-0000-4000-8000-000000000001/decision',
    method: 'POST',
    status: 200,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminReviewDecide(
        '6c500000-0000-4000-8000-000000000001',
        P.parseReviewCommand({
          expected_version: 1,
          expected_content_version: 1,
          decision: 'approved',
        }),
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        abort,
      ),
  },
  {
    name: 'whisperAdminReviewEscalate',
    scope: 'admin-review-and-crisis',
    url: '/api/v1/admin/whispers/reviews/6c500000-0000-4000-8000-000000000001/escalate',
    method: 'POST',
    status: 200,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminReviewEscalate(
        '6c500000-0000-4000-8000-000000000001',
        P.parseReasonCommand({ expected_version: 1, reason: '合成文本' }),
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        abort,
      ),
  },
  {
    name: 'whisperAdminContentGet',
    scope: 'admin-safety',
    url: '/api/v1/admin/whispers/contents/whisper_post/6c500000-0000-4000-8000-000000000001',
    method: 'GET',
    status: 200,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminContentGet('whisper_post', '6c500000-0000-4000-8000-000000000001', abort),
  },
  {
    name: 'whisperAdminRestrictionSet',
    scope: 'admin-safety',
    url: '/api/v1/admin/whispers/contents/whisper_post/6c500000-0000-4000-8000-000000000001/restriction',
    method: 'PUT',
    status: 200,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminRestrictionSet(
        'whisper_post',
        '6c500000-0000-4000-8000-000000000001',
        P.parseRestrictionCommand({ expected_version: 1, restricted: false, reason: '合成文本' }),
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        abort,
      ),
  },
  {
    name: 'whisperAdminPenaltyCreate',
    scope: 'admin-safety',
    url: '/api/v1/admin/whispers/contents/whisper_post/6c500000-0000-4000-8000-000000000001/penalties',
    method: 'POST',
    status: 200,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminPenaltyCreate(
        'whisper_post',
        '6c500000-0000-4000-8000-000000000001',
        P.parsePenaltyCommand({
          expected_version: 1,
          report_id: '6c500000-0000-4000-8000-000000000001',
          expected_report_version: 1,
          level: 'minor',
          reason: '合成文本',
        }),
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        abort,
      ),
  },
  {
    name: 'whisperAdminReportsList',
    scope: 'admin-safety',
    url: '/api/v1/admin/whispers/reports?limit=20',
    method: 'GET',
    status: 200,
    run: (client: Client, abort: AbortSignal) => client.whisperAdminReportsList(null, abort),
  },
  {
    name: 'whisperAdminReportGet',
    scope: 'admin-safety',
    url: '/api/v1/admin/whispers/reports/6c500000-0000-4000-8000-000000000001',
    method: 'GET',
    status: 200,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminReportGet('6c500000-0000-4000-8000-000000000001', abort),
  },
  {
    name: 'whisperAdminReportDecide',
    scope: 'admin-safety',
    url: '/api/v1/admin/whispers/reports/6c500000-0000-4000-8000-000000000001/decision',
    method: 'POST',
    status: 200,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminReportDecide(
        '6c500000-0000-4000-8000-000000000001',
        P.parseReportDecision({ expected_version: 1, decision: 'confirmed', reason: '合成文本' }),
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        abort,
      ),
  },
  {
    name: 'whisperAdminReportEscalate',
    scope: 'admin-crisis',
    url: '/api/v1/admin/whispers/reports/6c500000-0000-4000-8000-000000000001/escalate',
    method: 'POST',
    status: 200,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminReportEscalate(
        '6c500000-0000-4000-8000-000000000001',
        P.parseReasonCommand({ expected_version: 1, reason: '合成文本' }),
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        abort,
      ),
  },
  {
    name: 'whisperAdminCrisesList',
    scope: 'admin-crisis',
    url: '/api/v1/admin/whispers/crises?limit=20',
    method: 'GET',
    status: 200,
    run: (client: Client, abort: AbortSignal) => client.whisperAdminCrisesList(null, abort),
  },
  {
    name: 'whisperAdminCrisisGet',
    scope: 'admin-crisis',
    url: '/api/v1/admin/whispers/crises/6c500000-0000-4000-8000-000000000001',
    method: 'GET',
    status: 200,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminCrisisGet('6c500000-0000-4000-8000-000000000001', abort),
  },
  {
    name: 'whisperAdminCrisisAct',
    scope: 'admin-crisis',
    url: '/api/v1/admin/whispers/crises/6c500000-0000-4000-8000-000000000001/actions',
    method: 'POST',
    status: 200,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminCrisisAct(
        '6c500000-0000-4000-8000-000000000001',
        P.parseCrisisCommand({ expected_version: 1, action: 'take_over', reason: '合成文本' }),
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        abort,
      ),
  },
  {
    name: 'whisperAdminCrisisFalsePositive',
    scope: 'admin-crisis',
    url: '/api/v1/admin/whispers/crises/6c500000-0000-4000-8000-000000000001/false-positive',
    method: 'POST',
    status: 200,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminCrisisFalsePositive(
        '6c500000-0000-4000-8000-000000000001',
        P.parseReasonCommand({ expected_version: 1, reason: '合成文本' }),
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        abort,
      ),
  },
  {
    name: 'whisperAdminEvidenceGet',
    scope: 'admin-super',
    url: '/api/v1/admin/whispers/evidence/6c500000-0000-4000-8000-000000000001',
    method: 'GET',
    status: 200,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminEvidenceGet('6c500000-0000-4000-8000-000000000001', abort),
  },
  {
    name: 'whisperAdminEvidenceDelete',
    scope: 'admin-super',
    url: '/api/v1/admin/whispers/evidence/6c500000-0000-4000-8000-000000000001/deletion-requests',
    method: 'POST',
    status: 202,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminEvidenceDelete(
        '6c500000-0000-4000-8000-000000000001',
        P.parseEvidenceDelete({
          expected_version: 1,
          confirmation: 'DELETE_EVIDENCE_SCOPE',
          reason: '合成文本',
        }),
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        abort,
      ),
  },
  {
    name: 'whisperAdminDeletionGet',
    scope: 'admin-super',
    url: '/api/v1/admin/whispers/deletions/6c500000-0000-4000-8000-000000000001',
    method: 'GET',
    status: 200,
    run: (client: Client, abort: AbortSignal) =>
      client.whisperAdminDeletionGet('6c500000-0000-4000-8000-000000000001', abort),
  },
]
describe('WA-01 固定契约18个后台操作', () => {
  it.each(cases)('$name 的路径、方法、状态码和样例响应', async (entry) => {
    const exchange = fixtures.exchanges.find(
      (item) => item.operation_id === entry.name && item.direction === 'response',
    )
    if (!exchange) throw new Error('缺少响应样例')
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(exchange.body, { status: entry.status }))
    const allowed = vi.fn(() => true)
    const result = await entry.run(
      createWhispersClient('admin-token', allowed, transport),
      signal(),
    )
    expect(result).toEqual(exchange.body.data)
    const [url, init] = transport.mock.calls[0] ?? []
    expect(url).toBe(entry.url)
    expect(init?.method ?? 'GET').toBe(entry.method)
    expect(init).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer admin-token')
    if (entry.method !== 'GET') {
      const request = fixtures.exchanges.find(
        (item) => item.operation_id === entry.name && item.direction === 'request',
      )
      if (typeof init?.body !== 'string') throw new Error('请求正文必须为JSON文本')
      const body: unknown = JSON.parse(init.body)
      expect(body).toEqual(request?.body)
      expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      )
    }
    expect(allowed).toHaveBeenCalledWith(entry.scope)
  })
})
