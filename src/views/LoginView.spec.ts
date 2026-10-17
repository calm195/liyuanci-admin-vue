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
  it('默认不展示凭据或模拟角色，真实登录禁用', async () => {
    vi.stubEnv('VITE_ADMIN_MOCK', 'false')
    const wrapper = await mountLogin()
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('身份提供方接入准备中')
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
    expect(() => loginAdmin('super_admin')).toThrow('D02')
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
