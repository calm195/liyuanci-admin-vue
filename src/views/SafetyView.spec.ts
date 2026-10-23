import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SafetyView from './SafetyView.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type { ReportDetail, SafetySummary } from '@/types/safety'
const mocks = vi.hoisted(() => ({
  reports: vi.fn(),
  report: vi.fn(),
  decideReport: vi.fn(),
  penalize: vi.fn(),
  appeals: vi.fn(),
  appeal: vi.fn(),
  decideAppeal: vi.fn(),
  restrict: vi.fn(),
}))
vi.mock('@/services/safety', () => ({ createSafetyClient: () => mocks }))
const report: ReportDetail = {
  id: 'report',
  version: 7,
  status: 'pending',
  target_kind: 'wish',
  target_id: 'wish',
  type_code: 'type',
  content_ref: 'registry',
  content_version: 3,
  subject_id: 'student',
  body: '仅本案可见正文',
  description: '举报说明',
  reason: null,
}
let wrapper: VueWrapper | undefined
function button(label: string) {
  const found = wrapper?.findAll('button').find((entry) => entry.text() === label)
  if (!found) throw new Error(`未找到按钮：${label}`)
  return found
}
async function open() {
  const found = wrapper?.find('.workflow-list button')
  if (!found) throw new Error('没有案件按钮')
  await found.trigger('click')
  await flushPromises()
}
async function prepare(reason = '核对处理') {
  await wrapper?.get('#safety-reason').setValue(reason)
  await wrapper?.get('form').trigger('submit')
}
async function submit() {
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
      id: 'admin',
      login_name: '测试运营',
      version: 1,
      active: true,
      roles: ['crisis_operator'],
    },
  }
  mocks.reports.mockResolvedValue({
    items: [{ id: 'report', version: 7, status: 'pending', kind: 'wish' }],
    next_cursor: null,
  })
  mocks.report.mockResolvedValue({ ...report })
  mocks.decideReport.mockResolvedValue({ id: 'report', version: 8, status: 'resolved' })
  mocks.penalize.mockResolvedValue({ id: 'penalty', version: 1, status: 'active' })
  mocks.appeals.mockResolvedValue({
    items: [{ id: 'appeal', version: 4, status: 'pending' }],
    next_cursor: null,
  })
  mocks.appeal.mockResolvedValue({
    id: 'appeal',
    version: 4,
    status: 'pending',
    penalty_id: 'penalty',
    body: '申诉正文',
    penalty_reason: '原处罚理由',
    reason: null,
  })
  mocks.decideAppeal.mockResolvedValue({ id: 'appeal', version: 5, status: 'accepted' })
  mocks.restrict.mockResolvedValue({ id: 'wish', kind: 'wish', version: 12, status: 'released' })
  wrapper = mount(SafetyView, { global: { plugins: [pinia] } })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})
describe('T028 举报、处罚与申诉页面', () => {
  it('危机角色可处理普通案件，列表不加载详情，关闭后清空正文', async () => {
    await flushPromises()
    expect(mocks.report).not.toHaveBeenCalled()
    expect(wrapper?.text()).not.toContain('仅本案可见正文')
    await open()
    expect(wrapper?.text()).toContain('仅本案可见正文')
    expect(wrapper?.text()).toContain('举报说明')
    await button('关闭案件').trigger('click')
    expect(wrapper?.text()).not.toContain('仅本案可见正文')
  })
  it('举报理由必填并二次确认，发送举报版本而不是正文版本', async () => {
    await flushPromises()
    await open()
    expect(button('核对处理').attributes('disabled')).toBeDefined()
    await prepare('  核对属实  ')
    expect(mocks.decideReport).not.toHaveBeenCalled()
    await submit()
    expect(mocks.decideReport).toHaveBeenCalledWith(
      'report',
      { decision: 'confirmed', reason: '核对属实', expected_version: 7 },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(wrapper?.find('blockquote').exists()).toBe(false)
    expect(wrapper?.text()).toContain('处理已确认')
  })
  it('仅已确认举报可处罚，必须取得账号版本并固定作者与精确内容', async () => {
    await flushPromises()
    mocks.report.mockResolvedValueOnce({ ...report, status: 'resolved' })
    await open()
    expect(wrapper?.get('#safety-operation').element).toHaveProperty('value', 'penalty')
    await wrapper?.get('#penalty-level').setValue('general')
    await prepare()
    expect(wrapper?.find('[aria-label="处理确认"]').exists()).toBe(false)
    expect(mocks.penalize).not.toHaveBeenCalled()
    await wrapper?.get('#account-version').setValue('19')
    await prepare()
    expect(wrapper?.text()).toContain('禁言 7 天')
    await submit()
    expect(mocks.penalize).toHaveBeenCalledWith(
      'student',
      {
        violation_ref: 'report',
        content_ref: 'registry',
        content_version: 3,
        level: 'general',
        reason: '核对处理',
        expected_version: 19,
      },
      expect.any(String),
      expect.any(AbortSignal),
    )
  })
  it('解除限制绑定内容实体及资源版本，不发送举报或registry作为路径', async () => {
    await flushPromises()
    await open()
    await wrapper?.get('#safety-operation').setValue('release-restriction')
    await wrapper?.get('#resource-version').setValue('11')
    await prepare()
    expect(wrapper?.text()).toContain('不自动恢复旧交互')
    await submit()
    expect(mocks.restrict).toHaveBeenCalledWith(
      'wish',
      'wish',
      'release-restriction',
      { reason: '核对处理', expected_version: 11 },
      expect.any(String),
      expect.any(AbortSignal),
    )
  })
  it('申诉详情按需读取，撤销理由与申诉版本独立，切换清空举报正文', async () => {
    await flushPromises()
    await open()
    await button('申诉管理').trigger('click')
    await flushPromises()
    expect(wrapper?.text()).not.toContain('举报说明')
    await open()
    expect(wrapper?.text()).toContain('原处罚理由')
    await wrapper?.get('#safety-operation').setValue('revoke')
    await prepare('复核撤销')
    await submit()
    expect(mocks.decideAppeal).toHaveBeenCalledWith(
      'appeal',
      { decision: 'revoke', reason: '复核撤销', expected_version: 4 },
      expect.any(String),
      expect.any(AbortSignal),
    )
  })
  it('409重新读取案件并清除旧目标版本与确认，禁止自动重提', async () => {
    await flushPromises()
    mocks.report.mockResolvedValue({ ...report, status: 'resolved' })
    await open()
    await wrapper?.get('#account-version').setValue('19')
    await prepare()
    mocks.penalize.mockRejectedValueOnce(new ApiError(409))
    await submit()
    expect(mocks.penalize).toHaveBeenCalledTimes(1)
    expect(wrapper?.text()).toContain('请重新取得目标当前版本')
    expect(wrapper?.get('#account-version').element).toHaveProperty('value', '')
    expect(wrapper?.find('[aria-label="处理确认"]').exists()).toBe(false)
  })
  it('未知举报状态仅供查看，不展示处罚或内容处置表单', async () => {
    await flushPromises()
    mocks.report.mockResolvedValueOnce({ ...report, status: 'unknown' })
    await open()
    expect(wrapper?.find('form').exists()).toBe(false)
  })
  it('网络失败同输入重试沿用键，编辑理由必须重新确认', async () => {
    await flushPromises()
    await open()
    mocks.decideReport.mockRejectedValueOnce(new Error('离线'))
    await prepare()
    await submit()
    const key: unknown = mocks.decideReport.mock.calls[0]?.[2]
    await submit()
    expect(mocks.decideReport.mock.calls[1]?.[2]).toBe(key)
    await open()
    await prepare()
    await button('返回修改').trigger('click')
    await wrapper?.get('#safety-reason').setValue('新的理由')
    expect(wrapper?.find('[aria-label="处理确认"]').exists()).toBe(false)
  })
  it('页码使用不透明游标，刷新回首页', async () => {
    await flushPromises()
    mocks.reports.mockResolvedValueOnce({ items: [], next_cursor: 'opaque' })
    await button('从首页刷新').trigger('click')
    await flushPromises()
    mocks.reports.mockResolvedValueOnce({ items: [], next_cursor: null })
    await button('下一页').trigger('click')
    await flushPromises()
    expect(mocks.reports).toHaveBeenLastCalledWith('opaque', expect.any(AbortSignal))
    await button('从首页刷新').trigger('click')
    await flushPromises()
    expect(mocks.reports).toHaveBeenLastCalledWith(null, expect.any(AbortSignal))
  })
  it.each([401, 403])('%s清空案件材料和表单，保留既有会话错误流程', async (status) => {
    await flushPromises()
    await open()
    mocks.decideReport.mockRejectedValueOnce(new ApiError(status))
    await prepare()
    await submit()
    expect(wrapper?.find('blockquote').exists()).toBe(false)
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(useAdminStore().authenticated).toBe(status !== 401)
  })
  it('换会话丢弃迟到写入回执，不把旧操作显示给新主体', async () => {
    await flushPromises()
    await open()
    let finish: ((value: SafetySummary) => void) | undefined
    mocks.decideReport.mockReturnValueOnce(
      new Promise<SafetySummary>((resolve) => {
        finish = resolve
      }),
    )
    await prepare()
    await button('确认提交').trigger('click')
    useAdminStore().clear()
    if (!finish) throw new Error('请求未发出')
    finish({ id: 'report', version: 8, status: 'resolved' })
    await flushPromises()
    expect(wrapper?.find('[aria-label="处理回执"]').exists()).toBe(false)
    expect(wrapper?.text()).not.toContain('仅本案可见正文')
  })
})
