import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WhisperCrisesView from './WhisperCrisesView.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type { CrisisDetail, CrisisSummary } from '@/types/whispers'
import type * as Service from '@/services/whispers'

const mocks = vi.hoisted(() => ({
  whisperAdminCrisesList: vi.fn(),
  whisperAdminCrisisGet: vi.fn(),
  whisperAdminCrisisAct: vi.fn(),
  whisperAdminCrisisFalsePositive: vi.fn(),
}))
vi.mock('@/services/whispers', async (original) => ({
  ...(await original<typeof Service>()),
  createWhispersClient: () => mocks,
}))
const first: CrisisDetail = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  version: 4,
  status: 'open',
  source: {
    id: '11111111-1111-1111-1111-111111111111',
    kind: 'whisper_capsule',
    content_version: 7,
  },
  handoff_at: '2026-10-27T00:00:00Z',
  allowed_actions: ['whisperAdminCrisisAct', 'whisperAdminCrisisFalsePositive'],
  body: '合成限定正文',
  student_number: null,
  identity_status: 'not_verified',
  evidence_scope_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  timeline: [
    {
      at: '2026-10-27T00:00:00Z',
      action: 'follow_up',
      operator_label: '合成岗位',
      reason: '合成跟进',
    },
  ],
  care_delivery: 'delivered',
  staff_delivery: 'pending',
}
const second: CrisisDetail = {
  ...first,
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  body: '第二个限定正文',
  source: { ...first.source, kind: 'whisper_nickname' },
}
function summary(value: CrisisDetail): CrisisSummary {
  return {
    id: value.id,
    version: value.version,
    source: value.source,
    status: value.status,
    handoff_at: value.handoff_at,
    allowed_actions: [],
  }
}
function deferred<T>() {
  let finish: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    finish = resolve
  })
  return {
    promise,
    resolve(value: T) {
      if (!finish) throw new Error('未准备')
      finish(value)
    },
  }
}
let wrapper: VueWrapper | undefined
function view() {
  if (!wrapper) throw new Error('未挂载')
  return wrapper
}
function button(label: string) {
  const found = view()
    .findAll('button')
    .find((item) => item.text() === label)
  if (!found) throw new Error(`未找到按钮：${label}`)
  return found
}
function hasButton(label: string) {
  return view()
    .findAll('button')
    .some((item) => item.text() === label)
}
async function open(id = first.id) {
  const found = view()
    .findAll('.workflow-list button')
    .find((item) => item.text().includes(id))
  if (!found) throw new Error('无案件')
  await found.trigger('click')
  await flushPromises()
}
async function process(label = '接手危机') {
  await button(label).trigger('click')
  await flushPromises()
  await view().get('#whisper-crisis-reason').setValue(' 合成处理理由 ')
}
async function confirm() {
  await view().get('form').trigger('submit')
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
      id: 'op',
      login_name: '合成危机',
      version: 1,
      active: true,
      roles: ['crisis_operator'],
    },
  }
  mocks.whisperAdminCrisesList.mockResolvedValue({
    items: [summary(first), summary(second)],
    next_cursor: null,
  })
  mocks.whisperAdminCrisisGet.mockImplementation((id: string) =>
    Promise.resolve({ ...(id === first.id ? first : second) }),
  )
  mocks.whisperAdminCrisisAct.mockResolvedValue({
    ...first,
    version: 5,
    status: 'in_progress',
    body: '回执正文不应保留',
  })
  mocks.whisperAdminCrisisFalsePositive.mockResolvedValue({
    ...first,
    version: 5,
    status: 'false_positive',
  })
  wrapper = mount(WhisperCrisesView, {
    global: { plugins: [pinia], stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('WA-04 REQ-017/018/019 树洞危机', () => {
  it('未认证身份即使出现学号也不展示，空时间线和取消投递有明确反馈', async () => {
    await flushPromises()
    mocks.whisperAdminCrisisGet.mockResolvedValueOnce({
      ...first,
      student_number: '不应展示的合成学号',
      timeline: [],
      care_delivery: 'cancelled',
      staff_delivery: 'cancelled',
    })
    await open()
    expect(view().text()).not.toContain('不应展示的合成学号')
    expect(view().text()).toContain('尚无认证学号')
    expect(view().text()).toContain('暂无时间线记录')
    expect(view().get('[aria-label="危机投递状态"]').text()).toContain('关怀消息：已取消')
  })
  it('列表不预取正文，选案才读取，未认证无学号，展示限定时间线及投递', async () => {
    await flushPromises()
    expect(mocks.whisperAdminCrisisGet).not.toHaveBeenCalled()
    expect(view().text()).not.toContain(first.body)
    await open()
    expect(view().text()).toContain('尚无认证学号')
    expect(view().text()).toContain('私密胶囊限定证据')
    expect(view().get('[aria-label="危机时间线"]').text()).toContain('合成跟进')
    expect(view().get('[aria-label="危机投递状态"]').text()).toContain('关怀消息：已投递')
    expect(view().text()).not.toContain(first.evidence_scope_id)
    expect(view().findAll('input[type="number"]')).toHaveLength(0)
  })
  it('超管才显示证据范围入口，验证学号只读并以文本展示正文和时间线', async () => {
    await flushPromises()
    const session = useAdminStore().session
    if (!session) throw new Error('缺少会话')
    session.account.roles = ['super_admin']
    mocks.whisperAdminCrisisGet.mockResolvedValueOnce({
      ...first,
      identity_status: 'verified',
      student_number: 'SYNTHETIC',
      body: '<script>合成正文</script>',
      timeline: [{ ...first.timeline[0], reason: '<img src=x>' }],
    })
    await open()
    expect(view().text()).toContain('已认证学号：SYNTHETIC')
    expect(view().text()).toContain(first.evidence_scope_id)
    expect(view().find('blockquote script').exists()).toBe(false)
    expect(view().find('[aria-label="危机时间线"] img').exists()).toBe(false)
    expect(view().findAll('input')).toHaveLength(0)
  })
  it.each([
    ['接手危机', 'take_over', 'in_progress'],
    ['记录跟进', 'follow_up', 'in_progress'],
    ['危机结案', 'resolve', 'resolved'],
    ['重试有效通知', 'retry_notification', 'open'],
  ] as const)(
    '%s使用案件版本与理由，回执显示实际状态并清除敏感字段',
    async (label, action, status) => {
      await flushPromises()
      await open()
      mocks.whisperAdminCrisisAct.mockResolvedValueOnce({
        ...first,
        version: 20,
        status,
        body: '回执正文不应保留',
      })
      await process(label)
      await confirm()
      expect(mocks.whisperAdminCrisisAct).toHaveBeenCalledWith(
        first.id,
        { expected_version: 4, action, reason: ' 合成处理理由 ' },
        expect.any(String),
        expect.any(AbortSignal),
      )
      expect(view().text()).toContain('案件版本 20')
      expect(view().find('blockquote').exists()).toBe(false)
      expect(view().text()).not.toContain('回执正文不应保留')
      expect(view().text()).not.toContain('SYNTHETIC')
      if (action === 'resolve') expect(view().text()).toContain('危机隔离不会因此解除')
      if (action === 'retry_notification') expect(view().text()).toContain('仍有效的通知待办')
    },
  )
  it('误报只带案件版本及理由，提示复核和胶囊到期边界', async () => {
    await flushPromises()
    await open()
    await process('标记误报')
    await confirm()
    expect(mocks.whisperAdminCrisisFalsePositive.mock.calls[0]?.[1]).toEqual({
      expected_version: 4,
      reason: ' 合成处理理由 ',
    })
    expect(view().text()).toContain('转普通复核不等于公开')
    expect(view().text()).toContain('胶囊仍须符合到期条件')
    expect(view().find('blockquote').exists()).toBe(false)
  })
  it('动作投影分别限制一般动作与误报，空投影只读', async () => {
    await flushPromises()
    mocks.whisperAdminCrisisGet.mockResolvedValueOnce({
      ...first,
      allowed_actions: ['whisperAdminCrisisFalsePositive'],
    })
    await open()
    expect(hasButton('接手危机')).toBe(false)
    expect(hasButton('标记误报')).toBe(true)
    mocks.whisperAdminCrisisGet.mockResolvedValueOnce({ ...first, allowed_actions: [] })
    await button('重新读取危机').trigger('click')
    await flushPromises()
    expect(hasButton('标记误报')).toBe(false)
    expect(view().text()).toContain('当前没有可执行的处理动作')
  })
  it('理由必填、500码点边界，取消后理由清空', async () => {
    await flushPromises()
    await open()
    await process()
    for (const reason of [' ', '😀'.repeat(501)]) {
      await view().get('#whisper-crisis-reason').setValue(reason)
      expect(button('核对操作').attributes('disabled')).toBeDefined()
    }
    await view().get('#whisper-crisis-reason').setValue('😀'.repeat(500))
    expect(button('核对操作').attributes('disabled')).toBeUndefined()
    await button('取消处理').trigger('click')
    await button('接手危机').trigger('click')
    await flushPromises()
    expect(view().get<HTMLTextAreaElement>('#whisper-crisis-reason').element.value).toBe('')
    expect(mocks.whisperAdminCrisisAct).not.toHaveBeenCalled()
  })
  it.each([404, 409])('%s清理正文表单，手动重读才取得新版本', async (status) => {
    await flushPromises()
    await open()
    await process()
    mocks.whisperAdminCrisisAct.mockRejectedValueOnce(new ApiError(status))
    await confirm()
    expect(view().find('blockquote').exists()).toBe(false)
    expect(view().find('form').exists()).toBe(false)
    expect(mocks.whisperAdminCrisisGet).toHaveBeenCalledTimes(1)
    mocks.whisperAdminCrisisGet.mockResolvedValueOnce({ ...first, version: 19 })
    await button('重新读取危机').trigger('click')
    await flushPromises()
    await process()
    await confirm()
    expect(mocks.whisperAdminCrisisAct.mock.calls[1]?.[1]).toMatchObject({ expected_version: 19 })
  })
  it('未知写结果原键原体重试并防双击，禁止取消和修改', async () => {
    await flushPromises()
    await open()
    await process()
    mocks.whisperAdminCrisisAct.mockRejectedValueOnce(new TypeError('offline'))
    await confirm()
    const original = mocks.whisperAdminCrisisAct.mock.calls[0]
    expect(button('取消处理').attributes('disabled')).toBeDefined()
    expect(button('返回修改').attributes('disabled')).toBeDefined()
    const pending = deferred<CrisisDetail>()
    mocks.whisperAdminCrisisAct.mockReturnValueOnce(pending.promise)
    await button('使用原请求重试').trigger('click')
    await button('正在提交…').trigger('click')
    expect(mocks.whisperAdminCrisisAct).toHaveBeenCalledTimes(2)
    expect(mocks.whisperAdminCrisisAct.mock.calls[1]?.slice(0, 3)).toEqual(original?.slice(0, 3))
    pending.resolve({ ...first, version: 5 })
    await flushPromises()
  })
  it('误报结果未知也只能重试原请求，不转成普通危机动作', async () => {
    await flushPromises()
    await open()
    await process('标记误报')
    mocks.whisperAdminCrisisFalsePositive.mockRejectedValueOnce(new TypeError('offline'))
    await confirm()
    const original = mocks.whisperAdminCrisisFalsePositive.mock.calls[0]
    await button('使用原请求重试').trigger('click')
    await flushPromises()
    expect(mocks.whisperAdminCrisisFalsePositive.mock.calls[1]?.slice(0, 3)).toEqual(
      original?.slice(0, 3),
    )
    expect(mocks.whisperAdminCrisisAct).not.toHaveBeenCalled()
  })
  it.each([400, 429, 503])('%s明确失败可修改，不保留旧幂等键', async (status) => {
    await flushPromises()
    await open()
    await process()
    mocks.whisperAdminCrisisAct.mockRejectedValueOnce(new ApiError(status))
    await confirm()
    expect(button('取消处理').attributes('disabled')).toBeUndefined()
    const key: unknown = mocks.whisperAdminCrisisAct.mock.calls[0]?.[2]
    await view().get('#whisper-crisis-reason').setValue('修改后理由')
    await confirm()
    expect(mocks.whisperAdminCrisisAct.mock.calls[1]?.[2]).not.toBe(key)
  })
  it('空页可继续，去重、循环游标及失败可重试', async () => {
    await flushPromises()
    mocks.whisperAdminCrisesList
      .mockResolvedValueOnce({ items: [], next_cursor: 'a' })
      .mockRejectedValueOnce(new ApiError(503))
      .mockResolvedValueOnce({ items: [summary(first), summary(first)], next_cursor: 'a' })
    await button('刷新列表').trigger('click')
    await flushPromises()
    expect(view().text()).toContain('当前页暂无危机')
    await button('加载更多危机').trigger('click')
    await flushPromises()
    expect(view().text()).toContain('服务暂不可用')
    await button('重试加载').trigger('click')
    await flushPromises()
    expect(view().findAll('.workflow-list li')).toHaveLength(1)
    expect(view().text()).toContain('分页游标重复')
  })
  it('切案取消旧读取，晚到正文不可覆盖新案', async () => {
    await flushPromises()
    const pending = deferred<CrisisDetail>()
    mocks.whisperAdminCrisisGet.mockReturnValueOnce(pending.promise)
    await open()
    await open(second.id)
    pending.resolve(first)
    await flushPromises()
    expect(view().text()).toContain(second.body)
    expect(view().text()).not.toContain(first.body)
  })
  it('分页发现版本变化清正文，开始处理时取消在途分页', async () => {
    await flushPromises()
    mocks.whisperAdminCrisesList.mockResolvedValueOnce({
      items: [summary(first)],
      next_cursor: 'a',
    })
    await button('刷新列表').trigger('click')
    await flushPromises()
    await open()
    mocks.whisperAdminCrisesList.mockResolvedValueOnce({
      items: [{ ...summary(first), version: 9 }],
      next_cursor: 'b',
    })
    await button('加载更多危机').trigger('click')
    await flushPromises()
    expect(view().find('blockquote').exists()).toBe(false)
    await open()
    const pending = deferred<{ items: CrisisSummary[]; next_cursor: string | null }>()
    mocks.whisperAdminCrisesList.mockReturnValueOnce(pending.promise)
    await button('加载更多危机').trigger('click')
    await process()
    pending.resolve({ items: [{ ...summary(first), version: 10 }], next_cursor: null })
    await flushPromises()
    expect(view().find('form').exists()).toBe(true)
    await confirm()
    expect(mocks.whisperAdminCrisisAct.mock.calls[0]?.[1]).toMatchObject({ expected_version: 4 })
  })
  it.each([401, 403])('%s拒绝清除正文时间线表单', async (status) => {
    await flushPromises()
    await open()
    await process()
    mocks.whisperAdminCrisisAct.mockRejectedValueOnce(new ApiError(status))
    await confirm()
    expect(view().find('blockquote').exists()).toBe(false)
    expect(view().find('form').exists()).toBe(false)
    expect(view().find('[aria-label="危机时间线"]').exists()).toBe(false)
    expect(useAdminStore().authenticated).toBe(status !== 401)
  })
  it.each(['role', 'account', 'leave'] as const)(
    '%s失效取消请求，晚到回执不能回填',
    async (mode) => {
      await flushPromises()
      await open()
      await process()
      const pending = deferred<CrisisDetail>()
      mocks.whisperAdminCrisisAct.mockReturnValueOnce(pending.promise)
      await view().get('form').trigger('submit')
      await button('确认提交').trigger('click')
      const signal: unknown = mocks.whisperAdminCrisisAct.mock.calls[0]?.[3]
      const session = useAdminStore().session
      if (!session) throw new Error('缺少会话')
      if (mode === 'role') session.account.roles = ['review_operator']
      if (mode === 'account') useAdminStore().session = { ...session, token: 'another' }
      if (mode === 'leave') {
        view().unmount()
        wrapper = undefined
      }
      pending.resolve({ ...first, body: '晚到敏感正文' })
      await flushPromises()
      expect(signal).toBeInstanceOf(AbortSignal)
      if (signal instanceof AbortSignal) expect(signal.aborted).toBe(true)
      if (mode !== 'leave') {
        expect(view().find('blockquote').exists()).toBe(false)
        expect(view().find('form').exists()).toBe(false)
        expect(view().text()).not.toContain('晚到敏感正文')
      }
    },
  )
  it('普通角色直接挂载不请求危机列表', async () => {
    await flushPromises()
    wrapper?.unmount()
    const session = useAdminStore().session
    if (!session) throw new Error('缺少会话')
    session.account.roles = ['review_operator']
    mocks.whisperAdminCrisesList.mockClear()
    wrapper = mount(WhisperCrisesView)
    await flushPromises()
    expect(mocks.whisperAdminCrisesList).not.toHaveBeenCalled()
  })
})
