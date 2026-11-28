import { confirmDiscardChanges } from '@/components/confirmDiscardChanges'
vi.mock('@/components/confirmDiscardChanges', () => ({ confirmDiscardChanges: vi.fn() }))
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import type { Router } from 'vue-router'
import IdentityView from './IdentityView.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type { IdentityCase, IdentityReviewClient } from '@/types/identity'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  history: vi.fn(),
  card: vi.fn(),
  decide: vi.fn(),
}))
vi.mock('@/services/identity-transport', () => ({ createIdentityTransport: () => mocks }))
const first: IdentityCase = {
  id: 'case-a',
  version: 1,
  status: 'pending',
  name: '合成甲',
  student_number: '合成学号甲',
  asset_id: 'asset-a',
}
const second: IdentityCase = {
  ...first,
  id: 'case-b',
  name: '合成乙',
  student_number: '合成学号乙',
  asset_id: 'asset-b',
}
let wrapper: VueWrapper | undefined
let router: Router
const createUrl = vi.fn(() => 'blob:synthetic-card')
const revokeUrl = vi.fn()
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
function dialogText() {
  return (
    wrapper
      ?.findAll('.el-dialog, .el-drawer')
      .map((dialog) => dialog.text())
      .join(' ') ?? ''
  )
}
function button(text: string) {
  const found = wrapper?.findAll('button').find((entry) => entry.text() === text)
  if (!found) throw new Error(`未找到按钮：${text}`)
  return found
}
async function open(id = 'case-a') {
  const found = wrapper?.findAll('.business-table tbody button')[id === first.id ? 0 : 1]
  if (!found) throw new Error('未找到案件')
  await found.trigger('click')
  await flushPromises()
}
async function processing() {
  if (!wrapper?.find('form').exists()) {
    await button('处理身份审核').trigger('click')
    await flushPromises()
  }
}
async function confirm() {
  await processing()
  await wrapper?.get('form').trigger('submit')
  await flushPromises()
  await button('确认提交').trigger('click')
  await flushPromises()
}
beforeEach(async () => {
  vi.resetAllMocks()
  vi.mocked(confirmDiscardChanges).mockResolvedValue(true)
  createUrl.mockReturnValue('blob:synthetic-card')
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = createUrl
      static override revokeObjectURL = revokeUrl
    },
  )
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'synthetic',
    account: {
      login_name: 'synthetic-operator',
      id: 'operator',
      active: true,
      version: 1,
      roles: ['review_operator'],
    },
  }
  mocks.list.mockResolvedValue({
    items: [first, second],
    next_cursor: null,
  })
  mocks.detail.mockImplementation((id: string) =>
    Promise.resolve({ ...(id === first.id ? first : second) }),
  )
  mocks.card.mockResolvedValue(new Blob(['synthetic'], { type: 'image/png' }))
  mocks.decide.mockResolvedValue({ request_id: first.id, version: 2, status: 'approved' })
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/identity', component: IdentityView }],
  })
  await router.push('/identity')
  wrapper = mount(RouterView, { global: { plugins: [pinia, router] } })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

describe('T012 身份审核页面业务', () => {
  it('案件读卡返回404后清除已失效的身份详情', async () => {
    await flushPromises()
    await open()
    mocks.card.mockRejectedValueOnce(new ApiError(404))
    await button('查看学生卡').trigger('click')
    await flushPromises()
    expect(dialogText()).not.toContain('合成甲')
    expect(wrapper?.text()).toContain('案件不存在或已不可访问')
    expect(wrapper?.find('form').exists()).toBe(false)
  })
  it('切案后旧提交回执晚到不覆盖当前案件', async () => {
    await flushPromises()
    await open()
    const pending = deferred<Awaited<ReturnType<IdentityReviewClient['decide']>>>()
    mocks.decide.mockReturnValueOnce(pending.promise)
    await processing()
    await wrapper?.get('form').trigger('submit')
    await button('确认提交').trigger('click')
    expect(button('刷新列表').attributes('disabled')).toBeDefined()
    wrapper?.unmount()
    const pinia = getActivePinia()
    if (!pinia) throw new Error('缺少会话')
    wrapper = mount(RouterView, { global: { plugins: [pinia, router] } })
    await flushPromises()
    await open('case-b')
    pending.resolve({ request_id: first.id, status: 'approved', version: 2 })
    await flushPromises()
    expect(dialogText()).toContain('合成乙')
    expect(wrapper?.text()).not.toContain('审核提交已确认')
    expect(wrapper?.find('[aria-label="审核回执"]').exists()).toBe(false)
  })
  it('待审核列表展示姓名学号，详情与学生卡按需读取', async () => {
    await flushPromises()
    expect(wrapper?.get('tbody').text()).toContain('合成甲')
    expect(wrapper?.get('tbody').text()).toContain('合成学号甲')
    expect(wrapper?.get('thead').text()).not.toMatch(/状态|案件版本/)
    expect(mocks.detail).not.toHaveBeenCalled()
    expect(mocks.card).not.toHaveBeenCalled()
    await open()
    expect(dialogText()).toContain('合成甲')
    await button('查看学生卡').trigger('click')
    await flushPromises()
    expect(wrapper?.get('img').attributes('src')).toBe('blob:synthetic-card')
    await button('收起学生卡').trigger('click')
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-card')
  })
  it('切案立即清除原资料、表单和图片，晚到详情不覆盖新案', async () => {
    await flushPromises()
    await open()
    await button('查看学生卡').trigger('click')
    await flushPromises()
    const old = deferred<IdentityCase>()
    mocks.detail.mockReturnValueOnce(old.promise)
    await open()
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-card')
    expect(dialogText()).not.toContain('合成甲')
    await open('case-b')
    old.resolve(first)
    await flushPromises()
    expect(dialogText()).toContain('合成乙')
    expect(dialogText()).not.toContain('合成甲')
  })
  it('驳回必须填写原因和建议，二次确认后按版本提交并展示回执', async () => {
    await flushPromises()
    await open()
    await processing()
    await wrapper?.get('input[value="rejected"]').setValue()
    await wrapper?.get('#reject-reason').setValue('  图像不清晰  ')
    expect(button('核对决定').attributes('disabled')).toBeDefined()
    await wrapper?.get('#revision-suggestion').setValue('  请上传清晰图片  ')
    mocks.decide.mockResolvedValue({
      request_id: first.id,
      version: 2,
      status: 'rejected',
      reason: '图像不清晰',
      revision_suggestion: '请上传清晰图片',
    })
    await confirm()
    expect(mocks.decide).toHaveBeenCalledWith(
      first.id,
      {
        decision: 'rejected',
        expected_version: 1,
        reason: '图像不清晰',
        revision_suggestion: '请上传清晰图片',
      },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(wrapper?.text()).toContain('审核提交已确认：已驳回')
    expect(wrapper?.text()).toContain('修改建议：请上传清晰图片')
    expect(dialogText()).not.toContain('合成甲')
    expect(wrapper?.find('form').exists()).toBe(false)
  })
  it('版本冲突重新读取并清空旧决定，不自动重复提交', async () => {
    await flushPromises()
    await open()
    mocks.decide.mockRejectedValue(new ApiError(409))
    mocks.detail.mockResolvedValue({ ...first, version: 2 })
    await confirm()
    expect(mocks.decide).toHaveBeenCalledTimes(1)
    expect(wrapper?.text()).toContain('旧决定不会自动重试')
    expect(dialogText()).not.toContain('版本 2')
    expect(mocks.detail).toHaveBeenCalledTimes(2)
    expect(wrapper?.find('[aria-label="提交确认"]').exists()).toBe(false)
  })
  it('提交期间重复点击只发送一次，失败重试沿用同一幂等键', async () => {
    await flushPromises()
    await open()
    const pending = deferred<Awaited<ReturnType<IdentityReviewClient['decide']>>>()
    mocks.decide.mockReturnValueOnce(pending.promise)
    await processing()
    await wrapper?.get('form').trigger('submit')
    await button('确认提交').trigger('click')
    await button('正在提交…').trigger('click')
    expect(mocks.decide).toHaveBeenCalledTimes(1)
    pending.resolve({ request_id: first.id, version: 2, status: 'approved' })
    await flushPromises()
    await open()
    mocks.decide.mockRejectedValueOnce(new Error('offline'))
    await confirm()
    const key: unknown = mocks.decide.mock.calls[1]?.[2]
    await button('确认提交').trigger('click')
    await flushPromises()
    expect(mocks.decide.mock.calls[2]?.[2]).toBe(key)
  })
  it.each([401, 403])('%s 后同步清空资料和图片', async (status) => {
    await flushPromises()
    await open()
    await button('查看学生卡').trigger('click')
    await flushPromises()
    mocks.card.mockRejectedValue(new ApiError(status))
    await button('查看学生卡').trigger('click')
    await flushPromises()
    expect(wrapper?.text()).not.toContain('合成甲')
    expect(wrapper?.find('img').exists()).toBe(false)
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-card')
    expect(useAdminStore().authenticated).toBe(status !== 401)
  })
  it('权限收回或退出时清空详情，晚到卡图不创建地址', async () => {
    await flushPromises()
    await open()
    const pending = deferred<Blob>()
    mocks.card.mockReturnValue(pending.promise)
    await button('查看学生卡').trigger('click')
    useAdminStore().clear()
    pending.resolve(new Blob(['synthetic']))
    await flushPromises()
    expect(wrapper?.text()).not.toContain('合成甲')
    expect(createUrl).not.toHaveBeenCalled()
    expect(wrapper?.find('.business-table').exists()).toBe(false)
  })
  it('离开页面取消在途请求并释放图片', async () => {
    await flushPromises()
    await open()
    await button('查看学生卡').trigger('click')
    await flushPromises()
    const requestSignal: unknown = mocks.card.mock.calls[0]?.[1]
    wrapper?.unmount()
    wrapper = undefined
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-card')
    expect(requestSignal).toBeInstanceOf(AbortSignal)
    if (requestSignal instanceof AbortSignal) expect(requestSignal.aborted).toBe(true)
  })
  it('列表失败可重试并显示空状态，分页后清除详情', async () => {
    await flushPromises()
    await open()
    mocks.list.mockRejectedValueOnce(new Error('offline'))
    await button('刷新列表').trigger('click')
    await flushPromises()
    expect(dialogText()).not.toContain('合成甲')
    mocks.list.mockResolvedValueOnce({ items: [], next_cursor: null })
    await button('重试列表').trigger('click')
    await flushPromises()
    expect(wrapper?.text()).toContain('暂无待审核案件')
    mocks.list.mockResolvedValueOnce({
      items: [first],
      next_cursor: 'page-two',
    })
    await button('刷新列表').trigger('click')
    await flushPromises()
    await open()
    mocks.list.mockResolvedValueOnce({ items: [], next_cursor: null })
    await button('下一页').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith('page-two', expect.any(AbortSignal), 'pending')
    expect(dialogText()).not.toContain('合成甲')
    await button('上一页').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith(null, expect.any(AbortSignal), 'pending')
  })
  it('已处理或未知状态案件只读，不允许再次审核', async () => {
    await flushPromises()
    mocks.detail.mockResolvedValueOnce({ ...first, status: 'approved' })
    await open()
    expect(wrapper?.text()).toContain('当前案件不可再次审核')
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(mocks.decide).not.toHaveBeenCalled()
  })
  it('详情失败可重试，图片显示失败释放地址', async () => {
    await flushPromises()
    mocks.detail.mockRejectedValueOnce(new ApiError(404))
    await open()
    expect(wrapper?.text()).toContain('案件不存在或已不可访问')
    await button('重试案件').trigger('click')
    await flushPromises()
    await button('查看学生卡').trigger('click')
    await flushPromises()
    await wrapper?.get('img').trigger('error')
    expect(wrapper?.text()).toContain('学生卡显示失败')
    expect(revokeUrl).toHaveBeenCalled()
    await nextTick()
  })
})

it('T012 读卡冲突时清除旧图片和决定，重读新版本后人工复核', async () => {
  await flushPromises()
  await open()
  await button('查看学生卡').trigger('click')
  await flushPromises()
  const pending = deferred<Blob>()
  mocks.card.mockReturnValueOnce(pending.promise)
  const reading = button('查看学生卡').trigger('click')
  await reading
  await processing()
  await wrapper?.get('form').trigger('submit')
  mocks.detail.mockResolvedValueOnce({ ...first, version: 2, name: '合成新版' })
  // 在读取完成前打开处理，迟到的冲突仍需清除旧决定。
  const failed = Promise.reject(new ApiError(409))
  pending.resolve(failed)
  await flushPromises()
  expect(dialogText()).not.toContain('合成甲')
  expect(dialogText()).toContain('合成新版')
  expect(wrapper?.text()).toContain('旧决定不会自动重试')
  expect(wrapper?.find('img').exists()).toBe(false)
  expect(wrapper?.find('[aria-label="提交确认"]').exists()).toBe(false)
  expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-card')
  expect(mocks.decide).not.toHaveBeenCalled()
})
it('T012 刷新回到待审队列首页，避免沿用旧游标遗漏新增案件', async () => {
  await flushPromises()
  mocks.list.mockResolvedValueOnce({ items: [], next_cursor: 'next' })
  await button('刷新列表').trigger('click')
  await flushPromises()
  mocks.list.mockResolvedValueOnce({ items: [], next_cursor: null })
  await button('下一页').trigger('click')
  await flushPromises()
  expect(mocks.list).toHaveBeenLastCalledWith('next', expect.any(AbortSignal), 'pending')
  await button('刷新列表').trigger('click')
  await flushPromises()
  expect(mocks.list).toHaveBeenLastCalledWith(null, expect.any(AbortSignal), 'pending')
  expect(button('上一页').attributes('disabled')).toBeDefined()
})
it('T012 超长中文意见不能进入二次确认，修正后可继续', async () => {
  await flushPromises()
  await open()
  await processing()
  await wrapper?.get('input[value="rejected"]').setValue()
  await wrapper?.get('#reject-reason').setValue('中'.repeat(667))
  await wrapper?.get('#revision-suggestion').setValue('请重新上传')
  expect(button('核对决定').attributes('disabled')).toBeDefined()
  await wrapper?.get('form').trigger('submit')
  expect(wrapper?.find('[aria-label="提交确认"]').exists()).toBe(false)
  await wrapper?.get('#reject-reason').setValue('中'.repeat(666) + 'ab')
  expect(button('核对决定').attributes('disabled')).toBeUndefined()
  expect(mocks.decide).not.toHaveBeenCalled()
})

it('查询与详情只读，显式处理后取消清空表单但保留当前案件与分页', async () => {
  await flushPromises()
  await open()
  expect(wrapper?.find('form').exists()).toBe(false)
  await processing()
  await wrapper?.get('input[value="rejected"]').setValue()
  await wrapper?.get('#reject-reason').setValue('旧原因')
  await wrapper?.get('#revision-suggestion').setValue('旧建议')
  await wrapper?.get('form').trigger('submit')
  await button('取消处理').trigger('click')
  await flushPromises()
  expect(dialogText()).toContain('合成甲')
  expect(wrapper?.find('form').exists()).toBe(false)
  expect(mocks.list).toHaveBeenCalledTimes(1)
  expect(mocks.decide).not.toHaveBeenCalled()
  await processing()
  expect(wrapper?.get('input[value="approved"]').element).toHaveProperty('checked', true)
  expect(wrapper?.find('[aria-label="提交确认"]').exists()).toBe(false)
})
it('提交期间不能关闭处理或切换案件，404后关闭失效案件', async () => {
  await flushPromises()
  await open()
  await processing()
  const pending = deferred<Awaited<ReturnType<IdentityReviewClient['decide']>>>()
  mocks.decide.mockReturnValueOnce(pending.promise)
  await wrapper?.get('form').trigger('submit')
  await button('确认提交').trigger('click')
  await button('取消处理').trigger('click')
  await open('case-b')
  expect(dialogText()).toContain('合成甲')
  expect(dialogText()).not.toContain('合成乙')
  expect(wrapper?.find('form').exists()).toBe(true)
  pending.resolve(Promise.reject(new ApiError(404)))
  await flushPromises()
  expect(dialogText()).not.toContain('合成甲')
  expect(wrapper?.find('form').exists()).toBe(false)
})

it('已处理标签保留同一页面并独立查询历史列表与分页', async () => {
  await flushPromises()
  expect(wrapper?.get('a[aria-current="page"]').text()).toBe('待审核')
  mocks.list.mockResolvedValue({
    items: [{ ...first, status: 'rejected', reviewed_at: '2026-11-05T01:30:00Z' }],
    next_cursor: 'history-next',
  })
  await wrapper?.get('a[href="/identity?tab=processed"]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/identity?tab=processed')
  expect(mocks.list).toHaveBeenLastCalledWith(null, expect.any(AbortSignal), 'history')
  expect(wrapper?.get('main').attributes('aria-label')).toBe('身份审核')
  expect(wrapper?.get('a[aria-current="page"]').text()).toBe('已处理')
  expect(wrapper?.get('tbody').text()).toContain('合成学号甲')
  expect(wrapper?.get('tbody').text()).toContain('已驳回')
  expect(wrapper?.get('tbody').text()).toContain('09:30:00')
  expect(wrapper?.get('tbody button').text()).toBe('查看记录')
  expect(mocks.detail).not.toHaveBeenCalled()
  await button('下一页').trigger('click')
  await flushPromises()
  expect(mocks.list).toHaveBeenLastCalledWith('history-next', expect.any(AbortSignal), 'history')
  mocks.list.mockResolvedValueOnce({ items: [second], next_cursor: null })
  await wrapper?.get('a[href="/identity"]').trigger('click')
  await flushPromises()
  expect(mocks.list).toHaveBeenLastCalledWith(null, expect.any(AbortSignal), 'pending')
  expect(wrapper?.get('tbody').text()).toContain('合成学号乙')
  expect(wrapper?.get('tbody').text()).not.toContain('已驳回')
})

it.each([new TypeError('offline'), new ApiError(408), new ApiError(429), new ApiError(503)])(
  '未知身份决定冻结取消和关闭，重试保持正文、版本与键：%s',
  async (failure) => {
    await flushPromises()
    await open()
    mocks.decide.mockRejectedValueOnce(failure)
    await confirm()
    const original = mocks.decide.mock.calls[0]?.slice(0, 3)
    expect(wrapper?.text()).toContain('提交结果尚未确认')
    expect(button('取消处理').attributes('disabled')).toBeDefined()
    expect(button('返回修改').attributes('disabled')).toBeDefined()
    await button('取消处理').trigger('click')
    expect(wrapper?.get('fieldset').attributes('disabled')).toBeDefined()
    await button('确认提交').trigger('click')
    await flushPromises()
    expect(mocks.decide.mock.calls[1]?.slice(0, 3)).toEqual(original)
    expect(wrapper?.text()).toContain('审核提交已确认')
  },
)

it('审核处理的取消与Esc守卫保留未保存意见，明确放弃后才清除', async () => {
  await flushPromises()
  await open()
  await processing()
  await wrapper?.get('input[value="rejected"]').setValue()
  await wrapper?.get('#reject-reason').setValue('保留的驳回理由')
  await wrapper?.get('#revision-suggestion').setValue('保留的修改建议')
  vi.mocked(confirmDiscardChanges).mockResolvedValueOnce(false)
  await button('取消处理').trigger('click')
  await flushPromises()
  expect(confirmDiscardChanges).toHaveBeenCalledOnce()
  expect(wrapper?.get('#reject-reason').element).toHaveProperty('value', '保留的驳回理由')
  expect(wrapper?.get('#revision-suggestion').element).toHaveProperty('value', '保留的修改建议')
  vi.mocked(confirmDiscardChanges).mockResolvedValueOnce(true)
  await button('取消处理').trigger('click')
  await flushPromises()
  expect(wrapper?.find('#reject-reason').exists()).toBe(false)
  expect(mocks.decide).not.toHaveBeenCalled()
})
it('历史详情仅调用历史投影，不展示学生卡或再次审核操作', async () => {
  await flushPromises()
  mocks.list.mockResolvedValue({
    items: [
      {
        ...first,
        status: 'rejected',
        created_at: '2026-11-01T00:00:00Z',
        reviewed_at: '2026-11-02T00:00:00Z',
      },
    ],
    next_cursor: null,
  })
  mocks.history.mockResolvedValue({
    id: first.id,
    version: 2,
    status: 'rejected',
    name: first.name,
    student_number: first.student_number,
    created_at: '2026-11-01T00:00:00Z',
    reviewed_at: '2026-11-02T00:00:00Z',
    reviewer_id: '合成审核编号',
    reason: '历史驳回理由',
    revision_suggestion: '历史修改建议',
  })
  await router.push('/identity?tab=processed')
  await flushPromises()
  await button('查看记录').trigger('click')
  await flushPromises()
  expect(mocks.history).toHaveBeenCalledWith(first.id, expect.any(AbortSignal))
  expect(wrapper?.get('[aria-label="只读审核记录"]').text()).toContain('审核员编号')
  expect(wrapper?.text()).toContain('历史驳回理由')
  expect(mocks.detail).not.toHaveBeenCalled()
  expect(mocks.card).not.toHaveBeenCalled()
  expect(
    wrapper
      ?.findAll('button')
      .some((item) => item.text() === '查看学生卡' || item.text() === '处理身份审核'),
  ).toBe(false)
})

it('切换到已处理时中止未完成的读卡，返回待审核后清除历史详情', async () => {
  await flushPromises()
  await open()
  const pendingCard = deferred<Blob>()
  mocks.card.mockReturnValueOnce(pendingCard.promise)
  await button('查看学生卡').trigger('click')
  mocks.list.mockResolvedValueOnce({
    items: [{ ...second, status: 'approved', reviewed_at: '2026-11-05T01:30:00Z' }],
    next_cursor: null,
  })
  await router.push('/identity?tab=processed')
  pendingCard.resolve(new Blob(['late-card'], { type: 'image/png' }))
  await flushPromises()
  expect(mocks.card.mock.calls[0]?.[1]).toHaveProperty('aborted', true)
  expect(createUrl).not.toHaveBeenCalled()
  expect(dialogText()).toBe('')
  expect(wrapper?.get('tbody').text()).toContain('已通过')

  const pendingHistory = deferred<Awaited<ReturnType<IdentityReviewClient['history']>>>()
  mocks.history.mockReturnValueOnce(pendingHistory.promise)
  await button('查看记录').trigger('click')
  await router.push('/identity')
  pendingHistory.resolve({
    id: second.id,
    version: 2,
    status: 'approved',
    name: second.name,
    student_number: second.student_number,
    created_at: '2026-11-01T00:00:00Z',
    reviewed_at: '2026-11-05T01:30:00Z',
    reviewer_id: null,
    reason: '晚到的历史详情',
    revision_suggestion: null,
  })
  await flushPromises()
  expect(mocks.history.mock.calls[0]?.[1]).toHaveProperty('aborted', true)
  expect(wrapper?.text()).not.toContain('晚到的历史详情')
  expect(dialogText()).toBe('')
})

it('切换标签时中止原列表，晚到的手动刷新结果和提示不进入已处理', async () => {
  await flushPromises()
  const pendingList = deferred<Awaited<ReturnType<IdentityReviewClient['list']>>>()
  mocks.list.mockReturnValueOnce(pendingList.promise)
  await button('刷新列表').trigger('click')
  const pendingSignal: unknown = mocks.list.mock.calls[1]?.[1]
  expect(wrapper?.text()).toContain('正在处理，请稍候')

  mocks.list.mockResolvedValueOnce({
    items: [{ ...second, status: 'approved', reviewed_at: '2026-11-05T01:30:00Z' }],
    next_cursor: null,
  })
  await router.push('/identity?tab=processed')
  await flushPromises()
  expect(pendingSignal).toHaveProperty('aborted', true)
  expect(wrapper?.text()).not.toContain('正在处理，请稍候')
  pendingList.resolve({
    items: [{ ...first, status: 'pending', reviewed_at: null }],
    next_cursor: null,
  })
  await flushPromises()
  expect(wrapper?.get('tbody').text()).toContain('已通过')
  expect(wrapper?.get('tbody').text()).not.toContain('合成甲')
  expect(wrapper?.text()).not.toContain('查询已完成')
})

it('切换标签前核对未保存意见，并锁定提交中或结果未确认的原决定', async () => {
  await flushPromises()
  await open()
  await processing()
  await wrapper?.get('input[value="rejected"]').setValue()
  await wrapper?.get('#reject-reason').setValue('还未保存的理由')
  await wrapper?.get('#revision-suggestion').setValue('还未保存的建议')
  vi.mocked(confirmDiscardChanges).mockResolvedValueOnce(false)
  await router.push('/identity?tab=processed')
  expect(router.currentRoute.value.fullPath).toBe('/identity')
  expect(wrapper?.get('#reject-reason').element).toHaveProperty('value', '还未保存的理由')
  expect(confirmDiscardChanges).toHaveBeenCalledOnce()

  const pendingDecision = deferred<Awaited<ReturnType<IdentityReviewClient['decide']>>>()
  mocks.decide.mockReturnValueOnce(pendingDecision.promise)
  await wrapper?.get('form').trigger('submit')
  await button('确认提交').trigger('click')
  await router.push('/identity?tab=processed')
  expect(router.currentRoute.value.fullPath).toBe('/identity')
  pendingDecision.resolve(Promise.reject(new ApiError(503)))
  await flushPromises()
  await router.push('/identity?tab=processed')
  expect(router.currentRoute.value.fullPath).toBe('/identity')
  expect(wrapper?.text()).toContain('提交结果尚未确认')
  expect(mocks.list).toHaveBeenCalledTimes(1)
  expect(confirmDiscardChanges).toHaveBeenCalledOnce()

  const original = mocks.decide.mock.calls[0]?.slice(0, 3)
  await button('确认提交').trigger('click')
  await flushPromises()
  expect(mocks.decide.mock.calls[1]?.slice(0, 3)).toEqual(original)
  await router.push('/identity?tab=processed')
  expect(router.currentRoute.value.fullPath).toBe('/identity?tab=processed')
  expect(mocks.list).toHaveBeenLastCalledWith(null, expect.any(AbortSignal), 'history')
})
