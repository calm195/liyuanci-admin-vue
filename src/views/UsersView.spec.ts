import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UsersView from './UsersView.vue'
import UserRestrictionActions from '@/components/UserRestrictionActions.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type * as UsersModule from '@/services/users'
import type { UsersClient } from '@/types/users'
import type { UserSummary } from '@/types/users'
const mocks = vi.hoisted(() => ({
  users: vi.fn<UsersClient['users']>(),
  user: vi.fn<UsersClient['user']>(),
  userPenalties: vi.fn<UsersClient['userPenalties']>(),
}))
vi.mock('@/services/users', async (importOriginal) => ({
  ...(await importOriginal<typeof UsersModule>()),
  createUsersClient: () => mocks,
}))
const id = 'ac220000-0000-4000-8000-000000000001'
const secondId = 'ac220000-0000-4000-8000-000000000002'
const item: UserSummary = {
  id,
  display_name: '同名小鲤',
  verification: 'verified',
  restriction: 'normal',
  muted_until: null,
  created_at: '2026-10-29T00:00:00Z',
  as_of: '2026-10-29T04:00:00Z',
}
let wrapper: VueWrapper
function button(label: string) {
  const found = wrapper.findAll('button').find((b) => b.text() === label)
  if (!found) throw new Error(`缺少按钮 ${label}`)
  return found
}
function deferred<T>() {
  let finish: (value: T) => void = () => {
    throw new Error('未初始化')
  }
  const promise = new Promise<T>((resolve) => {
    finish = resolve
  })
  return { promise, finish }
}
async function search() {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}
async function start(
  roles: ('review_operator' | 'crisis_operator' | 'super_admin')[] = ['review_operator'],
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'synthetic',
    account: { id: 'operator', login_name: '合成操作员', version: 1, active: true, roles },
  }
  wrapper = mount(UsersView, {
    global: { plugins: [pinia], stubs: { UserRestrictionActions: true } },
  })
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.users.mockResolvedValue({ items: [item, { ...item, id: secondId }], next_cursor: 'next' })
})
afterEach(() => {
  wrapper?.unmount()
})
describe('UM-A02–A06 平台用户页面', () => {
  it.each([['review_operator'], ['crisis_operator'], ['super_admin']] as const)(
    '允许后台角色%s查询',
    async (roles) => {
      await start([roles])
      expect(mocks.users).toHaveBeenCalledOnce()
      expect(wrapper.findAll('tbody tr')).toHaveLength(2)
      expect(wrapper.text()).not.toContain(id)
      expect(wrapper.text()).not.toContain(secondId)
    },
  )
  it('无角色不发查询', async () => {
    await start([])
    expect(mocks.users).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('无权')
  })
  it('按已提交条件分页，草稿变化禁用旧翻页，切词/limit清栈', async () => {
    await start()
    await wrapper.findAll('input')[1]?.setValue('小鲤')
    await search()
    await button('下一页').trigger('click')
    await flushPromises()
    expect(mocks.users.mock.calls.at(-1)?.slice(0, 2)).toEqual([
      expect.objectContaining({ nickname: '小鲤' }),
      'next',
    ])
    await wrapper.findAll('input')[1]?.setValue('新词')
    expect(button('下一页').attributes('disabled')).toBeDefined()
    await search()
    expect(button('上一页').attributes('disabled')).toBeDefined()
    await button('下一页').trigger('click')
    await flushPromises()
    await button('上一页').trigger('click')
    await flushPromises()
    expect(mocks.users.mock.calls.at(-1)?.slice(0, 2)).toEqual([
      expect.objectContaining({ nickname: '新词' }),
      null,
    ])
    await wrapper.findAll('select')[2]?.setValue('50')
    await search()
    expect(mocks.users.mock.calls.at(-1)?.[0]?.limit).toBe(50)
  })
  it('晚到列表不能覆盖新关键词结果', async () => {
    await start()
    const old = deferred<{ items: UserSummary[]; next_cursor: null }>()
    mocks.users.mockReturnValueOnce(old.promise)
    await wrapper.get('form').trigger('submit')
    const oldSignal = mocks.users.mock.calls.at(-1)?.[2]
    mocks.users.mockResolvedValueOnce({
      items: [{ ...item, display_name: '新查询结果' }],
      next_cursor: null,
    })
    await wrapper.findAll('input')[1]?.setValue('新词')
    await search()
    old.finish({ items: [{ ...item, display_name: '过期结果' }], next_cursor: null })
    await flushPromises()
    expect(oldSignal?.aborted).toBe(true)
    expect(wrapper.text()).toContain('新查询结果')
    expect(wrapper.text()).not.toContain('过期结果')
  })
  it('查询失败保留提示', async () => {
    await start()
    mocks.users.mockRejectedValueOnce(new ApiError(503))
    await search()
    expect(wrapper.find('tbody').exists()).toBe(false)
    expect(wrapper.text()).toContain('服务暂不可用')
    expect(wrapper.text()).not.toContain('未找到符合')
  })
  it.each(['logout', 'switch', 'revoke', '403'] as const)(
    '%s清除内存且拒绝在途响应',
    async (action) => {
      await start()
      const old = deferred<{ items: UserSummary[]; next_cursor: null }>()
      mocks.users.mockReturnValueOnce(old.promise)
      await wrapper.get('form').trigger('submit')
      const admin = useAdminStore()
      if (action === 'logout') admin.clear()
      else if (action === 'switch' && admin.session)
        admin.session = { ...admin.session, token: 'other' }
      else if (action === 'revoke' && admin.session) admin.session.account.roles = []
      else {
        mocks.users.mockRejectedValueOnce(new ApiError(403))
        await search()
      }
      old.finish({ items: [item], next_cursor: null })
      await flushPromises()
      expect(wrapper.find('tbody').exists()).toBe(false)
    },
  )
  it('关键词超过50码点在本地提示且不发送查询', async () => {
    await start()
    await wrapper.findAll('input')[1]?.setValue('🐟'.repeat(51))
    await search()
    expect(mocks.users).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('最多为50')
  })
  it('普通运营只能查看表格，超管可操作每行限制', async () => {
    await start()
    expect(wrapper.findComponent(UserRestrictionActions).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('查看详情')
    wrapper.unmount()
    mocks.users.mockClear()

    await start(['super_admin'])
    const actions = wrapper.findAllComponents(UserRestrictionActions)
    expect(actions).toHaveLength(2)
    expect(actions[0]?.props()).toMatchObject({
      userId: id,
      displayName: '同名小鲤',
      restriction: 'normal',
    })
    actions[0]?.vm.$emit('changed')
    await flushPromises()
    expect(mocks.users).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('限制状态已更新')
    expect(mocks.user).not.toHaveBeenCalled()
    expect(mocks.userPenalties).not.toHaveBeenCalled()
  })
})
