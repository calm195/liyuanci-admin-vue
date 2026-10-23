import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CrisisEscalation from './CrisisEscalation.vue'
import type * as crisisService from '@/services/crisis'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
const mocks = vi.hoisted(() => ({ escalate: vi.fn() }))
vi.mock('@/services/crisis', async (original) => ({
  ...(await original<typeof crisisService>()),
  createCrisisClient: () => mocks,
}))
beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  useAdminStore().session = {
    token: 'test',
    account: {
      id: 'admin',
      login_name: '测试角色',
      version: 1,
      active: true,
      roles: ['crisis_operator'],
    },
  }
  mocks.escalate.mockResolvedValue({ id: 'crisis', version: 1, status: 'pending_handling' })
})
afterEach(() => vi.restoreAllMocks())
const global = { stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } }
describe('T030 按来源案件升级危机', () => {
  it('普通审核角色没有危机升级入口', () => {
    const session = useAdminStore().session
    if (!session) throw new Error('无会话')
    session.account.roles = ['review_operator']
    const wrapper = mount(CrisisEscalation, {
      props: { source: 'task', sourceId: 'task', version: 3 },
      global,
    })
    expect(wrapper.find('section').exists()).toBe(false)
    expect(mocks.escalate).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it.each(['task', 'report'] as const)('%s绑定来源独立版本，理由必填且二次确认', async (source) => {
    const wrapper = mount(CrisisEscalation, {
      props: { source, sourceId: 'source', version: 19 },
      global,
    })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('textarea').setValue('  人工核对风险  ')
    await wrapper.get('form').trigger('submit')
    expect(mocks.escalate).not.toHaveBeenCalled()
    await wrapper.get('[aria-label="危机升级确认"] button').trigger('click')
    await flushPromises()
    expect(mocks.escalate).toHaveBeenCalledWith(
      source,
      'source',
      { reason: '人工核对风险', expected_version: 19 },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(wrapper.emitted('escalated')?.[0]?.[0]).toMatchObject({ id: 'crisis', version: 1 })
    wrapper.unmount()
  })
  it('409来源已过期时禁用旧操作并请求父页面重读', async () => {
    const wrapper = mount(CrisisEscalation, {
      props: { source: 'report', sourceId: 'source', version: 19 },
      global,
    })
    mocks.escalate.mockRejectedValueOnce(new ApiError(409))
    await wrapper.get('textarea').setValue('理由')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('[aria-label="危机升级确认"] button').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('conflict')).toHaveLength(1)
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
    expect(mocks.escalate).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
  it('网络失败原键重试，来源版本变化清空理由和旧确认', async () => {
    const wrapper = mount(CrisisEscalation, {
      props: { source: 'report', sourceId: 'source', version: 19 },
      global,
    })
    mocks.escalate.mockRejectedValueOnce(new Error('离线'))
    await wrapper.get('textarea').setValue('理由')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('[aria-label="危机升级确认"] button').trigger('click')
    await flushPromises()
    const key: unknown = mocks.escalate.mock.calls[0]?.[3]
    await wrapper.get('[aria-label="危机升级确认"] button').trigger('click')
    await flushPromises()
    expect(mocks.escalate.mock.calls[1]?.[3]).toBe(key)
    await wrapper.setProps({ version: 20 })
    expect(wrapper.get('textarea').element).toHaveProperty('value', '')
    expect(wrapper.find('[aria-label="危机升级确认"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
