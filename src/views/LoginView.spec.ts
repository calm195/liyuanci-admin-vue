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
  it('旧演示环境变量不再提供角色选择或本地凭据入口', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_ADMIN_MOCK', 'true')
    const wrapper = await mountLogin()
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('生成并填入')
    expect(wrapper.text()).not.toContain('合成 Mock')
    wrapper.unmount()
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
