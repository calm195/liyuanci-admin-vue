import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

it.each([
  [false, 'integration', 'true', 'false', false],
  [true, 'development', 'true', 'false', false],
  [true, 'integration', 'false', 'false', false],
  [true, 'integration', 'true', 'true', false],
  [true, 'integration', 'true', 'false', true],
])('INT-003 显式隔离准入 %s/%s/%s/%s', async (dev, mode, enabled, mock, expected) => {
  vi.stubEnv('DEV', dev)
  vi.stubEnv('MODE', mode)
  vi.stubEnv('VITE_ADMIN_AUTH_INTEGRATION', enabled)
  vi.stubEnv('VITE_ADMIN_MOCK', mock)
  const service = await import('./admin')
  expect(service.authIntegrationEnabled).toBe(expected)
  expect(service.accountsIntegrationEnabled).toBe(expected)
})

it('INT-003 运行时接线仅发送三项身份操作，拒绝其他业务及合成凭据', async () => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('MODE', 'integration')
  vi.stubEnv('VITE_ADMIN_AUTH_INTEGRATION', 'true')
  vi.stubEnv('VITE_ADMIN_MOCK', 'false')
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      code: 0,
      message: '合成',
      request_id: 'synthetic',
      data: {
        token: 'synthetic',
        account: {
          id: 'synthetic',
          login_name: 'synthetic',
          active: true,
          version: 1,
          roles: [],
        },
      },
    }),
  )
  vi.stubGlobal('fetch', transport)
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  const service = await import('./admin')
  expect(() => service.createSyntheticCredentials('super_admin')).toThrow()
  await service.loginAdmin({ login_name: 'synthetic', password: '合成' })
  transport.mockResolvedValue(new Response(null, { status: 204 }))
  await service.changeAdminPassword(
    'synthetic',
    { current_password: '合成', new_password: '新' },
    'stable-key',
  )
  await service.revokeAdmin('synthetic')
  await expect(service.adminRequest('/admin/accounts', 'synthetic')).rejects.toMatchObject({
    status: 503,
  })
  expect(transport.mock.calls.map(([url]) => url)).toEqual([
    '/api/v1/admin/sessions',
    '/api/v1/admin/password',
    '/api/v1/admin/session',
  ])
  expect(storage).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

it.each([
  ['true', true],
  ['false', false],
  [undefined, false],
])('T012 人工认证需要额外显式开关 %s', async (enabled, expected) => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('MODE', 'integration')
  vi.stubEnv('VITE_ADMIN_AUTH_INTEGRATION', 'true')
  vi.stubEnv('VITE_ADMIN_MOCK', 'false')
  vi.stubEnv('VITE_ADMIN_IDENTITY_INTEGRATION', enabled)
  expect((await import('./admin')).identityIntegrationEnabled).toBe(expected)
})
