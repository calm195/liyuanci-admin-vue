import { describe, expect, it, vi } from 'vitest'
import { createAccountsClient, parseAccount, parseAccountPage } from './accounts'
const account = {
  id: 'target',
  login_name: '合成账号',
  version: 7,
  roles: ['review_operator'],
  active: false,
}
const signal = new AbortController().signal
const envelope = (data: unknown, status = 200) =>
  Response.json({ code: 0, message: '合成', request_id: 'trace', data }, { status })
describe('T010 REQ-018/019 后台账号接口', () => {
  it('验证账号投影，保留停用和空角色，丢弃口令及额外字段', () => {
    expect(parseAccount({ ...account, roles: [], password: '不保留' })).toEqual({
      ...account,
      roles: [],
    })
    for (const value of [
      { ...account, roles: ['student'] },
      { ...account, version: 0 },
      { ...account, active: 'true' },
    ])
      expect(() => parseAccount(value)).toThrow()
    expect(() => parseAccountPage({ items: [], next_cursor: 1 })).toThrow()
  })
  it('分页编码游标，携带后台Bearer且禁止缓存/cookie/重定向', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(envelope({ items: [account], next_cursor: null }))
    const client = createAccountsClient('admin-token', () => true, transport)
    expect((await client.list('a+/=&', signal)).items).toEqual([account])
    const [url, init] = transport.mock.calls[0] ?? []
    expect(url).toBe('/api/v1/admin/accounts?limit=20&cursor=a%2B%2F%3D%26')
    expect(init).toMatchObject({
      signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    })
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer admin-token')
    expect(new Headers(init?.headers).has('Idempotency-Key')).toBe(false)
  })
  it('创建只发送三个契约字段，201才成功，不接受初始密码', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(envelope(account, 201)))
    const client = createAccountsClient('token', () => true, transport)
    const input = {
      login_name: '合成账号',
      roles: [],
      reason: '创建理由',
      password: '不发送',
      expected_version: 99,
    }
    await client.create(input, 'same-key', signal)
    await client.create(input, 'same-key', signal)
    for (const [url, init] of transport.mock.calls) {
      expect(url).toBe('/api/v1/admin/accounts')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBe(
        JSON.stringify({ login_name: '合成账号', roles: [], reason: '创建理由' }),
      )
      expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('same-key')
    }
    transport.mockResolvedValue(envelope(account))
    await expect(client.create(input, 'same-key', signal)).rejects.toMatchObject({ status: 200 })
  })
  it('角色完整替换允许空数组，使用目标版本，拒绝跨账号回执', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(envelope({ ...account, roles: [], version: 8 }))
    const client = createAccountsClient('token', () => true, transport)
    await client.replaceRoles(
      'target',
      { roles: [], reason: '撤销权限', expected_version: 7 },
      'key',
      signal,
    )
    const [url, init] = transport.mock.calls[0] ?? []
    expect(url).toBe('/api/v1/admin/accounts/target/roles')
    expect(init?.method).toBe('PUT')
    expect(init?.body).toBe(JSON.stringify({ roles: [], reason: '撤销权限', expected_version: 7 }))
    transport.mockResolvedValue(envelope({ ...account, id: 'other' }))
    await expect(
      client.replaceRoles(
        'target',
        { roles: [], reason: '理由', expected_version: 7 },
        'key',
        signal,
      ),
    ).rejects.toThrow('目标不匹配')
  })
  it('无理由、无账号、非法版本或操作标识不发请求', async () => {
    const transport = vi.fn<typeof fetch>()
    const client = createAccountsClient('token', () => true, transport)
    await expect(
      client.create({ login_name: ' ', roles: [], reason: '理由' }, 'key', signal),
    ).rejects.toThrow()
    await expect(
      client.create({ login_name: '账号', roles: [], reason: ' ' }, 'key', signal),
    ).rejects.toThrow()
    await expect(
      client.replaceRoles(
        'target',
        { roles: [], reason: '理由', expected_version: 0 },
        'key',
        signal,
      ),
    ).rejects.toThrow()
    await expect(
      client.replaceRoles('..', { roles: [], reason: '理由', expected_version: 1 }, 'key', signal),
    ).rejects.toThrow()
    await expect(
      client.create({ login_name: '账号', roles: [], reason: '理由' }, '', signal),
    ).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
  it.each([401, 403, 404, 409, 429, 503])('HTTP %s 保留状态不回显敏感正文', async (status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('合成敏感错误', { status }))
    await expect(
      createAccountsClient('token', () => true, transport).list(null, signal),
    ).rejects.toMatchObject({ status })
  })
  it('取消、请求后撤权及错误成功封装失败关闭', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ code: 0, data: account }))
    const client = createAccountsClient('token', () => true, transport)
    await expect(client.list(null, signal)).rejects.toThrow('封装')
    let allowed = true
    transport.mockImplementation(() => {
      allowed = false
      return Promise.resolve(envelope({ items: [], next_cursor: null }))
    })
    await expect(
      createAccountsClient('token', () => allowed, transport).list(null, signal),
    ).rejects.toMatchObject({ status: 403 })
    transport.mockClear()
    const controller = new AbortController()
    controller.abort()
    await expect(client.list(null, controller.signal)).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
})
