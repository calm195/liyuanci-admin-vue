import { describe, expect, it, vi } from 'vitest'
import { createIdentityTransport } from './identity-transport'
const id = 'synthetic-case'
const signal = new AbortController().signal
const envelope = (data: unknown) =>
  Response.json({ code: 0, message: '合成', request_id: 'trace', data })
describe('T012 REQ-002/018/019 最新人工认证协议', () => {
  it('历史列表透传视图、游标和业务字段', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      envelope({
        items: [
          {
            id,
            version: 3,
            status: 'approved',
            name: '合成姓名',
            student_number: '合成学号',
            reviewed_at: '2026-11-05T01:00:00Z',
          },
        ],
        next_cursor: null,
      }),
    )
    const result = await createIdentityTransport('admin-token', () => true, transport).list(
      'a+/=&',
      signal,
      'history',
    )
    expect(result.items).toEqual([
      {
        id,
        status: 'approved',
        name: '合成姓名',
        student_number: '合成学号',
        reviewed_at: '2026-11-05T01:00:00Z',
      },
    ])
    const [url, init] = transport.mock.calls[0] ?? []
    expect(url).toBe('/api/v1/admin/identity-reviews?limit=20&view=history&cursor=a%2B%2F%3D%26')
    expect(init).toMatchObject({
      signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    })
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer admin-token')
    expect(new Headers(init?.headers).has('Idempotency-Key')).toBe(false)
  })
  it('决定沿用申请版本与同一幂等键，通过时剔除多余字段', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(envelope({ request_id: id, version: 4, status: 'approved' })),
      )
    const client = createIdentityTransport('token', () => true, transport)
    const command = { decision: 'approved' as const, expected_version: 3, reason: '不发送' }
    await client.decide(id, command, 'stable-key', signal)
    await client.decide(id, command, 'stable-key', signal)
    for (const [url, init] of transport.mock.calls) {
      expect(url).toBe(`/api/v1/admin/identity-reviews/${id}/decision`)
      expect(init?.body).toBe(JSON.stringify({ decision: 'approved', expected_version: 3 }))
      expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('stable-key')
    }
    await expect(
      client.decide(
        id,
        { decision: 'rejected', expected_version: 3, reason: '原因', revision_suggestion: ' ' },
        'key',
        signal,
      ),
    ).rejects.toThrow('修改建议')
    expect(transport).toHaveBeenCalledTimes(2)
  })
  it('原卡只接受PNG二进制，拒绝HTML或JSON下载链接', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('合成图片', { headers: { 'Content-Type': 'image/png' } }))
    const client = createIdentityTransport('token', () => true, transport)
    expect((await client.card(id, signal)).type).toBe('image/png')
    transport.mockResolvedValue(
      new Response('合成错误页', { headers: { 'Content-Type': 'text/html' } }),
    )
    await expect(client.card(id, signal)).rejects.toThrow('PNG')
  })
  it.each([401, 403, 404, 409, 429, 503])('HTTP %s保留状态而不泄露正文', async (status) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('敏感材料', { status }))
    await expect(
      createIdentityTransport('token', () => true, transport).detail(id, signal),
    ).rejects.toMatchObject({ status })
  })
  it('拒绝错误封装、跨案件响应、迟到撤权及取消的响应', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ items: [], next_cursor: null }))
    const client = createIdentityTransport('token', () => true, transport)
    await expect(client.list(null, signal, 'pending')).rejects.toThrow('封装')
    transport.mockResolvedValue(
      envelope({
        id: 'other',
        version: 1,
        status: 'pending',
        name: '合成',
        student_number: '合成',
        asset_id: 'asset',
      }),
    )
    await expect(client.detail(id, signal)).rejects.toThrow('不匹配')
    let allowed = true
    transport.mockImplementation(() => {
      allowed = false
      return Promise.resolve(envelope({}))
    })
    await expect(
      createIdentityTransport('token', () => allowed, transport).detail(id, signal),
    ).rejects.toMatchObject({ status: 403 })
    const controller = new AbortController()
    controller.abort()
    transport.mockClear()
    await expect(client.list(null, controller.signal, 'pending')).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
})

it.each(['reason', 'revision_suggestion'] as const)(
  'T012 超长 %s 在真实传输前阻止提交',
  async (field) => {
    const transport = vi.fn<typeof fetch>()
    const client = createIdentityTransport('token', () => true, transport)
    await expect(
      client.decide(
        id,
        {
          decision: 'rejected',
          expected_version: 1,
          reason: '原因',
          revision_suggestion: '建议',
          [field]: '中'.repeat(667),
        },
        'key',
        signal,
      ),
    ).rejects.toThrow('2000 字节')
    expect(transport).not.toHaveBeenCalled()
  },
)
