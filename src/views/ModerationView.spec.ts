import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ModerationView from './ModerationView.vue'
import { ElDrawer } from 'element-plus'
import CrisisEscalation from '@/components/CrisisEscalation.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type * as contentService from '@/services/content-transport'
import type { ModerationCase, ModerationOutcome } from '@/types/moderation'
vi.mock('@/components/CrisisEscalation.vue', () => ({
  default: {
    name: 'CrisisEscalation',
    emits: ['busyChange', 'conflict', 'escalated'],
    template: '<span />',
  },
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  decide: vi.fn(),
}))
vi.mock('@/services/content-transport', async (original) => ({
  ...(await original<typeof contentService>()),
  createModerationTransport: () => mocks,
}))
const first: ModerationCase = {
  id: 'case-a',
  version: 1,
  content_version: 2,
  body: '合成涉校命中正文',
  school_related: true,
  status: 'human_required',
}
const second: ModerationCase = {
  ...first,
  id: 'case-b',
  body: '另一合成正文',
  school_related: false,
}
let wrapper: VueWrapper | undefined
function button(text: string) {
  const found = wrapper?.findAll('button').find((item) => item.text() === text)
  if (!found) throw new Error(`未找到按钮：${text}`)
  return found
}
function deferred<T>() {
  let finish: ((value: T | PromiseLike<T>) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    finish = resolve
  })
  return {
    promise,
    resolve(value: T | PromiseLike<T>) {
      if (!finish) throw new Error('尚未准备')
      finish(value)
    },
  }
}
async function open(id = 'case-a') {
  const found = wrapper?.findAll('.workflow-list button').find((item) => item.text().startsWith(id))
  if (!found) throw new Error('未找到案件')
  await found.trigger('click')
  await flushPromises()
}
async function processing() {
  if (!wrapper?.find('form').exists()) {
    await button('处理内容审核').trigger('click')
    await flushPromises()
  }
}
async function confirm() {
  await processing()
  await wrapper?.get('form').trigger('submit')
  await button('确认提交').trigger('click')
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'synthetic',
    account: {
      login_name: 'synthetic-operator',
      id: 'operator',
      version: 1,
      active: true,
      roles: ['review_operator'],
    },
  }
  mocks.list.mockResolvedValue({
    items: [first, second].map(({ id, version, status, content_version }) => ({
      id,
      version,
      status,
      content_version,
    })),
    next_cursor: null,
  })
  mocks.detail.mockImplementation((id: string) =>
    Promise.resolve(id === first.id ? { ...first } : { ...second }),
  )
  mocks.decide.mockResolvedValue({
    content_decision: 'approved',
    business_outcome: 'cancelled',
    version: 2,
  })
  wrapper = mount(ModerationView, { global: { plugins: [pinia] } })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})
describe('T017 真实内容审核页面交互', () => {
  it('列表不加载正文，案件详情展示精确正文版本及涉校未经证实提示', async () => {
    await flushPromises()
    expect(wrapper?.text()).not.toContain('合成涉校命中正文')
    expect(mocks.detail).not.toHaveBeenCalled()
    await open()
    expect(wrapper?.text()).toContain('合成涉校命中正文')
    expect(wrapper?.text()).toContain('正文版本 2')
    expect(wrapper?.text()).toContain('未经证实')
    expect(wrapper?.find('input[type="search"]').exists()).toBe(false)
    await open('case-b')
    expect(wrapper?.text()).not.toContain('本正文版本涉及学校官方内容')
  })
  it('内容通过与业务取消分开展示，不能把通过当作公开', async () => {
    await flushPromises()
    await open()
    await confirm()
    expect(wrapper?.text()).toContain('内容判定：通过')
    expect(wrapper?.text()).toContain('业务结果：业务已取消')
    expect(wrapper?.find('blockquote').exists()).toBe(false)
    expect(mocks.decide).toHaveBeenCalledWith(
      'case-a',
      { decision: 'approved', expected_version: 1 },
      expect.any(String),
      expect.any(AbortSignal),
    )
  })
  it('驳回必填去空白原因和建议，提交前可返回修改', async () => {
    await flushPromises()
    await open()
    await processing()
    await wrapper?.get('input[value="rejected"]').setValue()
    await wrapper?.get('#moderation-reason').setValue(' ')
    await wrapper?.get('#moderation-suggestion').setValue('请改写')
    expect(button('核对操作').attributes('disabled')).toBeDefined()
    await wrapper?.get('#moderation-reason').setValue(' 合成违规 ')
    await processing()
    await wrapper?.get('form').trigger('submit')
    expect(mocks.decide).not.toHaveBeenCalled()
    await button('返回修改').trigger('click')
    await confirm()
    expect(mocks.decide).toHaveBeenCalledWith(
      'case-a',
      {
        decision: 'rejected',
        expected_version: 1,
        reason: '合成违规',
        revision_suggestion: '请改写',
      },
      expect.any(String),
      expect.any(AbortSignal),
    )
  })
  it('409重新读取新正文版本并清空旧决定，不自动重提', async () => {
    await flushPromises()
    await open()
    mocks.decide.mockRejectedValueOnce(new ApiError(409))
    mocks.detail.mockResolvedValueOnce({
      ...first,
      version: 3,
      content_version: 4,
      body: '新版合成正文',
      school_related: false,
    })
    await confirm()
    expect(wrapper?.text()).toContain('新版合成正文')
    expect(wrapper?.text()).toContain('旧操作不会自动重试')
    expect(wrapper?.text()).not.toContain('合成涉校命中正文')
    expect(mocks.decide).toHaveBeenCalledTimes(1)
    expect(wrapper?.find('[aria-label="操作确认"]').exists()).toBe(false)
  })
  it('409重读期间切案，旧冲突提示不污染新案', async () => {
    await flushPromises()
    await open()
    const reread = deferred<ModerationCase>()
    mocks.decide.mockRejectedValueOnce(new ApiError(409))
    mocks.detail.mockReturnValueOnce(reread.promise)
    await confirm()
    await open('case-b')
    reread.resolve({ ...first, version: 3 })
    await flushPromises()
    expect(wrapper?.text()).toContain('另一合成正文')
    expect(wrapper?.text()).not.toContain('旧操作不会自动重试')
  })
  it('切案后旧正文和旧回执晚到不影响新案', async () => {
    await flushPromises()
    const old = deferred<ModerationCase>()
    mocks.detail.mockReturnValueOnce(old.promise)
    await open()
    await open('case-b')
    old.resolve(first)
    await flushPromises()
    expect(wrapper?.text()).toContain('另一合成正文')
    const write = deferred<ModerationOutcome>()
    mocks.decide.mockReturnValueOnce(write.promise)
    await processing()
    await wrapper?.get('form').trigger('submit')
    await button('确认提交').trigger('click')
    expect(button('刷新列表').attributes('disabled')).toBeDefined()
    wrapper?.unmount()
    const pinia = getActivePinia()
    if (!pinia) throw new Error('缺少会话')
    wrapper = mount(ModerationView, { global: { plugins: [pinia] } })
    await flushPromises()
    await open()
    write.resolve({ content_decision: 'approved', business_outcome: 'published', version: 2 })
    await flushPromises()
    expect(wrapper?.text()).toContain('合成涉校命中正文')
    expect(wrapper?.find('[aria-label="审核回执"]').exists()).toBe(false)
  })
  it('重复提交只发一次，同内容失败重试使用同一幂等键', async () => {
    await flushPromises()
    await open()
    const pending = deferred<ModerationOutcome>()
    mocks.decide.mockReturnValueOnce(pending.promise)
    await processing()
    await wrapper?.get('form').trigger('submit')
    await button('确认提交').trigger('click')
    await button('正在提交…').trigger('click')
    expect(mocks.decide).toHaveBeenCalledTimes(1)
    pending.resolve({ content_decision: 'approved', business_outcome: 'ready', version: 2 })
    await flushPromises()
    await open()
    mocks.decide.mockRejectedValueOnce(new Error('offline'))
    await confirm()
    const key: unknown = mocks.decide.mock.calls[1]?.[2]
    await button('确认提交').trigger('click')
    await flushPromises()
    expect(mocks.decide.mock.calls[2]?.[2]).toBe(key)
  })
  it('只提供正式审核决定，不显示未交付的下线或解除入口', async () => {
    await flushPromises()
    expect(wrapper?.text()).not.toContain('合成内容处置样例')
    expect(wrapper?.text()).not.toContain('解除普通限制')
    expect(wrapper?.text()).not.toContain('普通违规下线')
  })
  it.each([401, 403])('%s 清空正文，401清会话而403进入拒绝流程', async (status) => {
    await flushPromises()
    await open()
    mocks.decide.mockRejectedValueOnce(new ApiError(status))
    await confirm()
    expect(wrapper?.find('blockquote').exists()).toBe(false)
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(useAdminStore().authenticated).toBe(status !== 401)
    expect(useAdminStore().forbidden).toBe(status === 403 ? 1 : 0)
  })
  it('权限收回和离开页面取消请求，旧内容不再展示', async () => {
    await flushPromises()
    await open()
    const current = useAdminStore().session
    if (!current) throw new Error('缺少合成会话')
    current.account.roles = ['crisis_operator']
    await flushPromises()
    expect(wrapper?.text()).not.toContain('合成涉校命中正文')
    expect(wrapper?.find('.workflow-list button').exists()).toBe(false)
    const requestSignal: unknown = mocks.detail.mock.calls[0]?.[1]
    wrapper?.unmount()
    wrapper = undefined
    if (!(requestSignal instanceof AbortSignal)) throw new Error('缺少取消信号')
    expect(requestSignal.aborted).toBe(true)
  })
  it('列表失败可重试为空，分页清除正文；未知状态只读', async () => {
    await flushPromises()
    await open()
    mocks.list.mockRejectedValueOnce(new Error('offline'))
    await button('刷新列表').trigger('click')
    await flushPromises()
    expect(wrapper?.find('blockquote').exists()).toBe(false)
    mocks.list.mockResolvedValueOnce({ items: [], next_cursor: null })
    await button('重试列表').trigger('click')
    await flushPromises()
    expect(wrapper?.text()).toContain('暂无审核案件')
    mocks.list.mockResolvedValue({
      items: [{ id: first.id, version: 1, status: 'human_required' }],
      next_cursor: 'next',
    })
    await button('刷新列表').trigger('click')
    await flushPromises()
    await open()
    await button('下一页').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith('next', expect.any(AbortSignal))
    await button('上一页').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith(null, expect.any(AbortSignal))
    mocks.detail.mockResolvedValueOnce({ ...first, status: 'future-state' })
    await open()
    expect(wrapper?.text()).toContain('当前状态只读')
    expect(wrapper?.find('form').exists()).toBe(false)
  })
})

it('列表与案件详情只读，取消处理清空意见但保留正文和当前查询', async () => {
  await flushPromises()
  await open()
  expect(wrapper?.find('form').exists()).toBe(false)
  expect(wrapper?.get('[aria-label="案件详情"]').find('textarea').exists()).toBe(false)
  await processing()
  await wrapper?.get('input[value="rejected"]').setValue()
  await wrapper?.get('#moderation-reason').setValue('旧原因')
  await wrapper?.get('#moderation-suggestion').setValue('旧建议')
  await wrapper?.get('form').trigger('submit')
  await button('取消处理').trigger('click')
  await flushPromises()
  expect(wrapper?.text()).toContain('合成涉校命中正文')
  expect(wrapper?.find('form').exists()).toBe(false)
  expect(mocks.list).toHaveBeenCalledTimes(1)
  expect(mocks.decide).not.toHaveBeenCalled()
  await processing()
  expect(wrapper?.get('input[value="approved"]').element).toHaveProperty('checked', true)
  expect(wrapper?.find('[aria-label="操作确认"]').exists()).toBe(false)
})
it('处理期间禁用切案和查询，提交期间不能取消，404后关闭失效正文', async () => {
  await flushPromises()
  await open()
  await processing()
  const pending = deferred<ModerationOutcome>()
  mocks.decide.mockReturnValueOnce(pending.promise)
  await wrapper?.get('form').trigger('submit')
  await button('确认提交').trigger('click')
  const done = vi.fn()
  const beforeClose = wrapper?.findComponent(ElDrawer).props('beforeClose')
  if (typeof beforeClose !== 'function') throw new Error('缺少关闭拦截')
  beforeClose(done)
  expect(done).not.toHaveBeenCalled()
  await button('取消处理').trigger('click')
  await open('case-b')
  expect(wrapper?.text()).toContain('合成涉校命中正文')
  expect(wrapper?.text()).not.toContain('另一合成正文')
  expect(wrapper?.find('form').exists()).toBe(true)
  pending.resolve(Promise.reject(new ApiError(404)))
  await flushPromises()
  expect(wrapper?.find('blockquote').exists()).toBe(false)
  expect(wrapper?.find('form').exists()).toBe(false)
})
it('危机升级从详情显式打开独立抽屉，忙碌时禁止关闭，冲突后重读且清空抽屉', async () => {
  const session = useAdminStore().session
  if (!session) throw new Error('缺少会话')
  session.account.roles = ['review_operator', 'crisis_operator']
  await flushPromises()
  await open()
  expect(wrapper?.findComponent(CrisisEscalation).exists()).toBe(false)
  await button('升级危机').trigger('click')
  await flushPromises()
  const escalation = wrapper?.findComponent(CrisisEscalation)
  if (!escalation) throw new Error('缺少升级组件')
  expect(wrapper?.find('form').exists()).toBe(false)
  escalation.vm.$emit('busyChange', true)
  await flushPromises()
  await button('取消处理').trigger('click')
  expect(wrapper?.findComponent(CrisisEscalation).exists()).toBe(true)
  escalation.vm.$emit('busyChange', false)
  mocks.detail.mockResolvedValueOnce({ ...first, version: 4, content_version: 5 })
  escalation.vm.$emit('conflict')
  await flushPromises()
  expect(wrapper?.findComponent(CrisisEscalation).exists()).toBe(false)
  expect(wrapper?.text()).toContain('案件版本 4')
  expect(wrapper?.find('form').exists()).toBe(false)
  expect(mocks.decide).not.toHaveBeenCalled()
})
it('普通审核角色不展示危机升级入口', async () => {
  await flushPromises()
  await open()
  expect(wrapper?.findAll('button').some((item) => item.text() === '升级危机')).toBe(false)
})

it('危机升级确认后清除原正文与操作，并跳转危机工作台', async () => {
  const session = useAdminStore().session
  if (!session) throw new Error('缺少会话')
  session.account.roles = ['review_operator', 'crisis_operator']
  await flushPromises()
  await open()
  await button('升级危机').trigger('click')
  await flushPromises()
  wrapper
    ?.findComponent(CrisisEscalation)
    .vm.$emit('escalated', { id: 'crisis-new', version: 1, status: 'open' })
  await flushPromises()
  expect(mocks.push).toHaveBeenCalledWith({ path: '/crisis', query: { case: 'crisis-new' } })
  expect(wrapper?.find('blockquote').exists()).toBe(false)
  expect(wrapper?.findComponent(CrisisEscalation).exists()).toBe(false)
  expect(mocks.decide).not.toHaveBeenCalled()
})
