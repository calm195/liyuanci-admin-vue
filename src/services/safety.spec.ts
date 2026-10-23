import { describe, expect, it, vi } from 'vitest'
import {
  createSafetyClient,
  parseAppealDetail,
  parseReportDetail,
  parseSafetySummary,
} from './safety'
import type { PenaltyInput } from '@/types/safety'
const signal = () => new AbortController().signal
const envelope = (data: unknown) =>
  Response.json({ code: 0, message: '测试', request_id: 'trace', data })
const report = {
  id: 'report',
  version: 7,
  status: 'resolved',
  target_kind: 'wish',
  target_id: 'wish',
  type_code: 'type',
  content_ref: 'registry',
  content_version: 3,
  subject_id: 'student',
  body: '',
  description: '',
  reason: null,
}
const penalty: PenaltyInput = {
  violation_ref: 'report',
  content_ref: 'registry',
  content_version: 3,
  level: 'general',
  reason: '违规处置',
  expected_version: 19,
}
describe('T028 REQ-014/016/018/019 安全治理协议', () => {
  it('列表仅保留技术投影，不回显举报人、说明或申诉正文', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        envelope({
          items: [
            {
              id: 'report',
              version: 7,
              status: 'resolved',
              kind: 'wish',
              body: '私密正文',
              reporter_id: '私密主体',
            },
          ],
          next_cursor: null,
        }),
      )
    const result = await createSafetyClient('token', () => true, transport).reports(
      'opaque+/=',
      signal(),
    )
    expect(result.items).toEqual([{ id: 'report', version: 7, status: 'resolved', kind: 'wish' }])
    const [url, init] = transport.mock.calls[0] ?? []
    expect(url).toBe('/api/v1/admin/reports?limit=20&cursor=opaque%2B%2F%3D')
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' })
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token')
  })
  it('允许屏障后的空正文和空说明，丢弃学生身份及对象地址', () => {
    expect(parseReportDetail({ ...report, name: '不可保留', url: 'private' })).toEqual(report)
    expect(
      parseAppealDetail({
        id: 'appeal',
        version: 2,
        status: 'pending',
        penalty_id: 'penalty',
        body: '申诉正文',
        penalty_reason: '原处罚理由',
        reason: null,
        identity: '不能保留',
      }),
    ).not.toHaveProperty('identity')
    expect(() => parseReportDetail({ ...report, target_kind: 'unknown' })).toThrow()
    expect(() => parseSafetySummary({ id: 'case', version: 0, status: 'pending' })).toThrow()
  })
  it('举报与申诉详情必须匹配选中案件', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(envelope({ ...report, id: 'other' }))
      .mockResolvedValueOnce(
        envelope({
          id: 'other',
          version: 1,
          status: 'pending',
          penalty_id: 'penalty',
          body: '正文',
          penalty_reason: '',
          reason: null,
        }),
      )
    const client = createSafetyClient('token', () => true, transport)
    await expect(client.report('report', signal())).rejects.toThrow('不匹配')
    await expect(client.appeal('appeal', signal())).rejects.toThrow('不匹配')
  })
  it('处罚使用账号版本及精确内容，剔除任意时长和额外身份字段', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(envelope({ id: 'penalty', version: 1, status: 'active' }))
    const input = { ...penalty, duration: 1 }
    await createSafetyClient('token', () => true, transport).penalize(
      'student',
      input,
      'same',
      signal(),
    )
    const [url, init] = transport.mock.calls[0] ?? []
    expect(url).toBe('/api/v1/admin/users/student/penalties')
    expect(init?.body).toBe(JSON.stringify(penalty))
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('same')
  })
  it('举报与申诉决定使用各自案件版本，重试保留幂等键', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation((url) =>
        Promise.resolve(
          envelope({
            id: String(url).includes('/reports/') ? 'report' : 'appeal',
            status: 'resolved',
            version: 8,
          }),
        ),
      )
    const client = createSafetyClient('token', () => true, transport)
    const input = { decision: 'confirmed' as const, reason: '核对属实', expected_version: 7 }
    await client.decideReport('report', input, 'same', signal())
    await client.decideReport('report', input, 'same', signal())
    await client.decideAppeal(
      'appeal',
      { decision: 'revoke', reason: '复核撤销', expected_version: 4 },
      'appeal-key',
      signal(),
    )
    expect(transport.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(input))
    expect(new Headers(transport.mock.calls[1]?.[1]?.headers).get('Idempotency-Key')).toBe('same')
    expect(transport.mock.calls[2]?.[0]).toBe('/api/v1/admin/appeals/appeal/decision')
  })
  it.each(['offline', 'release-restriction'] as const)(
    '真实内容%s绑定实体ID和独立资源版本',
    async (action) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          envelope({
            id: 'wish',
            kind: 'wish',
            content_version: 3,
            version: 12,
            status: 'restricted',
          }),
        )
      const client = createSafetyClient('token', () => true, transport)
      await client.restrict(
        'wish',
        'wish',
        action,
        { reason: '核对处理', expected_version: 11 },
        'key',
        signal(),
      )
      expect(transport.mock.calls[0]?.[0]).toBe(`/api/v1/admin/contents/wish/wish/${action}`)
      expect(transport.mock.calls[0]?.[1]?.body).toBe(
        JSON.stringify({ reason: '核对处理', expected_version: 11 }),
      )
    },
  )
  it.each([401, 403, 404, 409, 429, 503])('HTTP %s保留状态，不显示错误正文', async (status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('敏感内部错误', { status }))
    await expect(
      createSafetyClient('token', () => true, transport).appeals(null, signal()),
    ).rejects.toMatchObject({ status })
    await expect(
      createSafetyClient('token', () => true, transport).appeals(null, signal()),
    ).rejects.not.toThrow('敏感内部错误')
  })
  it('无权限、空理由、非法版本或取消不发送请求', async () => {
    const transport = vi.fn<typeof fetch>()
    await expect(
      createSafetyClient('token', () => false, transport).reports(null, signal()),
    ).rejects.toMatchObject({ status: 403 })
    const client = createSafetyClient('token', () => true, transport)
    await expect(
      client.penalize('student', { ...penalty, expected_version: 0 }, 'key', signal()),
    ).rejects.toThrow()
    await expect(
      client.decideAppeal(
        'appeal',
        { decision: 'revoke', reason: ' ', expected_version: 1 },
        'key',
        signal(),
      ),
    ).rejects.toThrow('理由')
    const controller = new AbortController()
    controller.abort()
    await expect(client.reports(null, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(transport).not.toHaveBeenCalled()
  })
  it('撤权及取消后的迟到响应不交给页面，拒绝非标准封装', async () => {
    let allowed = true
    const transport = vi.fn<typeof fetch>().mockImplementation(() => {
      allowed = false
      return Promise.resolve(envelope({ items: [], next_cursor: null }))
    })
    await expect(
      createSafetyClient('token', () => allowed, transport).reports(null, signal()),
    ).rejects.toMatchObject({ status: 403 })
    transport.mockResolvedValueOnce(Response.json({ items: [] }))
    await expect(
      createSafetyClient('token', () => true, transport).reports(null, signal()),
    ).rejects.toThrow('封装')
    const controller = new AbortController()
    transport.mockImplementation(() => {
      controller.abort()
      return Promise.resolve(envelope({ items: [], next_cursor: null }))
    })
    await expect(
      createSafetyClient('token', () => true, transport).reports(null, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
