import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
})

it.each([true, false])('REQ-018 DEV=%s 默认登录、改密、退出和后台请求均可调用', async (dev) => {
  vi.stubEnv('DEV', dev)
  vi.stubEnv('MODE', dev ? 'development' : 'production')
  vi.stubEnv('VITE_ADMIN_MOCK', 'true')
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      code: 0,
      message: '合成',
      request_id: 'synthetic',
      data: {
        token: 'synthetic',
        account: { id: 'synthetic', login_name: 'synthetic', active: true, version: 1, roles: [] },
      },
    }),
  )
  vi.stubGlobal('fetch', transport)
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  const service = await import('./admin')
  await service.loginAdmin({ login_name: 'synthetic', password: '合成' })
  transport.mockResolvedValue(new Response(null, { status: 204 }))
  await service.changeAdminPassword(
    'synthetic',
    { current_password: '合成', new_password: '新' },
    'stable-key',
  )
  await service.revokeAdmin('synthetic')
  transport.mockResolvedValue(
    Response.json({
      code: 0,
      message: '合成',
      request_id: 'synthetic',
      data: { items: [], next_cursor: null },
    }),
  )
  await service.adminRequest('/admin/accounts', 'synthetic')
  expect(transport.mock.calls.map(([url]) => url)).toEqual([
    '/api/v1/admin/sessions',
    '/api/v1/admin/password',
    '/api/v1/admin/session',
    '/api/v1/admin/accounts',
  ])
  expect(storage).not.toHaveBeenCalled()
})
