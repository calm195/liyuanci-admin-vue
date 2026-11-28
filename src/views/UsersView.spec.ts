import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UsersView from './UsersView.vue'
import UserRestrictionActions from '@/components/UserRestrictionActions.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type * as UsersModule from '@/services/users'
import type { UserDetail, UserPage, UserPenalty, UserSummary, UsersClient } from '@/types/users'
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
  account_version: 1,
  active_penalties: [],
  allowed_actions: ['view_penalties'],
}
const penalty: UserPenalty = {
  id: 'ac230000-0000-4000-8000-000000000001',
  level: 'general',
  kind: 'mute',
  status: 'active',
  starts_at: '2026-10-29T01:00:00Z',
  ends_at: '2026-11-05T01:00:00Z',
  revoked_at: null,
  reason: '一般违规处置',
  case_link: { kind: 'ordinary_report', id: 'ac230000-0000-4000-8000-000000000002' },
  appeal_id: 'ac230000-0000-4000-8000-000000000003',
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
async function openUser(index = 0) {
  const row = wrapper.get('table').findAll('tbody tr')[index]
  if (!row) throw new Error('缺少用户行')
  await row.get('button').trigger('click')
  await flushPromises()
}
async function turnPenalties(label: string) {
  const selected = wrapper
    .get('[aria-label="处罚历史分页"]')
    .findAll('button')
    .find((entry) => entry.text() === label)
  if (!selected) throw new Error(`缺少处罚历史分页按钮 ${label}`)
  await selected.trigger('click')
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
    global: {
      plugins: [pinia],
      stubs: { UserRestrictionActions: true, RouterLink: RouterLinkStub },
    },
  })
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.users.mockResolvedValue({ items: [item, { ...item, id: secondId }], next_cursor: 'next' })
  mocks.user.mockImplementation((selectedId) => Promise.resolve({ ...detail, id: selectedId }))
  mocks.userPenalties.mockResolvedValue({ items: [penalty], next_cursor: null })
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
    expect(wrapper.findAll('form input')).toHaveLength(1)
    expect(wrapper.get('form').text()).not.toContain('用户 ID')
    await wrapper.get('form input').setValue('小鲤')
    await search()
    await button('下一页').trigger('click')
    await flushPromises()
    expect(mocks.users.mock.calls.at(-1)?.slice(0, 2)).toEqual([
      expect.objectContaining({ nickname: '小鲤', user_id: '' }),
      'next',
    ])
    await wrapper.get('form input').setValue('新词')
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
    await wrapper.get('form input').setValue('新词')
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
    await wrapper.get('form input').setValue('🐟'.repeat(51))
    await search()
    expect(mocks.users).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('最多为50')
  })
  it('普通运营可看详情，超管在所选详情中处置并重新读取', async () => {
    await start()
    await openUser()
    expect(wrapper.findComponent(UserRestrictionActions).exists()).toBe(false)
    expect(wrapper.text()).toContain('查询快照时间')
    wrapper.unmount()
    mocks.users.mockClear()
    mocks.user.mockClear()
    mocks.userPenalties.mockClear()

    await start(['super_admin'])
    expect(wrapper.findComponent(UserRestrictionActions).exists()).toBe(false)
    await openUser(1)
    const actions = wrapper.getComponent(UserRestrictionActions)
    expect(actions.props()).toMatchObject({
      userId: secondId,
      displayName: '同名小鲤',
      restriction: 'normal',
    })
    actions.vm.$emit('changed')
    await flushPromises()
    expect(mocks.users).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('限制状态已更新')
    expect(mocks.user).toHaveBeenCalledTimes(2)
    expect(mocks.userPenalties.mock.calls.map(([target, cursor]) => [target, cursor])).toEqual([
      [secondId, null],
      [secondId, null],
    ])
  })
  it.each(['review_operator', 'crisis_operator', 'super_admin'] as const)(
    '%s查看服务端返回的历史，关联入口按目标页面角色显示',
    async (role) => {
      const reviewId = 'ac230000-0000-4000-8000-000000000004'
      mocks.userPenalties.mockResolvedValue({
        items: [
          penalty,
          {
            ...penalty,
            id: 'review-penalty',
            case_link: { kind: 'ordinary_review', id: reviewId },
            appeal_id: null,
          },
          { ...penalty, id: 'unlinked-penalty', case_link: null, appeal_id: null },
        ],
        next_cursor: null,
      })
      await start([role])
      expect(mocks.userPenalties).not.toHaveBeenCalled()
      await openUser()
      expect(mocks.user.mock.calls[0]?.[0]).toBe(id)
      expect(mocks.userPenalties.mock.calls[0]?.slice(0, 2)).toEqual([id, null])
      const history = wrapper.get('[aria-label="处罚历史"]')
      expect(history.text()).toContain('一般违规处置')
      expect(history.text()).not.toContain(penalty.id)
      expect(history.findAll('tbody tr')).toHaveLength(3)
      const links = wrapper.findAllComponents(RouterLinkStub).map((link) => link.props('to'))
      const expected = [
        { path: '/safety/reports', query: { report: penalty.case_link?.id } },
        { path: '/safety/appeals', query: { appeal: penalty.appeal_id } },
      ]
      expect(links).toEqual(
        role === 'crisis_operator'
          ? expected
          : [...expected, { path: '/moderation', query: { case: reviewId } }],
      )
    },
  )
  it('详情没有查看历史能力时不请求历史', async () => {
    mocks.user.mockResolvedValueOnce({ ...detail, allowed_actions: [] })
    await start()
    await openUser()
    expect(wrapper.find('[aria-label="处罚历史"]').exists()).toBe(false)
    expect(mocks.userPenalties).not.toHaveBeenCalled()
  })
  it('按所选用户独立翻页，在游标失效后可回到首页', async () => {
    const secondPenalty = { ...penalty, reason: '第二页原因摘要' }
    mocks.userPenalties.mockImplementation((_target, cursor) =>
      Promise.resolve(
        cursor
          ? { items: [secondPenalty], next_cursor: null }
          : { items: [penalty], next_cursor: 'penalty-next' },
      ),
    )
    await start()
    await openUser()
    await turnPenalties('下一页')
    expect(wrapper.get('[aria-label="处罚历史"]').text()).toContain('第二页原因摘要')
    await turnPenalties('上一页')
    expect(wrapper.get('[aria-label="处罚历史"]').text()).toContain('一般违规处置')
    mocks.userPenalties.mockRejectedValueOnce(new ApiError(400))
    await turnPenalties('下一页')
    expect(wrapper.text()).toContain('处罚历史分页已失效')
    await button('重新读取处罚历史').trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="处罚历史分页"]').text()).toContain('第 1 页')
    expect(mocks.userPenalties.mock.calls.map(([target, cursor]) => [target, cursor])).toEqual([
      [id, null],
      [id, 'penalty-next'],
      [id, null],
      [id, 'penalty-next'],
      [id, null],
    ])
  })
  it('改选用户后旧历史晚到也不会显示', async () => {
    const old = deferred<UserPage<UserPenalty>>()
    mocks.userPenalties.mockReturnValueOnce(old.promise)
    await start()
    await openUser()
    const signal = mocks.userPenalties.mock.calls[0]?.[2]
    mocks.userPenalties.mockResolvedValueOnce({
      items: [{ ...penalty, reason: '第二位用户' }],
      next_cursor: null,
    })
    await openUser(1)
    old.finish({ items: [{ ...penalty, reason: '第一位用户的旧结果' }], next_cursor: null })
    await flushPromises()
    expect(signal?.aborted).toBe(true)
    expect(wrapper.get('[aria-label="处罚历史"]').text()).toContain('第二位用户')
    expect(wrapper.text()).not.toContain('第一位用户的旧结果')
  })
  it('降为仍可访问的岗位时清除已展示历史，旧响应不能回填', async () => {
    const old = deferred<UserPage<UserPenalty>>()
    mocks.userPenalties
      .mockResolvedValueOnce({ items: [penalty], next_cursor: 'next' })
      .mockReturnValueOnce(old.promise)
    await start(['crisis_operator', 'review_operator'])
    await openUser()
    expect(wrapper.get('[aria-label="处罚历史"]').text()).toContain('一般违规处置')
    await turnPenalties('下一页')
    const signal = mocks.userPenalties.mock.calls.at(-1)?.[2]
    const session = useAdminStore().session
    if (!session) throw new Error('缺少会话')
    session.account.roles = ['review_operator']
    old.finish({ items: [penalty], next_cursor: null })
    await flushPromises()
    expect(signal?.aborted).toBe(true)
    expect(wrapper.find('[aria-label="处罚历史"]').exists()).toBe(false)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })
  it('历史返回无权时清除详情并沿用全局拒绝处理', async () => {
    mocks.userPenalties.mockRejectedValueOnce(new ApiError(403))
    await start()
    await openUser()
    expect(useAdminStore().forbidden).toBe(1)
    expect(wrapper.find('[aria-label="处罚历史"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('查询快照时间')
  })
})
