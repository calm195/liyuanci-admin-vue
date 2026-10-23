import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import IdentityView from './IdentityView.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type { IdentityCase, IdentityReviewClient } from '@/types/identity'

const mocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), card: vi.fn(), decide: vi.fn() }))
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
const createUrl = vi.fn(() => 'blob:synthetic-card')
const revokeUrl = vi.fn()
function deferred<T>() {
  let finish: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    finish = resolve
  })
  return {
    promise,
    resolve(value: T) {
      if (!finish) throw new Error('尚未准备')
      finish(value)
    },
  }
}
function button(text: string) {
  const found = wrapper?.findAll('button').find((entry) => entry.text() === text)
  if (!found) throw new Error(`未找到按钮：${text}`)
  return found
}
async function open(id = 'case-a') {
  const found = wrapper?.findAll('.case-list button').find((entry) => entry.text().includes(id))
  if (!found) throw new Error('未找到案件')
  await found.trigger('click')
  await flushPromises()
}
async function confirm() {
  await wrapper?.get('form').trigger('submit')
  await flushPromises()
  await button('确认提交').trigger('click')
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  createUrl.mockReturnValue('blob:synthetic-card')
  vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl })
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
    items: [first, second].map(({ id, version, status }) => ({ id, version, status })),
    next_cursor: null,
  })
  mocks.detail.mockImplementation((id: string) =>
    Promise.resolve({ ...(id === first.id ? first : second) }),
  )
  mocks.card.mockResolvedValue(new Blob(['synthetic'], { type: 'image/png' }))
  mocks.decide.mockResolvedValue({ request_id: first.id, version: 2, status: 'approved' })
  wrapper = mount(IdentityView, { global: { plugins: [pinia] } })
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
    expect(wrapper?.text()).not.toContain('合成甲')
    expect(wrapper?.text()).toContain('案件不存在或已不可访问')
    expect(wrapper?.find('form').exists()).toBe(false)
  })
  it('切案后旧提交回执晚到不覆盖当前案件', async () => {
    await flushPromises()
    await open()
    const pending = deferred<Awaited<ReturnType<IdentityReviewClient['decide']>>>()
    mocks.decide.mockReturnValueOnce(pending.promise)
    await wrapper?.get('form').trigger('submit')
    await button('确认提交').trigger('click')
    await open('case-b')
    pending.resolve({ request_id: first.id, status: 'approved', version: 2 })
    await flushPromises()
    expect(wrapper?.text()).toContain('合成乙')
    expect(wrapper?.text()).not.toContain('审核提交已确认')
    expect(wrapper?.find('[aria-label="审核回执"]').exists()).toBe(false)
  })
  it('列表不展示身份，详情与学生卡按需读取', async () => {
    await flushPromises()
    expect(wrapper?.text()).not.toContain('合成甲')
    expect(mocks.detail).not.toHaveBeenCalled()
    expect(mocks.card).not.toHaveBeenCalled()
    await open()
    expect(wrapper?.text()).toContain('合成甲')
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
    expect(wrapper?.text()).not.toContain('合成甲')
    await open('case-b')
    old.resolve(first)
    await flushPromises()
    expect(wrapper?.text()).toContain('合成乙')
    expect(wrapper?.text()).not.toContain('合成甲')
  })
  it('驳回必须填写原因和建议，二次确认后按版本提交并展示回执', async () => {
    await flushPromises()
    await open()
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
    expect(wrapper?.text()).not.toContain('合成甲')
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
    expect(wrapper?.text()).toContain('版本 2')
    expect(wrapper?.find('[aria-label="提交确认"]').exists()).toBe(false)
  })
  it('提交期间重复点击只发送一次，失败重试沿用同一幂等键', async () => {
    await flushPromises()
    await open()
    const pending = deferred<Awaited<ReturnType<IdentityReviewClient['decide']>>>()
    mocks.decide.mockReturnValueOnce(pending.promise)
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
    expect(wrapper?.find('.case-list').exists()).toBe(false)
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
    expect(wrapper?.text()).not.toContain('合成甲')
    mocks.list.mockResolvedValueOnce({ items: [], next_cursor: null })
    await button('重试列表').trigger('click')
    await flushPromises()
    expect(wrapper?.text()).toContain('暂无审核案件')
    mocks.list.mockResolvedValueOnce({
      items: [{ id: first.id, version: 1, status: 'pending' }],
      next_cursor: 'page-two',
    })
    await button('刷新列表').trigger('click')
    await flushPromises()
    await open()
    mocks.list.mockResolvedValueOnce({ items: [], next_cursor: null })
    await button('下一页').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith('page-two', expect.any(AbortSignal))
    expect(wrapper?.text()).not.toContain('合成甲')
    await button('上一页').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith(null, expect.any(AbortSignal))
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
  await wrapper?.get('form').trigger('submit')
  mocks.card.mockRejectedValueOnce(new ApiError(409))
  mocks.detail.mockResolvedValueOnce({ ...first, version: 2, name: '合成新版' })
  await button('查看学生卡').trigger('click')
  await flushPromises()
  expect(wrapper?.text()).not.toContain('合成甲')
  expect(wrapper?.text()).toContain('合成新版')
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
  expect(mocks.list).toHaveBeenLastCalledWith('next', expect.any(AbortSignal))
  await button('刷新列表').trigger('click')
  await flushPromises()
  expect(mocks.list).toHaveBeenLastCalledWith(null, expect.any(AbortSignal))
  expect(button('上一页').attributes('disabled')).toBeDefined()
})
it('T012 超长中文意见不能进入二次确认，修正后可继续', async () => {
  await flushPromises()
  await open()
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
