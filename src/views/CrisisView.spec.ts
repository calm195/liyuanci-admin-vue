import { mount, flushPromises } from '@vue/test-utils'
import type * as crisisService from '@/services/crisis'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CrisisView from './CrisisView.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type { CrisisDetail, CrisisEvidence, CrisisSummary } from '@/types/crisis'
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  timeline: vi.fn(),
  work: vi.fn(),
  evidence: vi.fn(),
  act: vi.fn(),
  falsePositive: vi.fn(),
}))
vi.mock('@/services/crisis', async (original) => ({
  ...(await original<typeof crisisService>()),
  createCrisisClient: () => mocks,
}))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
const first: CrisisDetail = {
  id: 'case-a',
  version: 7,
  status: 'pending_handling',
  student_number: '测试完整学号',
  body: '本案测试正文',
  timeline: [{ id: 'evidence-a', version: 7, kind: 'evidence', status: 'open' }],
}
const second: CrisisDetail = {
  ...first,
  id: 'case-b',
  body: '另一测试正文',
  student_number: '另一学号',
}
let wrapper: VueWrapper | undefined
function button(label: string) {
  const found = wrapper?.findAll('button').find((item) => item.text() === label)
  if (!found) throw new Error(`未找到按钮：${label}`)
  return found
}
function deferred<T>() {
  let finish: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    finish = resolve
  })
  return {
    promise,
    resolve(value: T) {
      if (!finish) throw new Error('请求未准备')
      finish(value)
    },
  }
}
async function open(id = 'case-a') {
  const found = wrapper?.findAll('.workflow-list button').find((item) => item.text().startsWith(id))
  if (!found) throw new Error('案件未找到')
  await found.trigger('click')
  await flushPromises()
}
async function confirm() {
  await wrapper?.get('#crisis-reason').setValue('  测试核对理由  ')
  await wrapper?.get('form').trigger('submit')
  await button('确认提交').trigger('click')
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'test',
    account: {
      id: 'operator',
      login_name: '测试危机角色',
      version: 1,
      active: true,
      roles: ['crisis_operator'],
    },
  }
  mocks.list.mockResolvedValue({
    items: [first, second].map(({ id, version, status }) => ({ id, version, status })),
    next_cursor: null,
  })
  mocks.detail.mockImplementation((id: string) =>
    Promise.resolve({ ...(id === first.id ? first : second) }),
  )
  mocks.timeline.mockResolvedValue([
    { id: 'event', actor: 'system', action: 'isolated', at: '2026-10-23T00:00:00Z', reason: '' },
  ])
  mocks.work.mockResolvedValue({
    handoff_at: '2026-10-24T00:00:00Z',
    items: [
      { id: 'care', kind: 'care', status: 'pending', attempts: 2, next_at: '2026-10-23T23:00:00Z' },
      {
        id: 'operator',
        kind: 'operator',
        status: 'sent',
        attempts: 1,
        next_at: '2026-10-23T23:00:00Z',
      },
    ],
  })
  mocks.evidence.mockResolvedValue({
    id: 'evidence-a',
    version: 1,
    case_id: first.id,
    student_number: first.student_number,
    body: '限定证据正文',
    status: 'open',
  })
  mocks.act.mockResolvedValue({ id: first.id, version: 8, status: 'handling' })
  mocks.falsePositive.mockResolvedValue({ id: first.id, version: 8, status: 'false_positive' })
  wrapper = mount(CrisisView, { global: { plugins: [pinia] } })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})
describe('T030 危机工作台案件、证据及安全生命周期', () => {
  it('列表不读身份，详情按需加载，学号必须显式显示且关闭即清除', async () => {
    await flushPromises()
    expect(mocks.detail).not.toHaveBeenCalled()
    expect(wrapper?.text()).not.toContain(first.student_number)
    await open()
    expect(wrapper?.text()).toContain(first.body)
    expect(wrapper?.text()).not.toContain(first.student_number)
    await button('显示完整学号').trigger('click')
    expect(wrapper?.text()).toContain(first.student_number)
    await button('关闭案件并清除材料').trigger('click')
    expect(wrapper?.text()).not.toContain(first.body)
    expect(wrapper?.text()).not.toContain(first.student_number)
  })
  it('北京时间接手窗口与关怀/人员投递分开，不将送达当接手', async () => {
    await flushPromises()
    await open()
    expect(wrapper?.text()).toContain('2026年10月24日 08:00:00')
    expect(wrapper?.text()).toContain('本人关怀投递')
    expect(wrapper?.text()).toContain('授权人员通知')
    expect(wrapper?.text()).toContain('等待投递或重试')
    expect(wrapper?.text()).toContain('通知或关怀投递完成不代表人工已接手')
    expect(wrapper?.text()).not.toContain('倒计时')
  })
  it('只按当前案件引用读证据，收起后不显示晚到材料', async () => {
    await flushPromises()
    await open()
    const pending = deferred<CrisisEvidence>()
    mocks.evidence.mockReturnValueOnce(pending.promise)
    await button('查看证据 evidence-a').trigger('click')
    expect(mocks.evidence).toHaveBeenCalledWith('case-a', 'evidence-a', expect.any(AbortSignal))
    await button('收起证据').trigger('click')
    pending.resolve({
      id: 'evidence-a',
      case_id: 'case-a',
      version: 1,
      status: 'open',
      body: '迟到证据正文',
      student_number: '迟到学号',
    })
    await flushPromises()
    expect(wrapper?.text()).not.toContain('迟到证据正文')
  })
  it('接手理由必填且按当前案件版本二次确认，提交后清敏感材料', async () => {
    await flushPromises()
    await open()
    expect(button('核对处置').attributes('disabled')).toBeDefined()
    await confirm()
    expect(mocks.act).toHaveBeenCalledWith(
      'case-a',
      { action: 'take_over', reason: '测试核对理由', expected_version: 7 },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(wrapper?.text()).toContain('处置已确认')
    expect(wrapper?.text()).not.toContain(first.body)
  })
  it('误报走专用接口并提示转普通复核，不直接上架或送达', async () => {
    await flushPromises()
    await open()
    await wrapper?.get('#crisis-action').setValue('false_positive')
    expect(wrapper?.text()).toContain('不会直接公开或送达')
    await confirm()
    expect(mocks.falsePositive).toHaveBeenCalledWith(
      'case-a',
      { reason: '测试核对理由', expected_version: 7 },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(mocks.act).not.toHaveBeenCalled()
    expect(wrapper?.text()).toContain('后续须普通复核')
  })
  it.each(['resolved', 'false_positive', 'unknown'])('状态%s只读，不能再次处置', async (status) => {
    await flushPromises()
    mocks.detail.mockResolvedValueOnce({ ...first, status })
    await open()
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(wrapper?.text()).toContain('当前状态仅供查看')
  })
  it('通知重试回执不代表已送达，409清旧决定重读并禁止自动提交', async () => {
    await flushPromises()
    await open()
    await wrapper?.get('#crisis-action').setValue('retry_notification')
    await confirm()
    expect(wrapper?.text()).toContain('不代表通知已送达')
    await open()
    mocks.act.mockRejectedValueOnce(new ApiError(409))
    mocks.detail.mockResolvedValueOnce({ ...first, version: 9 })
    await confirm()
    expect(mocks.act).toHaveBeenCalledTimes(2)
    expect(wrapper?.text()).toContain('案件版本或状态已变化')
    expect(wrapper?.text()).toContain('案件版本 9')
    expect(wrapper?.find('[aria-label="危机处置确认"]').exists()).toBe(false)
    expect(wrapper?.get('#crisis-reason').element).toHaveProperty('value', '')
  })
  it('网络失败同输入重试复用键，确认后修改理由须重新核对', async () => {
    await flushPromises()
    await open()
    mocks.act.mockRejectedValueOnce(new Error('离线'))
    await confirm()
    const key: unknown = mocks.act.mock.calls[0]?.[2]
    await button('确认提交').trigger('click')
    await flushPromises()
    expect(mocks.act.mock.calls[1]?.[2]).toBe(key)
    await open()
    await wrapper?.get('#crisis-reason').setValue('准备理由')
    await wrapper?.get('form').trigger('submit')
    await button('返回修改').trigger('click')
    await wrapper?.get('#crisis-reason').setValue('更正理由')
    expect(wrapper?.find('[aria-label="危机处置确认"]').exists()).toBe(false)
  })
  it('切案丢弃迟到身份和时间线，不污染新案', async () => {
    await flushPromises()
    const pending = deferred<CrisisDetail>()
    mocks.detail.mockReturnValueOnce(pending.promise)
    await open()
    await open('case-b')
    pending.resolve(first)
    await flushPromises()
    expect(wrapper?.text()).toContain(second.body)
    expect(wrapper?.text()).not.toContain(first.body)
  })
  it.each([401, 403])('辅助读取%s也清全部材料，会话代次规则适用', async (status) => {
    await flushPromises()
    await open()
    await button('显示完整学号').trigger('click')
    mocks.work.mockRejectedValueOnce(new ApiError(status))
    await button('刷新待办').trigger('click')
    await flushPromises()
    expect(wrapper?.text()).not.toContain(first.body)
    expect(wrapper?.text()).not.toContain(first.student_number)
    expect(useAdminStore().authenticated).toBe(status !== 401)
  })
  it('辅助接口失败可单独重试，不编造时间线和待办', async () => {
    await flushPromises()
    mocks.timeline.mockRejectedValueOnce(new ApiError(503))
    mocks.work.mockRejectedValueOnce(new ApiError(503))
    await open()
    expect(wrapper?.get('[aria-label="危机投递待办"]').text()).toContain('服务暂不可用')
    await button('刷新待办').trigger('click')
    await flushPromises()
    expect(wrapper?.get('[aria-label="危机投递待办"]').text()).toContain('本人关怀投递')
    await button('刷新时间线').trigger('click')
    await flushPromises()
    expect(wrapper?.get('[aria-label="危机时间线"]').text()).toContain('自动隔离')
  })
  it('列表失败可重试，分页后清除详情，刷新回首页', async () => {
    await flushPromises()
    await open()
    mocks.list.mockRejectedValueOnce(new ApiError(404))
    await button('从首页刷新').trigger('click')
    await flushPromises()
    expect(wrapper?.text()).toContain('危机接口尚未装配')
    mocks.list.mockResolvedValueOnce({ items: [], next_cursor: 'opaque' })
    await button('重试列表').trigger('click')
    await flushPromises()
    mocks.list.mockResolvedValueOnce({ items: [], next_cursor: null })
    await button('下一页').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith('opaque', expect.any(AbortSignal))
    await button('从首页刷新').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith(null, expect.any(AbortSignal))
    expect(wrapper?.text()).not.toContain(first.body)
  })
  it('离页或换会话取消请求，迟到回执不会恢复旧主体材料', async () => {
    await flushPromises()
    await open()
    const pending = deferred<CrisisSummary>()
    mocks.act.mockReturnValueOnce(pending.promise)
    await wrapper?.get('#crisis-reason').setValue('测试理由')
    await wrapper?.get('form').trigger('submit')
    await button('确认提交').trigger('click')
    const requestSignal: unknown = mocks.act.mock.calls[0]?.[3]
    useAdminStore().clear()
    pending.resolve({ ...first, version: 8, status: 'handling' })
    await flushPromises()
    expect(wrapper?.find('[aria-label="危机处理回执"]').exists()).toBe(false)
    expect(wrapper?.text()).not.toContain(first.body)
    if (!(requestSignal instanceof AbortSignal)) throw new Error('请求缺取消信号')
    expect(requestSignal.aborted).toBe(true)
  })
})
