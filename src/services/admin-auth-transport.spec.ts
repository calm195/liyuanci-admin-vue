import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAdminAuthTransport } from './admin-auth-transport'
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})
const account = {
  id: 'synthetic',
  login_name: 'synthetic-operator',
  version: 1,
  active: true,
  roles: ['review_operator'],
}
const envelope = {
  code: 0,
  message: '合成',
  request_id: 'synthetic',
  data: { token: 'synthetic-token', account },
}
describe('T010 B02/B14 REQ-018/019 账号与本人改密协议', () => {
  it('登录只发送账号口令，不发送角色、Bearer或幂等键；口令保持原样', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope))
    const client = createAdminAuthTransport(transport)
    const input = {
      login_name: 'synthetic-operator',
      password: ' 合成口令 ',
      roles: ['super_admin'],
    }
    expect((await client.login(input)).account.roles).toEqual(['review_operator'])
    const [url, init] = transport.mock.calls[0] ?? []
    expect(url).toBe('/api/v1/admin/sessions')
    expect(init).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    })
    expect(typeof init?.body === 'string' ? JSON.parse(init.body) : undefined).toEqual({
      login_name: input.login_name,
      password: input.password,
    })
    const headers = new Headers(init?.headers)
    expect(headers.has('Authorization')).toBe(false)
    expect(headers.has('Idempotency-Key')).toBe(false)
  })
  it('改密明确POST、Bearer、同键及双口令，只有204才算成功', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    const client = createAdminAuthTransport(transport)
    const input = { current_password: ' 合成当前 ', new_password: ' 新 ' }
    const controller = new AbortController()
    await client.password('synthetic-token', input, 'same-key', controller.signal)
    const [url, init] = transport.mock.calls[0] ?? []
    expect(url).toBe('/api/v1/admin/password')
    expect(init).toMatchObject({
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    })
    expect(typeof init?.body === 'string' ? JSON.parse(init.body) : undefined).toEqual(input)
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('same-key')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-token')
    transport.mockResolvedValueOnce(Response.json({ code: 0 }, { status: 200 }))
    await expect(client.password('synthetic-token', input, 'same-key')).rejects.toMatchObject({
      status: 200,
    })
  })
  it.each([401, 403, 429, 503])('%s不回显后端口令或账号枚举信息', async (status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('合成敏感错误正文', { status }))
    const client = createAdminAuthTransport(transport)
    await expect(
      client.login({ login_name: 'synthetic', password: '合成输入' }),
    ).rejects.not.toThrow('敏感错误正文')
    await expect(
      client.password(
        'synthetic-token',
        { current_password: '合成旧', new_password: '合成新' },
        'key',
      ),
    ).rejects.toMatchObject({ status })
  })
  it('缺少字段先拒绝、不调用传输，不自行设置复杂度或首登门槛', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    const client = createAdminAuthTransport(transport)
    await expect(client.login({ login_name: '', password: '合成' })).rejects.toThrow()
    await expect(
      client.password('token', { current_password: '', new_password: ' ' }, 'key'),
    ).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
    await client.password('token', { current_password: ' ', new_password: 'x' }, 'key')
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('业务服务始终交给后台传输处理改密403及204，不维护本地口令夹具', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', transport)
    const service = await import('./admin')
    const input = { current_password: '测试旧口令', new_password: '测试新口令' }
    await expect(service.changeAdminPassword('token', input, 'same')).rejects.toMatchObject({
      status: 403,
    })
    await expect(service.changeAdminPassword('token', input, 'same')).resolves.toBeUndefined()
    expect(transport).toHaveBeenCalledTimes(2)
  })
})
