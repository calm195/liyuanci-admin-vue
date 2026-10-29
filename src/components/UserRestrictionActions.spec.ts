import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import UserRestrictionActions from './UserRestrictionActions.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type { UserRestrictionState, UsersClient } from '@/types/users'
const mocks = vi.hoisted(() => ({
  restrictions: vi.fn<UsersClient['restrictions']>(),
  changeRestriction: vi.fn<UsersClient['changeRestriction']>(),
}))
vi.mock('@/services/users', () => ({ createUsersClient: () => mocks }))
const id = 'ac220000-0000-4000-8000-000000000001'
const state: UserRestrictionState = {
  user_id: id,
  account_version: 7,
  banned: false,
  muted: false,
  muted_until: null,
  as_of: '2026-10-29T04:00:00Z',
  allowed_actions: ['ban', 'mute'],
}
let wrapper: VueWrapper
function button(label: string) {
  const value = wrapper.findAll('button').find((item) => item.text() === label)
  if (!value) throw new Error(`按钮缺失：${label}`)
  return value
}
async function start(superAdmin = true) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'synthetic',
    account: {
      id: 'admin',
      login_name: '合成管理员',
      version: 1,
      active: true,
      roles: [superAdmin ? 'super_admin' : 'review_operator'],
    },
  }
  wrapper = mount(UserRestrictionActions, { props: { userId: id }, global: { plugins: [pinia] } })
  await flushPromises()
}
async function prepare(label = '封禁') {
  await button(label).trigger('click')
  await wrapper.get('textarea').setValue('合成操作理由')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.restrictions.mockResolvedValue(state)
  mocks.changeRestriction.mockResolvedValue({
    ...state,
    account_version: 8,
    banned: true,
    allowed_actions: ['unban', 'mute'],
  })
})
afterEach(() => wrapper?.unmount())
it('普通运营不请求或展示直接操作', async () => {
  await start(false)
  expect(mocks.restrictions).not.toHaveBeenCalled()
  expect(wrapper.find('section').exists()).toBe(false)
})
it('封禁先重读版本并填写理由，确认后才提交并通知父页刷新', async () => {
  await start()
  mocks.restrictions.mockResolvedValueOnce({ ...state, account_version: 9 })
  await prepare()
  expect(mocks.changeRestriction).not.toHaveBeenCalled()
  await button('确认封禁').trigger('click')
  await flushPromises()
  expect(mocks.changeRestriction).toHaveBeenCalledWith(
    id,
    'ban',
    { reason: '合成操作理由', expected_version: 9 },
    expect.any(String),
    expect.any(AbortSignal),
  )
  expect(wrapper.emitted('changed')).toHaveLength(1)
})
it.each([
  ['解封', 'unban'],
  ['取消禁言', 'unmute'],
] as const)('%s不混淆另一种限制', async (label, action) => {
  mocks.restrictions.mockResolvedValue({
    ...state,
    banned: true,
    muted: true,
    muted_until: '2026-11-05T04:00:00Z',
    allowed_actions: ['unban', 'unmute'],
  })
  await start()
  await prepare(label)
  expect(wrapper.text()).toContain(
    action === 'unban' ? '仍有效的禁言继续生效' : '仍有效的封禁继续生效',
  )
  await button('确认' + label).trigger('click')
  await flushPromises()
  expect(mocks.changeRestriction.mock.calls[0]?.[1]).toBe(action)
})
it('禁言明确7天，取消填写不产生请求', async () => {
  await start()
  await button('禁言').trigger('click')
  expect(wrapper.text()).toContain('禁言7天')
  expect(button('核对用户操作').attributes('disabled')).toBeDefined()
  await wrapper.get('textarea').setValue('合成')
  await button('取消操作').trigger('click')
  expect(mocks.changeRestriction).not.toHaveBeenCalled()
})
it('409清空旧确认并重读，必须重新选择', async () => {
  await start()
  await prepare()
  mocks.changeRestriction.mockRejectedValueOnce(new ApiError(409))
  await button('确认封禁').trigger('click')
  await flushPromises()
  expect(wrapper.find('[aria-label="用户操作确认"]').exists()).toBe(false)
  expect(wrapper.text()).toContain('重新选择并确认')
  expect(mocks.restrictions).toHaveBeenCalledTimes(3)
})
it('网络不明同键同请求重试，不伪装成功', async () => {
  await start()
  await prepare()
  mocks.changeRestriction.mockRejectedValueOnce(new Error('合成断网'))
  await button('确认封禁').trigger('click')
  await flushPromises()
  expect(wrapper.emitted('changed')).toBeUndefined()
  await button('确认封禁').trigger('click')
  await flushPromises()
  expect(mocks.changeRestriction.mock.calls[0]?.slice(0, 4)).toEqual(
    mocks.changeRestriction.mock.calls[1]?.slice(0, 4),
  )
})
it('状态预读已变化则不再确认旧动作', async () => {
  await start()
  mocks.restrictions.mockResolvedValueOnce({
    ...state,
    banned: true,
    allowed_actions: ['unban', 'mute'],
  })
  await prepare()
  expect(wrapper.find('[aria-label="用户操作确认"]').exists()).toBe(false)
  expect(wrapper.text()).toContain('状态已变化')
})
it('撤权清空理由和确认，403/404不继续操作', async () => {
  await start()
  await prepare()
  const admin = useAdminStore()
  if (admin.session) admin.session.account.roles = []
  await flushPromises()
  expect(wrapper.find('textarea').exists()).toBe(false)
  expect(wrapper.find('[aria-label="用户操作确认"]').exists()).toBe(false)
})
it('404通知父页重新查询用户', async () => {
  await start()
  await prepare()
  mocks.changeRestriction.mockRejectedValueOnce(new ApiError(404))
  await button('确认封禁').trigger('click')
  await flushPromises()
  expect(wrapper.emitted('missing')).toHaveLength(1)
})
