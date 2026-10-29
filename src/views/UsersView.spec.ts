import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UsersView from './UsersView.vue'
import UserRestrictionActions from '@/components/UserRestrictionActions.vue'
import { useAdminStore } from '@/stores/admin'
import { useUserNavigation } from '@/stores/userNavigation'
import { ApiError } from '@/services/admin'
import type * as UsersModule from '@/services/users'
import type { UsersClient } from '@/types/users'
import type { UserDetail, UserSummary } from '@/types/users'
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
const detail: UserDetail = {
  ...item,
  account_version: 7,
  active_penalties: [],
  allowed_actions: ['view_penalties', 'open_case_workspace', 'open_appeal_workspace'],
}
let wrapper: VueWrapper
let router: ReturnType<typeof createRouter>
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
async function open(target = id) {
  await wrapper.get(`button[aria-label="查看用户 ${target}"]`).trigger('click')
  await flushPromises()
}
async function start(
  roles: ('review_operator' | 'crisis_operator' | 'super_admin')[] = ['review_operator'],
  returning: string | null = null,
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'synthetic',
    account: { id: 'operator', login_name: '合成操作员', version: 1, active: true, roles },
  }
  useUserNavigation().target = returning
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/users', component: UsersView },
      { path: '/safety/:kind', component: { template: '<p>案件工作台</p>' } },
    ],
  })
  await router.push('/users')
  wrapper = mount(UsersView, {
    global: {
      plugins: [pinia, router],
      stubs: {
        UserRestrictionActions: true,
        ElDrawer: {
          props: ['modelValue'],
          template: '<section v-if="modelValue" aria-label="用户详情"><slot /></section>',
        },
      },
    },
  })
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.users.mockResolvedValue({ items: [item, { ...item, id: secondId }], next_cursor: 'next' })
  mocks.user.mockResolvedValue(detail)
  mocks.userPenalties.mockResolvedValue({ items: [], next_cursor: null })
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
  it('A详情晚到不污染B，昵称按文本显示', async () => {
    await start()
    const old = deferred<UserDetail>()
    mocks.user.mockReturnValueOnce(old.promise)
    await open()
    mocks.user.mockResolvedValueOnce({
      ...detail,
      id: secondId,
      display_name: '<img src=x onerror=alert(1)>',
    })
    await open(secondId)
    old.finish({ ...detail, display_name: '旧详情' })
    await flushPromises()
    expect(wrapper.text()).not.toContain('旧详情')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<img src=x')
  })
  it('历史独立失败不隐藏详情，空摘要不覆盖封禁状态', async () => {
    await start()
    mocks.user.mockResolvedValueOnce({ ...detail, restriction: 'banned' })
    mocks.userPenalties.mockRejectedValueOnce(new ApiError(503))
    await open()
    expect(wrapper.get('[aria-label="用户详情"]').text()).toContain('封禁')
    expect(wrapper.text()).toContain('服务暂不可用')
    await button('重试处罚历史').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('暂无可见处罚记录')
  })
  it('无导航提示时不自行补按钮', async () => {
    await start()
    mocks.user.mockResolvedValueOnce({ ...detail, allowed_actions: [] })
    await open()
    expect(wrapper.text()).not.toContain('进入案件工作台')
    expect(mocks.userPenalties).not.toHaveBeenCalled()
  })
  it('404清空详情并刷新列表；503不伪装空页', async () => {
    await start()
    mocks.user.mockRejectedValueOnce(new ApiError(404))
    await open()
    expect(wrapper.find('[aria-label="用户详情"]').exists()).toBe(false)
    expect(mocks.users).toHaveBeenCalledTimes(2)
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
      const old = deferred<UserDetail>()
      mocks.user.mockReturnValueOnce(old.promise)
      await open()
      const admin = useAdminStore()
      if (action === 'logout') admin.clear()
      else if (action === 'switch' && admin.session)
        admin.session = { ...admin.session, token: 'other' }
      else if (action === 'revoke' && admin.session) admin.session.account.roles = []
      else {
        mocks.users.mockRejectedValueOnce(new ApiError(403))
        await search()
      }
      old.finish(detail)
      await flushPromises()
      expect(wrapper.find('[aria-label="用户详情"]').exists()).toBe(false)
      expect(wrapper.find('tbody').exists()).toBe(false)
    },
  )
  it('处罚历史分页和导航只消费授权引用', async () => {
    await start()
    mocks.userPenalties.mockResolvedValueOnce({
      items: [
        {
          id,
          level: 'general',
          kind: 'mute',
          status: 'active',
          starts_at: item.created_at,
          ends_at: item.as_of,
          revoked_at: null,
          reason: '安全摘要',
          case_link: null,
          appeal_id: secondId,
        },
      ],
      next_cursor: 'history-next',
    })
    await open()
    expect(wrapper.text()).not.toContain('查看普通举报案件')
    await button('历史下一页').trigger('click')
    await flushPromises()
    expect(mocks.userPenalties.mock.calls.at(-1)?.slice(0, 2)).toEqual([id, 'history-next'])
    await button('历史上一页').trigger('click')
    await flushPromises()
    expect(mocks.userPenalties.mock.calls.at(-1)?.slice(0, 2)).toEqual([id, null])
  })
  it('关键词超过50码点在本地提示且不发送查询', async () => {
    await start()
    await wrapper.findAll('input')[1]?.setValue('🐟'.repeat(51))
    await search()
    expect(mocks.users).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('最多为50')
  })
  it('从处置页返回时重新读取用户详情和历史', async () => {
    await start(['review_operator'], id)
    expect(mocks.users).toHaveBeenCalledOnce()
    expect(mocks.user).toHaveBeenCalledWith(id, expect.any(AbortSignal))
    expect(mocks.userPenalties).toHaveBeenCalledWith(id, null, expect.any(AbortSignal))
    expect(wrapper.get('[aria-label="用户详情"]').text()).toContain('同名小鲤')
  })
  it('直接操作后刷新时保持详情打开，关闭后晚到的列表不能重新打开详情', async () => {
    await start(['super_admin'])
    await open()
    const list = deferred<{ items: UserSummary[]; next_cursor: null }>()
    mocks.users.mockReturnValueOnce(list.promise)
    wrapper.getComponent(UserRestrictionActions).vm.$emit('changed')
    await flushPromises()
    expect(wrapper.get('[aria-label="用户详情"]').text()).toContain('同名小鲤')
    expect(mocks.user).toHaveBeenCalledTimes(2)
    expect(mocks.userPenalties).toHaveBeenCalledTimes(2)
    await button('关闭详情').trigger('click')
    list.finish({ items: [item], next_cursor: null })
    await flushPromises()
    expect(wrapper.find('[aria-label="用户详情"]').exists()).toBe(false)
  })
  it('目标仅存内存用于案件约束，返回用户页重新查询', async () => {
    await start()
    await open()
    await button('进入案件工作台').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/safety/reports')
    wrapper.unmount()
    expect(useUserNavigation().target).toBe(id)
    useAdminStore().clear()
    expect(useUserNavigation().target).toBeNull()
  })
})
