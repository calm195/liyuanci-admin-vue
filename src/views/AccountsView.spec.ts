import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import AccountsView from './AccountsView.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type { AccountPage } from '@/types/accounts'
import type { AdminAccount } from '@/types/admin'
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  replaceRoles: vi.fn(),
}))
vi.mock('@/services/accounts', () => ({ createAccountsClient: () => mocks }))
const target: AdminAccount = {
  id: 'target',
  login_name: '合成目标',
  version: 7,
  roles: ['review_operator'],
  active: true,
}
const self: AdminAccount = {
  id: 'self',
  login_name: '合成超管',
  version: 2,
  roles: ['super_admin'],
  active: true,
}
let wrapper: VueWrapper | undefined
function button(text: string) {
  const found = wrapper?.findAll('button').find((item) => item.text() === text)
  if (!found) throw new Error(`未找到按钮：${text}`)
  return found
}
async function start(account: AdminAccount = self) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'synthetic',
    account: { ...account, roles: [...account.roles] },
  }
  wrapper = mount(AccountsView, { global: { plugins: [pinia] } })
  await flushPromises()
}
async function edit(name = target.login_name) {
  await wrapper?.get(`button[aria-label="修改 ${name} 的角色"]`).trigger('click')
  await wrapper?.get('#account-reason').setValue('合成授权理由')
}
async function confirm() {
  await wrapper?.get('form').trigger('submit')
  await button('确认提交').trigger('click')
  await flushPromises()
}
function deferred<T>() {
  let resolve: ((value: T) => void) | undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return {
    promise,
    finish(value: T) {
      if (!resolve) throw new Error('尚未准备')
      resolve(value)
    },
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.list.mockResolvedValue({ items: [target, self], next_cursor: null })
  mocks.create.mockResolvedValue({ ...target, id: 'created', login_name: '合成新账号', roles: [] })
  mocks.replaceRoles.mockResolvedValue({ ...target, version: 8, roles: [] })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})
describe('T010 REQ-018/019 后台账号管理页面', () => {
  it('非超管不读取账号列表', async () => {
    await start({ ...self, roles: ['review_operator'] })
    expect(mocks.list).not.toHaveBeenCalled()
    expect(wrapper?.find('form').exists()).toBe(false)
  })
  it('列表分页透传游标，返回上一页及刷新从首页开始', async () => {
    mocks.list.mockResolvedValueOnce({ items: [target], next_cursor: 'opaque+/=' })
    await start()
    await button('下一页').trigger('click')
    await flushPromises()
    expect(mocks.list.mock.calls[1]?.[0]).toBe('opaque+/=')
    await button('上一页').trigger('click')
    await flushPromises()
    expect(mocks.list.mock.calls[2]?.[0]).toBeNull()
    await button('从首页刷新').trigger('click')
    await flushPromises()
    expect(mocks.list.mock.calls[3]?.[0]).toBeNull()
  })
  it('创建必须填写理由并二次确认，不提供口令输入，允许空角色', async () => {
    await start()
    expect(wrapper?.find('input[type="password"]').exists()).toBe(false)
    expect(button('核对并继续').attributes('disabled')).toBeDefined()
    await wrapper?.get('#account-login').setValue('合成新账号')
    await wrapper?.get('#account-reason').setValue('合成创建理由')
    await wrapper?.get('form').trigger('submit')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(wrapper?.get('[aria-label="确认账号操作"]').text()).toContain('无角色')
    await button('确认提交').trigger('click')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith(
      { login_name: '合成新账号', roles: [], reason: '合成创建理由' },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(wrapper?.text()).toContain('已创建；初始口令请通过管理员指定渠道获取')
    expect(wrapper?.get('#account-login').element).toHaveProperty('value', '')
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })
  it('修改角色发送目标版本及完整空角色数组，禁止重复提交', async () => {
    await start()
    await edit()
    await wrapper?.get('input[value="review_operator"]').setValue(false)
    const pending = deferred<AdminAccount>()
    mocks.replaceRoles.mockReturnValue(pending.promise)
    await wrapper?.get('form').trigger('submit')
    await button('确认提交').trigger('click')
    await button('确认提交').trigger('click')
    expect(mocks.replaceRoles).toHaveBeenCalledTimes(1)
    expect(mocks.replaceRoles).toHaveBeenCalledWith(
      'target',
      { roles: [], reason: '合成授权理由', expected_version: 7 },
      expect.any(String),
      expect.any(AbortSignal),
    )
    pending.finish({ ...target, version: 8, roles: [] })
    await flushPromises()
    expect(wrapper?.text()).toContain('角色已更新')
  })
  it('网络失败相同输入沿用幂等键，修改输入才生成新键', async () => {
    await start()
    await edit()
    mocks.replaceRoles.mockRejectedValue(new TypeError('合成断网'))
    await confirm()
    const firstKey: unknown = mocks.replaceRoles.mock.calls[0]?.[2]
    await confirm()
    expect(mocks.replaceRoles.mock.calls[1]?.[2]).toBe(firstKey)
    await wrapper?.get('#account-reason').setValue('修订后的理由')
    await confirm()
    expect(mocks.replaceRoles.mock.calls[2]?.[2]).not.toBe(firstKey)
  })
  it('409不自动重放，刷新目标版本后需重新选择和确认', async () => {
    await start()
    await edit()
    mocks.replaceRoles.mockRejectedValueOnce(new ApiError(409))
    mocks.list.mockResolvedValue({ items: [{ ...target, version: 9 }], next_cursor: null })
    await confirm()
    expect(mocks.replaceRoles).toHaveBeenCalledTimes(1)
    expect(wrapper?.text()).toContain('不会自动重试')
    expect(wrapper?.text()).toContain('创建后台账号')
    await edit()
    await confirm()
    expect(mocks.replaceRoles.mock.calls[1]?.[1]).toMatchObject({ expected_version: 9 })
  })
  it('创建409保留输入和幂等键，不因自动刷新盲目换键', async () => {
    await start()
    mocks.create.mockRejectedValue(new ApiError(409))
    await wrapper?.get('#account-login').setValue('合成新账号')
    await wrapper?.get('#account-reason').setValue('合成理由')
    await confirm()
    await confirm()
    expect(mocks.create).toHaveBeenCalledTimes(2)
    expect(mocks.create.mock.calls[1]?.[1]).toBe(mocks.create.mock.calls[0]?.[1])
  })
  it.each([401, 403])('%s清除页面材料；401清会话，403保留会话并拒绝', async (status) => {
    await start()
    await edit()
    mocks.replaceRoles.mockRejectedValue(new ApiError(status))
    await confirm()
    expect(wrapper?.text()).not.toContain(target.login_name)
    expect(useAdminStore().authenticated).toBe(status !== 401)
    expect(useAdminStore().forbidden).toBe(status === 403 ? 1 : 0)
  })
  it('自身移除超管同步角色与版本，清理页面并跳转拒绝入口', async () => {
    await start()
    await edit(self.login_name)
    mocks.replaceRoles.mockResolvedValue({ ...self, roles: [], version: 3 })
    await wrapper?.get('input[value="super_admin"]').setValue(false)
    await confirm()
    expect(useAdminStore().session?.account.roles).toEqual([])
    expect(useAdminStore().session?.account.version).toBe(3)
    expect(useAdminStore().authenticated).toBe(true)
    expect(useAdminStore().can('super_admin')).toBe(false)
    expect(useAdminStore().forbidden).toBe(1)
    expect(wrapper?.text()).not.toContain(target.login_name)
    expect(mocks.list).toHaveBeenCalledTimes(1)
  })
  it('离页或会话切换取消请求，不展示迟到列表', async () => {
    const pending = deferred<AccountPage>()
    mocks.list.mockReturnValue(pending.promise)
    await start()
    const signal: unknown = mocks.list.mock.calls[0]?.[1]
    useAdminStore().clear()
    expect(signal).toHaveProperty('aborted', true)
    pending.finish({ items: [target], next_cursor: null })
    await flushPromises()
    expect(wrapper?.text()).not.toContain(target.login_name)
  })
})
