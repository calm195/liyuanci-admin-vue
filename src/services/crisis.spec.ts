import { describe, expect, it, vi } from 'vitest'
import {
  createCrisisClient,
  parseCrisisDetail,
  parseCrisisTimeline,
  parseCrisisWork,
  validCrisisReason,
} from './crisis'
const signal = () => new AbortController().signal
const envelope = (data: unknown) =>
  Response.json({ code: 0, message: '测试', request_id: 'trace', data })
const summary = { id: 'case', version: 7, status: 'pending_handling' }
const detail = {
  ...summary,
  body: '测试案件正文',
  student_number: '测试学号',
  timeline: [{ id: 'evidence', version: 7, kind: 'evidence', status: 'pending_handling' }],
}
describe('T030 REQ-017/018/019 危机后台协议', () => {
  it('列表只保存最小字段，签名游标原样编码，使用后台安全传输', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(envelope({ items: [detail], next_cursor: null }))
    const result = await createCrisisClient('token', () => true, transport).list('a+/=&', signal())
    expect(result.items).toEqual([summary])
    const [url, init] = transport.mock.calls[0] ?? []
    expect(url).toBe('/api/v1/admin/crisis-cases?limit=20&cursor=a%2B%2F%3D%26')
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' })
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token')
  })
  it('详情拒绝跨案件和缺失身份，字段过滤不保存对象地址', async () => {
    expect(parseCrisisDetail({ ...detail, url: 'private' })).toEqual(detail)
    expect(() => parseCrisisDetail(summary)).toThrow()
    const transport = vi.fn<typeof fetch>().mockResolvedValue(envelope({ ...detail, id: 'other' }))
    await expect(
      createCrisisClient('token', () => true, transport).detail('case', signal()),
    ).rejects.toThrow('不匹配')
  })
  it.each(['take_over', 'follow_up', 'resolve', 'retry_notification'] as const)(
    '动作%s传案件版本及稳定幂等键，剔除身份字段',
    async (action) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockImplementation(() => Promise.resolve(envelope({ ...summary, version: 8 })))
      const client = createCrisisClient('token', () => true, transport)
      const input = { action, reason: '测试理由', expected_version: 7, student_number: '不发送' }
      await client.act('case', input, 'same', signal())
      await client.act('case', input, 'same', signal())
      expect(transport.mock.calls[0]?.[0]).toBe('/api/v1/admin/crisis-cases/case/actions')
      for (const [, init] of transport.mock.calls) {
        expect(init?.body).toBe(
          JSON.stringify({ action, reason: input.reason, expected_version: 7 }),
        )
        expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('same')
      }
    },
  )
  it('误报仅发送理由与案件版本，不发送动作或直接公开参数', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(envelope({ ...summary, status: 'false_positive' }))
    const input = { reason: '误报核对', expected_version: 7, action: 'publish' }
    await createCrisisClient('token', () => true, transport).falsePositive(
      'case',
      input,
      'key',
      signal(),
    )
    expect(transport.mock.calls[0]?.[0]).toBe(
      '/api/v1/admin/crisis-cases/case/resolve-false-positive',
    )
    expect(transport.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ reason: input.reason, expected_version: 7 }),
    )
  })
  it.each(['task', 'report'] as const)('从%s升级时使用来源版本而不是新案版本', async (source) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(envelope({ ...summary, id: 'new-case', version: 1 }))
    const input = { reason: '人工判定', expected_version: 19 }
    const value = await createCrisisClient('token', () => true, transport).escalate(
      source,
      'source',
      input,
      'key',
      signal(),
    )
    expect(value.id).toBe('new-case')
    expect(transport.mock.calls[0]?.[0]).toBe(
      `/api/v1/admin/${source === 'task' ? 'moderation-tasks' : 'reports'}/source/escalate-crisis`,
    )
    expect(transport.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(input))
  })
  it('证据仅限当前案件及明确引用，不请求学生卡或公开下载地址', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      envelope({
        id: 'evidence',
        version: 1,
        case_id: 'case',
        body: '限定正文',
        student_number: '学号',
        status: 'open',
      }),
    )
    const response = envelope({
      id: 'evidence',
      version: 1,
      case_id: 'case',
      body: '限定正文',
      student_number: '学号',
      status: 'open',
    })
    transport.mockImplementation(() => Promise.resolve(response.clone()))
    const client = createCrisisClient('token', () => true, transport)
    await client.evidence('case', 'evidence', signal())
    expect(transport.mock.calls[0]?.[0]).toBe('/api/v1/admin/evidence/evidence')
    await expect(client.evidence('other', 'evidence', signal())).rejects.toThrow('不匹配')
  })
  it('读取辅助时间线和待办，投递次数可为0，丢弃租约与正文', async () => {
    const events = [
      { id: 'event', action: 'isolated', actor: 'system', at: '2026-10-23T00:00:00Z' },
    ]
    const work = {
      handoff_at: '2026-10-24T00:00:00Z',
      items: [
        {
          id: 'job',
          kind: 'care',
          status: 'pending',
          attempts: 0,
          next_at: '2026-10-23T23:00:00Z',
          lease_id: '不能保留',
          body: '不能保留',
        },
      ],
    }
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(envelope(events))
      .mockResolvedValueOnce(envelope(work))
    const client = createCrisisClient('token', () => true, transport)
    expect((await client.timeline('case', signal()))[0]?.reason).toBe('')
    expect((await client.work('case', signal())).items[0]).not.toHaveProperty('lease_id')
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/admin/crisis-cases/case/timeline',
      '/api/v1/admin/crisis-cases/case/work',
    ])
    expect(() =>
      parseCrisisWork({ ...work, items: [{ ...work.items[0], attempts: -1 }] }),
    ).toThrow()
    expect(() => parseCrisisTimeline([{ ...events[0], at: 'invalid' }])).toThrow()
  })
  it('理由使用码点预算，空白和超长不发送请求', async () => {
    expect(validCrisisReason('中'.repeat(2000))).toBe(true)
    expect(validCrisisReason('😀'.repeat(2000))).toBe(true)
    expect(validCrisisReason('中'.repeat(2001))).toBe(false)
    const transport = vi.fn<typeof fetch>()
    const client = createCrisisClient('token', () => true, transport)
    await expect(
      client.act('case', { action: 'resolve', reason: ' ', expected_version: 7 }, 'key', signal()),
    ).rejects.toThrow('理由')
    await expect(
      client.falsePositive('case', { reason: '原因', expected_version: 0 }, 'key', signal()),
    ).rejects.toThrow('版本')
    expect(transport).not.toHaveBeenCalled()
  })
  it.each([401, 403, 404, 409, 429, 503])('HTTP%s不泄露内部正文，保留错误状态', async (status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('敏感内部正文', { status }))
    await expect(
      createCrisisClient('token', () => true, transport).detail('case', signal()),
    ).rejects.toMatchObject({ status })
  })
  it('拒绝异常封装、撤权和取消后的迟到结果', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ items: [] }))
    await expect(
      createCrisisClient('token', () => true, transport).list(null, signal()),
    ).rejects.toThrow('封装')
    let allowed = true
    transport.mockImplementation(() => {
      allowed = false
      return Promise.resolve(envelope(detail))
    })
    await expect(
      createCrisisClient('token', () => allowed, transport).detail('case', signal()),
    ).rejects.toMatchObject({ status: 403 })
    const controller = new AbortController()
    transport.mockImplementation(() => {
      controller.abort()
      return Promise.resolve(envelope(detail))
    })
    await expect(
      createCrisisClient('token', () => true, transport).detail('case', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
