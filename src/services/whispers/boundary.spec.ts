import { describe, expect, it, vi } from 'vitest'
import { createWhispersClient } from './index'
import * as P from './parsers'
import { parseModerationOutcome } from '../moderation'
import fixtures from './contract.spec.json'

const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const other = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const signal = () => new AbortController().signal
const wrap = (data: unknown, status = 200) =>
  Response.json({ code: 0, message: '成功', request_id: 'trace', data }, { status })
const outcome = { id, version: 2, content_decision: 'approved', business_outcome: 'capsule_locked' }
const command = { expected_version: 7, expected_content_version: 3, decision: 'approved' as const }
function example(name: string): unknown {
  const entry = fixtures.exchanges.find(
    (item) => item.operation_id === name && item.direction === 'response',
  )
  if (!entry) throw new Error('缺少样例')
  return entry.body.data
}

describe('WA-01 版本、隐私和响应边界', () => {
  it.each([
    'published',
    'nickname_activated',
    'capsule_locked',
    'capsule_unlocked',
    'cancelled',
    'rejected',
    'privacy_review_required',
  ])('保留审核结果 %s 的业务区别', (business_outcome) => {
    expect(P.parseReviewOutcome({ ...outcome, business_outcome }).business_outcome).toBe(
      business_outcome,
    )
  })
  it('拒绝未知结果和额外身份字段，不扩大旧审核契约', () => {
    expect(() => P.parseReviewOutcome({ ...outcome, business_outcome: 'ready' })).toThrow()
    expect(() => P.parseReviewOutcome({ ...outcome, author_id: other })).toThrow()
    expect(() => parseModerationOutcome(outcome)).toThrow()
    expect(parseModerationOutcome({ ...outcome, business_outcome: 'ready' }).business_outcome).toBe(
      'ready',
    )
  })
  it('仅详情持有正文，未知动作或重复动作整体拒绝', () => {
    const detail = P.parseReviewDetail(example('whisperAdminReviewGet'))
    expect(() => P.parseReviewDetail({ ...detail, allowed_actions: ['unknown'] })).toThrow()
    expect(() =>
      P.parseReviewDetail({
        ...detail,
        allowed_actions: ['whisperAdminReviewDecide', 'whisperAdminReviewDecide'],
      }),
    ).toThrow()
    expect(() => P.parseReviewSummary({ ...detail })).toThrow()
    const summary = { ...detail, allowed_actions: [] }
    const { body, school_related, privacy_recheck, ...metadata } = summary
    expect(body).toBeTruthy()
    expect(typeof school_related).toBe('boolean')
    expect(typeof privacy_recheck).toBe('boolean')
    expect(P.parseReviewSummary(metadata)).not.toHaveProperty('body')
    expect(() =>
      P.parseReviewSummary({ ...metadata, allowed_actions: ['whisperAdminReviewDecide'] }),
    ).toThrow()
  })
  it('未认证危机保留空学号，拒绝伪造空对象及无效时间', () => {
    const detail = P.parseCrisisDetail(example('whisperAdminCrisisGet'))
    expect(
      P.parseCrisisDetail({ ...detail, student_number: null, identity_status: 'not_verified' })
        .student_number,
    ).toBeNull()
    expect(() => P.parseCrisisDetail({ ...detail, student_number: {} })).toThrow()
    expect(() => P.parseCrisisDetail({ ...detail, handoff_at: '2026-02-30T00:00:00Z' })).toThrow()
  })
  it('驳回必须同时有理由和建议，码点边界及孤立代理项严格校验', () => {
    const rejected = {
      ...command,
      decision: 'rejected',
      reason: '😀'.repeat(500),
      revision_suggestion: ' 修改 ',
    }
    expect(P.parseReviewCommand(rejected).reason).toBe(rejected.reason)
    expect(() => P.parseReviewCommand({ ...command, decision: 'rejected' })).toThrow()
    for (const reason of [' ', '😀'.repeat(501), '\ud800', '\udc00'])
      expect(() => P.parseReviewCommand({ ...rejected, reason })).toThrow()
    expect(() => P.parseReviewCommand({ ...command, expected_content_version: 0 })).toThrow()
    expect(() =>
      P.parseReviewCommand({ ...command, expected_version: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow()
    expect(() => P.parseReviewCommand({ ...command, target_user_id: id })).toThrow()
  })
  it('空页可以继续，不把空游标当作末页', () => {
    expect(P.parseReviewSummaryPage({ items: [], next_cursor: '下一页' }).next_cursor).toBe(
      '下一页',
    )
    expect(() => P.parseReviewSummaryPage({ items: [], next_cursor: '' })).toThrow()
    expect(() => P.parseReviewSummaryPage({ items: [], next_cursor: 'x'.repeat(4097) })).toThrow()
  })
  it('证据范围无正文，删除受理仍是处理中', () => {
    const evidence = P.parseEvidenceScope(example('whisperAdminEvidenceGet'))
    expect(() => P.parseEvidenceScope({ ...evidence, body: '私密内容' })).toThrow()
    expect(
      P.parseDeletionJob({ id, status: 'processing', scope: 'evidence', allowed_actions: [] })
        .status,
    ).toBe('processing')
    expect(() =>
      P.parseEvidenceDelete({ expected_version: 1, reason: '删除', confirmation: 'DELETE' }),
    ).toThrow()
  })
})

describe('WA-01 传输与会话保护', () => {
  it('原键原体重试保留双版本，不自动重试结果未知的写入', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('网络中断'))
      .mockResolvedValueOnce(wrap(outcome))
    const client = createWhispersClient('token', () => true, transport)
    await expect(client.whisperAdminReviewDecide(id, command, id, signal())).rejects.toThrow(
      '网络中断',
    )
    expect(transport).toHaveBeenCalledTimes(1)
    await client.whisperAdminReviewDecide(id, command, id, signal())
    expect(transport.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(command))
    expect(transport.mock.calls[1]?.[1]?.body).toBe(transport.mock.calls[0]?.[1]?.body)
    expect(new Headers(transport.mock.calls[1]?.[1]?.headers).get('Idempotency-Key')).toBe(id)
  })
  it('坏版本、非法资源和幂等键不触网', async () => {
    const transport = vi.fn<typeof fetch>()
    const client = createWhispersClient('token', () => true, transport)
    await expect(
      client.whisperAdminReviewDecide(id, { ...command, expected_version: 0 }, id, signal()),
    ).rejects.toThrow()
    await expect(client.whisperAdminReviewDecide(id, command, 'bad', signal())).rejects.toThrow()
    await expect(client.whisperAdminReviewGet('../capsules', signal())).rejects.toThrow()
    await expect(client.whisperAdminReviewsList('', signal())).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
  it('隔离编码游标，拒绝请求外的案件和治理来源', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(wrap({ items: [], next_cursor: null }))
      .mockResolvedValueOnce(wrap({ ...outcome, id: other }))
    const client = createWhispersClient('token', () => true, transport)
    await client.whisperAdminReviewsList('a+/=&', signal())
    expect(transport.mock.calls[0]?.[0]).toBe(
      '/api/v1/admin/whispers/reviews?limit=20&cursor=a%2B%2F%3D%26',
    )
    await expect(client.whisperAdminReviewDecide(id, command, id, signal())).rejects.toThrow(
      '不匹配',
    )
    const content = P.parseContentControl(example('whisperAdminContentGet'))
    transport.mockResolvedValueOnce(wrap({ ...content, source: { ...content.source, id: other } }))
    await expect(client.whisperAdminContentGet(content.source.kind, id, signal())).rejects.toThrow(
      '不匹配',
    )
  })
  it.each([401, 403, 404, 409, 429, 500, 503])(
    '保留 HTTP %s 且不显示后端敏感错误正文',
    async (status) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('敏感正文', { status }))
      await expect(
        createWhispersClient('token', () => true, transport).whisperAdminReviewsList(
          null,
          signal(),
        ),
      ).rejects.toMatchObject({ status })
    },
  )
  it('契约错误保留错误码、重试间隔与定位号，不显示服务端 message', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          code: 1,
          message: '敏感正文',
          error_code: 'RATE_LIMITED',
          request_id: 'trace',
          retry_after_seconds: 10,
        },
        { status: 429 },
      ),
    )
    await expect(
      createWhispersClient('token', () => true, transport).whisperAdminReviewsList(null, signal()),
    ).rejects.toMatchObject({
      errorCode: 'RATE_LIMITED',
      requestId: 'trace',
      retryAfterSeconds: 10,
    })
  })
  it('会话缺失、操作域拒绝、撤权和取消均阻止返回正文', async () => {
    const transport = vi.fn<typeof fetch>()
    await expect(
      createWhispersClient('', () => true, transport).whisperAdminReviewsList(null, signal()),
    ).rejects.toMatchObject({ status: 401 })
    await expect(
      createWhispersClient('token', () => false, transport).whisperAdminReviewsList(null, signal()),
    ).rejects.toMatchObject({ status: 403 })
    expect(transport).not.toHaveBeenCalled()
    let allowed = true
    transport.mockImplementation(() => {
      allowed = false
      return Promise.resolve(wrap(example('whisperAdminReviewGet')))
    })
    await expect(
      createWhispersClient('token', () => allowed, transport).whisperAdminReviewGet(id, signal()),
    ).rejects.toMatchObject({ status: 403 })
    const controller = new AbortController()
    transport.mockImplementation(() => {
      controller.abort()
      return Promise.resolve(wrap(example('whisperAdminReviewGet')))
    })
    await expect(
      createWhispersClient('token', () => true, transport).whisperAdminReviewGet(
        id,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('解析响应期间撤权也不回填，非标准封装和错误成功状态拒绝', async () => {
    let allowed = true
    const response = wrap(example('whisperAdminReviewGet'))
    vi.spyOn(response, 'json').mockImplementation(() => {
      allowed = false
      return Promise.resolve({})
    })
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(Response.json({ data: {} }))
      .mockResolvedValueOnce(wrap({}, 202))
    await expect(
      createWhispersClient('token', () => allowed, transport).whisperAdminReviewGet(id, signal()),
    ).rejects.toMatchObject({ status: 403 })
    const client = createWhispersClient('token', () => true, transport)
    await expect(client.whisperAdminReviewsList(null, signal())).rejects.toThrow()
    await expect(client.whisperAdminReviewsList(null, signal())).rejects.toThrow('状态码')
  })
})
