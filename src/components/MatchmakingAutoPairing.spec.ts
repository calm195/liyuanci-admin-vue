import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MatchmakingAutoPairing from './MatchmakingAutoPairing.vue'
import MatchmakingScore from './MatchmakingScore.vue'
import { useAdminStore } from '@/stores/admin'
import fixture from '@/services/matchmaking-auto.contract.spec.json'
const transport = vi.fn<typeof fetch>()
const response = (data: unknown, status = 200) =>
  Promise.resolve(Response.json({ code: status === 200 ? 0 : status, data }, { status }))
let wrapper: VueWrapper
let pinia: ReturnType<typeof createPinia>
function render() {
  return mount(MatchmakingAutoPairing, {
    props: {
      activityID: fixture.activity_id,
      activityVersion: fixture.activity_version,
      disabled: false,
    },
    global: { plugins: [pinia] },
  })
}
function button(label: string) {
  const result = wrapper.findAll('button').find((item) => item.text() === label)
  if (!result) throw new Error(label)
  return result
}
function writes() {
  return transport.mock.calls.filter((call) => call[1]?.method === 'POST')
}
beforeEach(async () => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', transport)
  pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'synthetic',
    account: {
      id: 'synthetic',
      login_name: '合成管理员',
      version: 1,
      roles: ['review_operator'],
      active: true,
    },
  }
  transport.mockImplementation((_input, init) =>
    response(init?.method === 'POST' ? { id: fixture.id } : fixture),
  )
  wrapper = render()
  await flushPromises()
})
afterEach(() => {
  wrapper.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe('全员自动分配工作台', () => {
  it('展示基础加标签和双向命中、未匹配及排除原因', async () => {
    expect(wrapper.text()).toContain('总分 120')
    expect(wrapper.text()).toContain('基础 100 + 标签 20')
    expect(wrapper.text()).toContain('合成参与者甲个人 → 合成参与者乙理想：温柔、真诚')
    await button('未匹配原因（1）').trigger('click')
    expect(wrapper.text()).toContain('合格候选已分配给其他参与者')
    await button('未参与原因（2）').trigger('click')
    expect(wrapper.text()).toContain('保持原配对')
  })
  it('应用前二次核对，用ready任务和快照版本提交', async () => {
    await button('确认应用为待发布配对').trigger('click')
    expect(writes()).toHaveLength(0)
    transport.mockImplementation((_input, init) =>
      response(
        init?.method === 'POST'
          ? { id: fixture.id }
          : { ...fixture, status: 'applied', version: 4 },
      ),
    )
    await button('确认应用 1 组').trigger('click')
    await flushPromises()
    expect(writes()[0]?.[1]?.body).toBe(
      JSON.stringify({ expected_version: 3, activity_version: 8 }),
    )
    expect(wrapper.emitted('applied')).toHaveLength(1)
    expect(wrapper.text()).toContain('已应用为待发布配对')
  })
  it('应用未知结果离页保留请求并同键重试', async () => {
    await button('确认应用为待发布配对').trigger('click')
    transport.mockRejectedValueOnce(new TypeError('offline'))
    await button('确认应用 1 组').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('尚未确认')
    wrapper.unmount()
    wrapper = render()
    await flushPromises()
    await button('原样重试自动分配').trigger('click')
    await flushPromises()
    expect(writes()).toHaveLength(2)
    expect(writes()[0]?.[1]?.body).toBe(writes()[1]?.[1]?.body)
    expect(writes()[0]?.[1]?.headers).toEqual(writes()[1]?.[1]?.headers)
  })
  it('活动版本变化禁用应用，重新生成使用新活动版本', async () => {
    await wrapper.setProps({ activityVersion: 9 })
    expect(wrapper.text()).not.toContain('合成参与者甲')
    expect(button('确认应用为待发布配对').attributes('disabled')).toBeDefined()
    await button('重新生成全员预览').trigger('click')
    await flushPromises()
    expect(writes()[0]?.[1]?.body).toBe(JSON.stringify({ expected_version: 9 }))
  })
  it('轮询后台进度到ready后停止，旧会话不能继续显示', async () => {
    wrapper.unmount()
    vi.useFakeTimers()
    transport
      .mockResolvedValueOnce(Response.json({ code: 0, data: { ...fixture, status: 'running' } }))
      .mockResolvedValueOnce(Response.json({ code: 0, data: fixture }))
    wrapper = render()
    await flushPromises()
    expect(wrapper.find('progress').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    expect(wrapper.find('progress').exists()).toBe(false)
    const calls = transport.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(transport.mock.calls).toHaveLength(calls)
    useAdminStore().session = null
    await flushPromises()
    expect(wrapper.text()).not.toContain('合成参与者甲')
  })
  it('轮询短暂断网后自动恢复并展示完成方案', async () => {
    wrapper.unmount()
    vi.useFakeTimers()
    transport
      .mockResolvedValueOnce(Response.json({ code: 0, data: { ...fixture, status: 'running' } }))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(Response.json({ code: 0, data: fixture }))
    wrapper = render()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    expect(wrapper.find('progress').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    expect(wrapper.find('progress').exists()).toBe(false)
    expect(wrapper.text()).toContain('合成参与者甲')
  })
  it('无历史任务时可创建，404不展示错误', async () => {
    wrapper.unmount()
    transport.mockResolvedValueOnce(Response.json({ code: 404 }, { status: 404 }))
    wrapper = render()
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(button('生成全员分配预览').attributes('disabled')).toBeUndefined()
  })
})

it('基础展示遵循后端取整总分，避免半分明细造成加总不一致', () => {
  const score = mount(MatchmakingScore, {
    props: {
      score: 97,
      details: { mbti: 30, age: 20, campus: 12.5, height: 15, weight: 10, traits: 10 },
    },
  })
  expect(score.text()).toContain('基础 87 + 标签 10')
  score.unmount()
})
