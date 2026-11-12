import { describe, expect, it, vi } from 'vitest'
import { createSessionTransport } from './session-transport'

// 共用边界必须保护所有使用者，模块测试继续验证各自状态码和正文契约。
describe('后台会话传输边界', () => {
  it('统一会话、取消与缓存策略，保留命令的原始请求和幂等键', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }))
    const client = createSessionTransport('current-token', () => true, transport)
    const signal = new AbortController().signal
    await client.request('/api/v1/admin/accounts', signal, {
      method: 'POST',
      headers: new Headers({ Authorization: 'Bearer stale-token', 'Idempotency-Key': 'same-key' }),
      body: '{"expected_version":3}',
      cache: 'force-cache',
      credentials: 'include',
      redirect: 'follow',
    })
    const init = transport.mock.calls[0]?.[1]
    expect(init).toMatchObject({
      method: 'POST',
      signal,
      body: '{"expected_version":3}',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    })
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer current-token')
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('same-key')
  })

  it.each([
    'https://other.invalid/api/v1/admin/users',
    '//other.invalid/x',
    '/api/v1/me',
    '/api/v1/admin/../me',
    '/api/v1/admin/%2e%2e/me',
    '/api/v1/admin/.\t./me',
    '/api/v1/admin/.. ',
    '/api/v1/admin/..\u0000',
    '/api/v1/admin/.\n./me',
    '/api/v1/admin/users#fragment',
    '/api/v1/admin/\\other',
  ])('拒绝越界路径 %s', async (url) => {
    const transport = vi.fn<typeof fetch>()
    await expect(
      createSessionTransport('token', () => true, transport).request(
        url,
        new AbortController().signal,
      ),
    ).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  })

  it('不透明游标中的点号与编码符号不影响路径判断', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response())
    await createSessionTransport('token', () => true, transport).request(
      '/api/v1/admin/users?cursor=opaque..%2F%2B%3D%20',
      new AbortController().signal,
    )
    expect(transport).toHaveBeenCalledOnce()
  })

  it('请求前取消或撤权不发送，等待期间撤权丢弃响应', async () => {
    const transport = vi.fn<typeof fetch>()
    const controller = new AbortController()
    controller.abort()
    await expect(
      createSessionTransport('token', () => true, transport).request(
        '/api/v1/admin/users',
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    await expect(
      createSessionTransport(' ', () => true, transport).request(
        '/api/v1/admin/users',
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 401 })
    await expect(
      createSessionTransport('token', () => false, transport).request(
        '/api/v1/admin/users',
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(transport).not.toHaveBeenCalled()
    let allowed = true
    transport.mockImplementation(() => {
      allowed = false
      return Promise.resolve(new Response())
    })
    await expect(
      createSessionTransport('token', () => allowed, transport).request(
        '/api/v1/admin/users',
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 403 })
  })
})
