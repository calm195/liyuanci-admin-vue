import { describe, expect, it, vi, afterEach } from 'vitest'
import { adminRequest, ApiError, loginAdmin } from './admin'
import { parseAdminSession } from '@/types/admin'
const envelope = {
  code: 0,
  message: '模拟',
  request_id: 'synthetic',
  data: {
    token: 'synthetic',
    account: {
      login_name: 'synthetic-operator',
      id: 'a',
      version: 1,
      roles: ['review_operator'],
      active: true,
    },
  },
}
afterEach(() => vi.unstubAllGlobals())
describe('T010 REQ-018/019 请求与会话边界', () => {
  it('接受后台投影，拒绝学生会话、未知角色和停用账号', () => {
    expect(parseAdminSession(envelope).account.roles).toEqual(['review_operator'])
    for (const data of [
      { token: 'student', me: {} },
      { token: 'x', account: { ...envelope.data.account, login_name: undefined } },
      { token: 'x', account: { ...envelope.data.account, login_name: ' ' } },
      { token: 'x', account: { ...envelope.data.account, active: false } },
      { token: 'x', account: { ...envelope.data.account, roles: ['student'] } },
    ])
      expect(() => parseAdminSession({ ...envelope, data })).toThrow()
  })
  it('真实服务未就绪，协议已明确也不启用登录', async () => {
    await expect(
      loginAdmin({ login_name: 'synthetic', password: crypto.randomUUID() }),
    ).rejects.toMatchObject({ status: 503 })
  })
  it('仅发送后台 Bearer，禁用缓存/cookie，DELETE 带幂等键', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    await adminRequest('/admin/session', 'admin-only', { method: 'DELETE' }, transport)
    const args = transport.mock.calls[0]
    expect(args?.[0]).toBe('/api/v1/admin/session')
    expect(args?.[1]).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' })
    const headers = new Headers(args?.[1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer admin-only')
    expect(headers.get('Idempotency-Key')).toBeTruthy()
  })
  it.each([401, 403, 404, 429, 503])('HTTP %s 保留状态且不回显后端正文', async (status) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('sensitive', { status }))
    await expect(adminRequest('/admin/session', 'x', {}, transport)).rejects.toEqual(
      new ApiError(status),
    )
  })
})
