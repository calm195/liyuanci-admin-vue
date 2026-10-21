import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})
async function mountLogin() {
  const { default: LoginView } = await import('./LoginView.vue')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<p>home</p>' } }],
  })
  await router.push('/')
  return mount(LoginView, { global: { plugins: [createPinia(), router] } })
}
describe('T010 REQ-018/019 登录入口', () => {
  it('默认不展示凭据或模拟角色，真实登录可用', async () => {
    vi.stubEnv('VITE_ADMIN_MOCK', 'false')
    const wrapper = await mountLogin()
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.get('fieldset').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('使用后台账号登录')
    wrapper.unmount()
  })
  it('显式开发Mock可登录，角色选择只在本地生效且不请求真实API', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_ADMIN_MOCK', 'true')
    const transport = vi.fn()
    vi.stubGlobal('fetch', transport)
    const wrapper = await mountLogin()
    expect(wrapper.text()).toContain('合成 Mock')
    await wrapper.get('select').setValue('crisis_operator')
    await wrapper.get('button').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const { useAdminStore } = await import('@/stores/admin')
    expect(useAdminStore().can('crisis_operator')).toBe(true)
    expect(useAdminStore().can('review_operator')).toBe(false)
    expect(transport).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('生产环境即使设置Mock变量也拒绝合成登录', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_ADMIN_MOCK', 'true')
    const { mockEnabled, loginAdmin } = await import('@/services/admin')
    expect(mockEnabled).toBe(false)
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', transport)
    await expect(
      loginAdmin({ login_name: 'synthetic', password: crypto.randomUUID() }),
    ).rejects.toMatchObject({ status: 401 })
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('模拟请求禁止向真实后端发送合成令牌', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_ADMIN_MOCK', 'true')
    const { adminRequest } = await import('@/services/admin')
    const transport = vi.fn<typeof fetch>()
    await expect(adminRequest('/admin/accounts', 'synthetic', {}, transport)).rejects.toThrow(
      '服务暂不可用',
    )
    expect(transport).not.toHaveBeenCalled()
  })
})

it.each([200, 401])('REQ-018 默认登录表单调用真实传输，HTTP %s 后清除口令', async (status) => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_ADMIN_MOCK', 'false')
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json(
      {
        code: 0,
        message: '合成',
        request_id: 'trace',
        data: {
          token: 'synthetic',
          account: { id: 'account', login_name: '合成账号', version: 1, roles: [], active: true },
        },
      },
      { status },
    ),
  )
  vi.stubGlobal('fetch', transport)
  const wrapper = await mountLogin()
  await wrapper.get('#login-name').setValue('合成账号')
  await wrapper.get('#login-password').setValue('合成口令')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(transport.mock.calls[0]?.[0]).toBe('/api/v1/admin/sessions')
  expect(wrapper.get('#login-password').element).toHaveProperty('value', '')
  const { useAdminStore } = await import('@/stores/admin')
  expect(useAdminStore().authenticated).toBe(status === 200)
  if (status === 401) expect(wrapper.text()).toContain('后台账号或口令不正确')
  wrapper.unmount()
})
