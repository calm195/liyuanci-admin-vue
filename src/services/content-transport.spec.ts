import { describe, expect, it, vi } from 'vitest'
import { createModerationTransport, createWordlistTransport } from './content-transport'
const signal = () => new AbortController().signal
const envelope = (data: unknown, status = 200) =>
  Response.json({ code: 0, message: '测试', request_id: 'trace', data }, { status })
const draft = { id: 'draft', kind: 'school', status: 'draft', version: 1, base_effective_id: null }
describe('T017 内容审核与词库真实传输', () => {
  it('列表编码不透明游标，带后台Bearer且禁止缓存和cookie', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(envelope({ items: [], next_cursor: null }))
    await createModerationTransport('token', () => true, transport).list('a+/=&', signal())
    const [url, init] = transport.mock.calls[0] ?? []
    expect(url).toBe('/api/v1/admin/moderation-tasks?limit=20&cursor=a%2B%2F%3D%26')
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' })
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token')
  })
  it('审核决定传案件版本与稳定幂等键，剔除通过操作的额外字段', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(
          envelope({ content_decision: 'approved', business_outcome: 'ready', version: 4 }),
        ),
      )
    const client = createModerationTransport('token', () => true, transport)
    const input = { decision: 'approved' as const, expected_version: 3, reason: '不发送' }
    await client.decide('case', input, 'same', signal())
    await client.decide('case', input, 'same', signal())
    for (const [url, init] of transport.mock.calls) {
      expect(url).toBe('/api/v1/admin/moderation-tasks/case/decision')
      expect(init?.body).toBe(JSON.stringify({ decision: 'approved', expected_version: 3 }))
      expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('same')
    }
  })
  it('词库创建仅接受201，发布带双版本且回执绑定目标', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(envelope(draft, 201))
      .mockResolvedValueOnce(envelope({ ...draft, version: 2, status: 'published' }))
    const client = createWordlistTransport('token', () => true, transport)
    await client.create({ kind: 'school', entries: [], expected_version: 7 }, 'create', signal())
    await client.publish(
      'draft',
      { expected_version: 1, expected_head_version: 8 },
      'publish',
      signal(),
    )
    expect(transport.mock.calls[0]?.[0]).toBe('/api/v1/admin/wordlists/versions')
    expect(transport.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ kind: 'school', entries: [], expected_version: 7 }),
    )
    expect(transport.mock.calls[1]?.[0]).toBe('/api/v1/admin/wordlists/draft/publish')
    expect(transport.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ expected_version: 1, expected_head_version: 8 }),
    )
    transport.mockResolvedValueOnce(envelope(draft))
    await expect(
      client.create({ kind: 'school', entries: [], expected_version: 7 }, 'key', signal()),
    ).rejects.toMatchObject({ status: 200 })
    transport.mockResolvedValueOnce(envelope({ ...draft, id: 'other' }))
    await expect(
      client.publish('draft', { expected_version: 1, expected_head_version: 8 }, 'key', signal()),
    ).rejects.toThrow('不匹配')
  })
  it('详情拒绝跨案件与跨词库回执', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        envelope({
          id: 'other',
          version: 1,
          content_version: 1,
          body: '正文',
          status: 'human_required',
        }),
      )
      .mockResolvedValueOnce(envelope({ ...draft, id: 'other', entries: [] }))
    await expect(
      createModerationTransport('token', () => true, transport).detail('case', signal()),
    ).rejects.toThrow('不匹配')
    await expect(
      createWordlistTransport('token', () => true, transport).detail('draft', signal()),
    ).rejects.toThrow('不匹配')
  })
  it.each([401, 403, 404, 409, 429, 503])('后端%s保留状态且不回显敏感正文', async (status) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('敏感正文', { status }))
    await expect(
      createModerationTransport('token', () => true, transport).list(null, signal()),
    ).rejects.toMatchObject({ status })
    await expect(
      createWordlistTransport('token', () => true, transport).list(null, signal()),
    ).rejects.not.toThrow('敏感正文')
  })
  it('拒绝非标准封装、请求中撤权和取消后的迟到响应', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ items: [] }))
    await expect(
      createModerationTransport('token', () => true, transport).list(null, signal()),
    ).rejects.toThrow('封装')
    let allowed = true
    transport.mockImplementation(() => {
      allowed = false
      return Promise.resolve(envelope({ items: [], next_cursor: null }))
    })
    await expect(
      createModerationTransport('token', () => allowed, transport).list(null, signal()),
    ).rejects.toMatchObject({ status: 403 })
    const controller = new AbortController()
    transport.mockImplementation(() => {
      controller.abort()
      return Promise.resolve(envelope({ items: [], next_cursor: null }))
    })
    await expect(
      createModerationTransport('token', () => true, transport).list(null, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('无会话或无权限不发送请求，词库写入和幂等重放也重新鉴权', async () => {
    const transport = vi.fn<typeof fetch>()
    await expect(
      createModerationTransport('', () => true, transport).list(null, signal()),
    ).rejects.toMatchObject({ status: 401 })
    const client = createWordlistTransport('token', () => false, transport)
    await expect(
      client.create({ kind: 'school', entries: [], expected_version: 1 }, 'same', signal()),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      client.publish('draft', { expected_version: 1, expected_head_version: 2 }, 'same', signal()),
    ).rejects.toMatchObject({ status: 403 })
    expect(transport).not.toHaveBeenCalled()
  })
  it('超长审核意见、重复词条与缺失版本在网络前拒绝', async () => {
    const transport = vi.fn<typeof fetch>()
    await expect(
      createModerationTransport('token', () => true, transport).decide(
        'case',
        {
          decision: 'rejected',
          expected_version: 1,
          reason: '中'.repeat(667),
          revision_suggestion: '修改',
        },
        'key',
        signal(),
      ),
    ).rejects.toThrow('2000')
    const client = createWordlistTransport('token', () => true, transport)
    await expect(
      client.create(
        { kind: 'school', entries: ['重复', '重复'], expected_version: 1 },
        'key',
        signal(),
      ),
    ).rejects.toThrow('重复')
    await expect(
      client.publish('draft', { expected_version: 0, expected_head_version: 1 }, 'key', signal()),
    ).rejects.toThrow('版本')
    expect(transport).not.toHaveBeenCalled()
  })
})
