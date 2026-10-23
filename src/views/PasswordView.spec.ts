import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import PasswordView from './PasswordView.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError, changeAdminPassword } from '@/services/admin'
import type * as service from '@/services/admin'
vi.mock('@/services/admin', async (original) => ({
  ...(await original<typeof service>()),
  changeAdminPassword: vi.fn(),
}))
let router: ReturnType<typeof createRouter>
let wrapper: VueWrapper | undefined
function deferred() {
  let finish: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    finish = resolve
  })
  return {
    promise,
    resolve() {
      if (!finish) throw new Error('未准备')
      finish()
    },
  }
}
async function fill() {
  await wrapper?.get('#current-password').setValue(' 合成旧口令 ')
  await wrapper?.get('#new-password').setValue('新')
}
beforeEach(async () => {
  vi.resetAllMocks()
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/password', component: { template: '<p>合成路由</p>' } },
      { path: '/login', component: { template: '<p>登录</p>' } },
    ],
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'synthetic',
    account: {
      id: 'a',
      login_name: 'synthetic-operator',
      active: true,
      version: 1,
      roles: ['crisis_operator'],
    },
  }
  await router.push('/password')
  wrapper = mount(PasswordView, { global: { plugins: [pinia, router] } })
  await router.isReady()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})
describe('T010 B02/B14 REQ-018/019 默认真实本人改密页面', () => {
  it('任意有效后台角色可本人改密，204后清口令与会话并重登', async () => {
    expect(wrapper?.text()).toContain('synthetic-operator')
    expect(wrapper?.get('button').attributes('disabled')).toBeDefined()
    await fill()
    await wrapper?.get('form').trigger('submit')
    await flushPromises()
    expect(changeAdminPassword).toHaveBeenCalledWith(
      'synthetic',
      { current_password: ' 合成旧口令 ', new_password: '新' },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(useAdminStore().session).toBeNull()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(wrapper?.get<HTMLInputElement>('#new-password').element.value).toBe('')
  })
  it('403清输入但保留会话，不进入拒绝页', async () => {
    vi.mocked(changeAdminPassword).mockRejectedValueOnce(new ApiError(403))
    await fill()
    await wrapper?.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper?.text()).toContain('当前口令不正确')
    expect(useAdminStore().authenticated).toBe(true)
    expect(useAdminStore().forbidden).toBe(0)
    expect(wrapper?.get<HTMLInputElement>('#current-password').element.value).toBe('')
    expect(router.currentRoute.value.path).toBe('/password')
  })
  it('重复提交只发一次；结果不明确同输入重试沿用key，改输入换key', async () => {
    const pending = deferred()
    vi.mocked(changeAdminPassword).mockReturnValueOnce(pending.promise)
    await fill()
    await wrapper?.get('form').trigger('submit')
    await wrapper?.get('form').trigger('submit')
    expect(changeAdminPassword).toHaveBeenCalledTimes(1)
    // 此处改用会话切换结束挂起场景，后续失败重试在新页面验证。
    wrapper?.unmount()
    wrapper = undefined
    pending.resolve()
    await flushPromises()
    const pinia = createPinia()
    setActivePinia(pinia)
    useAdminStore().session = {
      token: 'synthetic-new',
      account: { id: 'a', login_name: 'synthetic-operator', active: true, version: 1, roles: [] },
    }
    wrapper = mount(PasswordView, { global: { plugins: [pinia, router] } })
    vi.mocked(changeAdminPassword).mockRejectedValue(new Error('合成网络失败'))
    await fill()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const key: unknown = vi.mocked(changeAdminPassword).mock.calls[1]?.[2]
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(vi.mocked(changeAdminPassword).mock.calls[2]?.[2]).toBe(key)
    await wrapper.get('#new-password').setValue('不同新口令')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(vi.mocked(changeAdminPassword).mock.calls[3]?.[2]).not.toBe(key)
  })
  it('会话变化清口令，旧204晚到不清新会话或导航', async () => {
    const pending = deferred()
    vi.mocked(changeAdminPassword).mockReturnValueOnce(pending.promise)
    await fill()
    await wrapper?.get('form').trigger('submit')
    const admin = useAdminStore()
    const account = admin.session?.account
    if (!account) throw new Error('缺少会话')
    admin.session = { token: 'new-session', account }
    await flushPromises()
    expect(wrapper?.get<HTMLInputElement>('#new-password').element.value).toBe('')
    pending.resolve()
    await flushPromises()
    expect(admin.session?.token).toBe('new-session')
    expect(router.currentRoute.value.path).toBe('/password')
  })
  it('离开取消请求并清口令，晚到响应不再导航或清会话', async () => {
    const pending = deferred()
    vi.mocked(changeAdminPassword).mockReturnValueOnce(pending.promise)
    await fill()
    await wrapper?.get('form').trigger('submit')
    const signal = vi.mocked(changeAdminPassword).mock.calls[0]?.[3]
    const navigate = vi.spyOn(router, 'replace')
    wrapper?.unmount()
    wrapper = undefined
    pending.resolve()
    await flushPromises()
    expect(signal?.aborted).toBe(true)
    expect(useAdminStore().authenticated).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })
})
