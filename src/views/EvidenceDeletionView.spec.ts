import { confirmDiscardChanges } from '@/components/confirmDiscardChanges'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { defineComponent, h } from 'vue'
import { usePrivacyHandoff } from '@/composables/usePrivacyHandoff'
import type * as whispersService from '@/services/whispers'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as privacyService from '@/services/privacy'
import EvidenceDeletionView from './EvidenceDeletionView.vue'
import DeletionReceiptsView from './DeletionReceiptsView.vue'
import { ElDialog } from 'element-plus'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
vi.mock('@/components/confirmDiscardChanges', () => ({ confirmDiscardChanges: vi.fn() }))
const mocks = vi.hoisted(() => ({
  evidence: vi.fn(),
  remove: vi.fn(),
  job: vi.fn(),
  jobs: vi.fn(),
  whisperAdminDeletionGet: vi.fn(),
  receipt: vi.fn(),
}))
vi.mock('@/services/privacy', async (original) => ({
  ...(await original<typeof privacyService>()),
  createPrivacyClient: () => mocks,
}))
vi.mock('@/services/whispers', async (original) => ({
  ...(await original<typeof whispersService>()),
  createWhispersClient: () => mocks,
}))
const evidenceId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'
let pinia: ReturnType<typeof createPinia>
let wrapper: VueWrapper
let router: ReturnType<typeof createRouter>
let caseId = 'crisis'
const pickedEvidence = defineComponent({
  setup() {
    const { open } = usePrivacyHandoff()
    return () =>
      h(
        'button',
        { onClick: () => open({ path: '/evidence-deletion', id: evidenceId, caseId }) },
        '选择普通危机证据',
      )
  },
})
const taskRows = [
  { id: jobId, source_module: 'legacy', status: 'processing', created_at: '2026-11-28T07:00:00Z' },
  {
    id: evidenceId,
    source_module: 'whispers',
    status: 'completed',
    created_at: '2026-11-27T07:00:00Z',
  },
] as const
function showReceipts() {
  wrapper.unmount()
  wrapper = mount(DeletionReceiptsView, {
    global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } },
  })
}
function button(label: string) {
  const found = wrapper.findAll('button').find((item) => item.text() === label)
  if (!found) throw new Error(`未找到按钮：${label}`)
  return found
}
async function load() {
  if (router.currentRoute.value.path !== '/crisis') {
    await router.push('/crisis')
    await flushPromises()
  }
  await button('选择普通危机证据').trigger('click')
  await flushPromises()
}
async function prepare() {
  await load()
  await button('处理证据删除').trigger('click')
  await flushPromises()
  await wrapper.get('#delete-reason').setValue('核对删除理由')
  await wrapper.get('.el-dialog form').trigger('submit')
  await flushPromises()
}
beforeEach(async () => {
  vi.resetAllMocks()
  vi.mocked(confirmDiscardChanges).mockResolvedValue(true)
  pinia = createPinia()
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
  mocks.whisperAdminDeletionGet.mockResolvedValue({ status: 'completed' })
  mocks.jobs.mockResolvedValue({ items: taskRows, page: 1, page_size: 10, total: 2 })
  caseId = 'crisis'
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/crisis', component: pickedEvidence },
      { path: '/evidence-deletion', component: EvidenceDeletionView },
      { path: '/deletion-receipts', component: DeletionReceiptsView },
    ],
  })
  await router.push('/crisis')
  wrapper = mount(RouterView, { global: { plugins: [pinia, router] } })
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
    expect(wrapper.text()).not.toContain(jobId)
    expect(wrapper.find('#delete-job-id').exists()).toBe(false)
    showReceipts()
    await flushPromises()
    await button('查看进度').trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="清理结果"]').text()).toContain('尚未全部完成')
  })
  it('从受理回执直接查询同一任务，返回后不重复携带待办', async () => {
    await prepare()
    await button('确认删除证据范围').trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain(jobId)
    expect(mocks.job).not.toHaveBeenCalled()

    await button('查看删除任务').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/deletion-receipts')
    expect(mocks.job).toHaveBeenCalledWith(jobId, expect.any(AbortSignal))
    expect(wrapper.get('[aria-label="清理结果"]').text()).toContain('尚未全部完成')
    expect(wrapper.find('#delete-job-id').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(jobId)

    await router.push('/evidence-deletion')
    await flushPromises()
    await router.push('/deletion-receipts')
    await flushPromises()
    expect(mocks.job).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[aria-label="清理结果"]').exists()).toBe(false)
  })
  it('超出中文UTF-8字节限制不能准备删除', async () => {
    await load()
    await button('处理证据删除').trigger('click')
    await flushPromises()
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
  it('裸链接不查证据；再次从案件进来只接受关联案件的证据范围', async () => {
    await router.push('/evidence-deletion?evidence=untrusted')
    await flushPromises()
    expect(wrapper.find('#delete-evidence-id').exists()).toBe(false)
    expect(wrapper.get('a[href="/crisis"]').text()).toBe('前往危机工作台')
    expect(mocks.evidence).not.toHaveBeenCalled()
    caseId = 'different-case'
    await load()
    expect(mocks.evidence).toHaveBeenCalledTimes(1)
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.find('#delete-reason').exists()).toBe(false)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it('回执完成与安全错误提示，编辑查询立即撤下旧结果，404不声称完成', async () => {
    showReceipts()
    mocks.job
      .mockResolvedValueOnce({
        status: 'processing',
        retryable_error: 'external_cleanup_unavailable',
      })
      .mockRejectedValueOnce(new ApiError(404))
    await flushPromises()
    await button('查看进度').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('外部清理依赖暂不可用')
    await button('刷新任务进度').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('不能据此认定清理完成')
    await wrapper.get('#delete-receipt').setValue(`${jobId}.${'a'.repeat(43)}`)
    await wrapper.get('#receipt-query').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[aria-label="清理结果"]').text()).toContain('清理已完成（后端确认）')
    await button('清空查询').trigger('click')
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
    await load()
    const account = useAdminStore().session?.account
    if (!account || !resolve) throw new Error('测试会话未准备')
    account.roles = ['crisis_operator']
    resolve({ id: evidenceId, case_id: 'late', version: 9, status: 'resolved' })
    await flushPromises()
    expect(wrapper.find('#delete-evidence-id').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('late')
  })
})

describe('证据删除与查询隔离', () => {
  it('读取仅展示元信息，显式处理可取消并保留目标，重开没有旧理由', async () => {
    await load()
    expect(wrapper.find('#delete-reason').exists()).toBe(false)
    expect(wrapper.find('#delete-job-id').exists()).toBe(false)
    expect(wrapper.find('#delete-receipt').exists()).toBe(false)
    await button('处理证据删除').trigger('click')
    await wrapper.get('#delete-reason').setValue('未提交理由')
    await button('取消处理').trigger('click')
    await flushPromises()
    expect(
      wrapper
        .findAll('tbody td')
        .map((cell) => cell.text())
        .slice(0, 3),
    ).toEqual(['危机限定证据', '处置已结束', '9'])
    expect(wrapper.find('#delete-reason').exists()).toBe(false)
    expect(mocks.evidence).toHaveBeenCalledTimes(1)
    expect(mocks.remove).not.toHaveBeenCalled()
    await button('处理证据删除').trigger('click')
    expect(wrapper.get<HTMLTextAreaElement>('#delete-reason').element.value).toBe('')
  })
  it('写入中不能关闭抽屉或刷新，离页丢弃晚到受理结果', async () => {
    let finish: ((value: unknown) => void) | undefined
    mocks.remove.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await prepare()
    await button('确认删除证据范围').trigger('click')
    expect(button('取消处理').attributes('disabled')).toBeDefined()
    expect(button('重新读取证据范围').attributes('disabled')).toBeDefined()
    const done = vi.fn()
    wrapper.findComponent(ElDialog).props('beforeClose')?.(done)
    expect(done).not.toHaveBeenCalled()
    const signal: unknown = mocks.remove.mock.calls[0]?.[3]
    showReceipts()
    if (!finish || !(signal instanceof AbortSignal)) throw new Error('请求未准备')
    expect(signal.aborted).toBe(true)
    finish({ id: jobId, status: 'pending', version: 1 })
    await flushPromises()
    expect(wrapper.text()).not.toContain('已受理')
    expect(mocks.job).not.toHaveBeenCalled()
  })
  it('离开回执页清空凭据并取消读取，不能恢复旧结果', async () => {
    showReceipts()
    let finish: ((value: unknown) => void) | undefined
    mocks.receipt.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const handle = `${jobId}.${'a'.repeat(43)}`
    await wrapper.get('#delete-receipt').setValue(handle)
    await wrapper.get('#receipt-query').trigger('submit')
    const signal: unknown = mocks.receipt.mock.calls[0]?.[1]
    showReceipts()
    if (!finish || !(signal instanceof AbortSignal)) throw new Error('请求未准备')
    expect(signal.aborted).toBe(true)
    finish({ status: 'completed' })
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('#delete-receipt').element.value).toBe('')
    expect(wrapper.find('[aria-label="清理结果"]').exists()).toBe(false)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})

describe('T032 REQ-018 只读查询反馈回归', () => {
  beforeEach(() => showReceipts())
  it('格式错误的回执禁止查询，表单提交也不能绕过，格式修正后才查询', async () => {
    await wrapper.get('#delete-receipt').setValue('not-a-receipt')
    expect(button('查询匿名删除回执').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('待办 ID 不能代替回执')
    await wrapper.get('#receipt-query').trigger('submit')
    await flushPromises()
    expect(mocks.receipt).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('完整的删除回执')
    expect(wrapper.text()).not.toContain('写入结果不明确')
    await wrapper.get('#delete-receipt').setValue(`${jobId}.${'a'.repeat(43)}`)
    expect(button('查询匿名删除回执').attributes('disabled')).toBeUndefined()
    await wrapper.get('#receipt-query').trigger('submit')
    await flushPromises()
    expect(mocks.receipt).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it.each(['job', 'receipt'] as const)('%s查询失败不显示删除结果不明确的提示', async (kind) => {
    mocks[kind].mockRejectedValue(new Error('测试网络中断，不应泄漏'))
    if (kind === 'job') {
      await flushPromises()
      await button('查看进度').trigger('click')
    } else {
      await wrapper.get('#delete-receipt').setValue(`${jobId}.${'a'.repeat(43)}`)
      await wrapper.get('#receipt-query').trigger('submit')
    }
    await flushPromises()
    expect(wrapper.get('[role="alert"] .floating-notice-content').text()).toBe(
      '查询未完成，请稍后重试',
    )
    expect(wrapper.text()).not.toContain('写入结果不明确')
    expect(wrapper.text()).not.toContain('测试网络中断')
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it('后端拒绝查询参数时要求核对，不称删除已经发生', async () => {
    mocks.job.mockRejectedValue(new ApiError(400))
    await flushPromises()
    await button('查看进度').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('查询参数无效')
    expect(wrapper.text()).not.toContain('写入结果不明确')
  })
})

it('按页读取删除任务，并用各来源原端点查询进度', async () => {
  const items = Array.from({ length: 10 }, (_, index) => ({
    ...taskRows[0],
    id: `item-${index}`,
  }))
  mocks.jobs
    .mockResolvedValueOnce({ items, page: 1, page_size: 10, total: 11 })
    .mockResolvedValueOnce({ items: [taskRows[1]], page: 2, page_size: 10, total: 11 })
  await router.push('/deletion-receipts?job=untrusted')
  await flushPromises()
  expect(wrapper.find('#delete-job-id').exists()).toBe(false)
  expect(mocks.jobs).toHaveBeenLastCalledWith(1, 10, expect.any(AbortSignal))
  expect(mocks.job).not.toHaveBeenCalled()
  await button('查看进度').trigger('click')
  await flushPromises()
  expect(mocks.job).toHaveBeenLastCalledWith('item-0', expect.any(AbortSignal))
  await button('下一页').trigger('click')
  await flushPromises()
  expect(mocks.jobs).toHaveBeenLastCalledWith(2, 10, expect.any(AbortSignal))
  expect(wrapper.text()).toContain('第 2 / 2 页')
  await button('查看进度').trigger('click')
  await flushPromises()
  expect(mocks.whisperAdminDeletionGet).toHaveBeenLastCalledWith(
    evidenceId,
    expect.any(AbortSignal),
  )
  expect(mocks.job).toHaveBeenCalledTimes(1)
  expect(wrapper.get('[aria-label="清理结果"]').text()).toContain('树洞证据')
  expect(wrapper.text()).not.toContain(evidenceId)
})

it('非超管不可读取列表；降权后丢弃迟到任务并清空回执凭据', async () => {
  let finish: ((result: unknown) => void) | undefined
  mocks.jobs.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await router.push('/deletion-receipts')
  await flushPromises()
  const session = useAdminStore().session
  if (!session || !finish) throw new Error('未准备查询')
  session.account.roles = ['review_operator']
  finish({ items: taskRows, page: 1, page_size: 10, total: 2 })
  await flushPromises()
  expect(wrapper.find('[aria-label="证据删除任务列表"]').exists()).toBe(false)
  expect(wrapper.find('#delete-receipt').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('树洞证据')
  await router.push('/crisis')
  await router.push('/deletion-receipts')
  await flushPromises()
  expect(mocks.jobs).toHaveBeenCalledTimes(1)
})
