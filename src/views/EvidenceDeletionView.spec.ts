import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as privacyService from '@/services/privacy'
import EvidenceDeletionView from './EvidenceDeletionView.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
const mocks = vi.hoisted(() => ({
  evidence: vi.fn(),
  remove: vi.fn(),
  job: vi.fn(),
  receipt: vi.fn(),
}))
vi.mock('@/services/privacy', async (original) => ({
  ...(await original<typeof privacyService>()),
  createPrivacyClient: () => mocks,
}))
const evidenceId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'
let wrapper: VueWrapper
function button(label: string) {
  const found = wrapper.findAll('button').find((item) => item.text() === label)
  if (!found) throw new Error(`未找到按钮：${label}`)
  return found
}
async function load() {
  await wrapper.get('#delete-evidence-id').setValue(evidenceId)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}
async function prepare() {
  await load()
  await wrapper.get('#delete-reason').setValue('核对删除理由')
  await wrapper.findAll('form')[1]?.trigger('submit')
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'test',
    account: {
      id: 'admin',
      login_name: '测试超管',
      version: 1,
      active: true,
      roles: ['super_admin'],
    },
  }
  mocks.evidence.mockResolvedValue({
    id: evidenceId,
    case_id: 'crisis',
    version: 9,
    status: 'resolved',
  })
  mocks.remove.mockResolvedValue({ id: jobId, version: 1, status: 'pending' })
  mocks.job.mockResolvedValue({ status: 'processing' })
  mocks.receipt.mockResolvedValue({ status: 'completed' })
  wrapper = mount(EvidenceDeletionView, { global: { plugins: [pinia] } })
})
afterEach(() => wrapper.unmount())
describe('T032 REQ-018/019 后台证据删除与回执', () => {
  it('没有本地案件或自动查询，明确核对后使用证据范围版本，受理不声称完成', async () => {
    expect(mocks.evidence).not.toHaveBeenCalled()
    expect(mocks.job).not.toHaveBeenCalled()
    await prepare()
    expect(wrapper.get('[aria-label="最终删除确认"]').text()).toContain('整个证据范围')
    expect(mocks.remove).not.toHaveBeenCalled()
    await button('确认删除证据范围').trigger('click')
    await flushPromises()
    expect(mocks.remove).toHaveBeenCalledWith(
      evidenceId,
      { reason: '核对删除理由', expected_version: 9 },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(wrapper.text()).toContain('已受理，尚未确认清理完成')
    expect(wrapper.find('#delete-reason').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('核对删除理由')
    expect(wrapper.get<HTMLInputElement>('#delete-job-id').element.value).toBe(jobId)
    await wrapper.get('[aria-label="删除进度查询"]').findAll('form')[0]?.trigger('submit')
    await flushPromises()
    expect(wrapper.get('[aria-label="清理结果"]').text()).toContain('尚未全部完成')
  })
  it('超出中文UTF-8字节限制不能准备删除', async () => {
    await load()
    await wrapper.get('#delete-reason').setValue('中'.repeat(667))
    expect(button('核对删除范围').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('2001 / 2000 字节')
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it('网络结果不明确保留操作标识供同内容重试，不能自动重试', async () => {
    mocks.remove.mockRejectedValueOnce(new Error('网络断开'))
    await prepare()
    await button('确认删除证据范围').trigger('click')
    await flushPromises()
    expect(mocks.remove).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('结果可能已生效')
    await button('确认删除证据范围').trigger('click')
    await flushPromises()
    expect(mocks.remove.mock.calls[0]?.[2]).toBe(mocks.remove.mock.calls[1]?.[2])
  })
  it.each([404, 409])('HTTP%s清掉旧版本和理由，必须重新读取，不自动重提', async (status) => {
    mocks.remove.mockRejectedValue(new ApiError(status))
    await prepare()
    await button('确认删除证据范围').trigger('click')
    await flushPromises()
    expect(wrapper.find('#delete-reason').exists()).toBe(false)
    expect(wrapper.text()).toContain('不会自动重提')
    expect(mocks.evidence).toHaveBeenCalledTimes(1)
    expect(mocks.remove).toHaveBeenCalledTimes(1)
  })
  it('切换目标清除旧范围与确认，返回修改不直接执行', async () => {
    await prepare()
    await button('返回修改').trigger('click')
    await wrapper.get('#delete-evidence-id').setValue(jobId)
    expect(wrapper.find('#delete-reason').exists()).toBe(false)
    expect(wrapper.find('[aria-label="最终删除确认"]').exists()).toBe(false)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it('回执完成与安全错误提示，编辑查询立即撤下旧结果，404不声称完成', async () => {
    mocks.job
      .mockResolvedValueOnce({
        status: 'processing',
        retryable_error: 'external_cleanup_unavailable',
      })
      .mockRejectedValueOnce(new ApiError(404))
    await wrapper.get('#delete-job-id').setValue(jobId)
    await wrapper.get('[aria-label="删除进度查询"]').findAll('form')[0]?.trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('外部清理依赖暂不可用')
    await wrapper.get('#delete-job-id').setValue(evidenceId)
    expect(wrapper.find('[aria-label="清理结果"]').exists()).toBe(false)
    await wrapper.get('[aria-label="删除进度查询"]').findAll('form')[0]?.trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('不能据此认定清理完成')
    await wrapper.get('#delete-receipt').setValue(`${jobId}.${'a'.repeat(43)}`)
    await wrapper.get('[aria-label="删除进度查询"]').findAll('form')[1]?.trigger('submit')
    await flushPromises()
    expect(wrapper.get('[aria-label="清理结果"]').text()).toContain('清理已完成（后端确认）')
    await button('清空页面').trigger('click')
    expect(wrapper.find('[aria-label="清理结果"]').exists()).toBe(false)
    expect(wrapper.get<HTMLInputElement>('#delete-receipt').element.value).toBe('')
  })
  it.each([401, 403])('HTTP%s撤下所有证据、理由及回执状态', async (status) => {
    await prepare()
    mocks.remove.mockRejectedValue(new ApiError(status))
    await button('确认删除证据范围').trigger('click')
    await flushPromises()
    expect(wrapper.find('#delete-reason').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('核对删除理由')
    if (status === 401) expect(useAdminStore().session).toBeNull()
    else expect(useAdminStore().forbidden).toBe(1)
  })
  it('撤销超管权限后丢弃晚到读取，不保留查询回执', async () => {
    let resolve: ((value: unknown) => void) | undefined
    mocks.evidence.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await wrapper.get('#delete-evidence-id').setValue(evidenceId)
    await wrapper.get('form').trigger('submit')
    const account = useAdminStore().session?.account
    if (!account || !resolve) throw new Error('测试会话未准备')
    account.roles = ['crisis_operator']
    resolve({ id: evidenceId, case_id: 'late', version: 9, status: 'resolved' })
    await flushPromises()
    expect(wrapper.find('#delete-evidence-id').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('late')
  })
})
