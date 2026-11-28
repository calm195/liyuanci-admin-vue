import { confirmDiscardChanges } from '@/components/confirmDiscardChanges'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import type { Router } from 'vue-router'
import { router as applicationRouter } from '@/router'
import { useAdminStore } from '@/stores/admin'
import { useUserNavigation } from '@/stores/userNavigation'
import { ApiError } from '@/services/admin'
import CrisisEscalation from '@/components/CrisisEscalation.vue'
import type { ReportContentControl, ReportDetail, SafetySummary } from '@/types/safety'
vi.mock('@/components/CrisisEscalation.vue', () => ({
  default: {
    name: 'CrisisEscalation',
    emits: ['busyChange', 'conflict', 'escalated'],
    template: '<span />',
  },
}))
vi.mock('@/components/confirmDiscardChanges', () => ({ confirmDiscardChanges: vi.fn() }))
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  reports: vi.fn(),
  report: vi.fn(),
  reportContentControl: vi.fn(),
  decideReport: vi.fn(),
  penalize: vi.fn(),
  appeals: vi.fn(),
  appeal: vi.fn(),
  decideAppeal: vi.fn(),
  restrict: vi.fn(),
}))
vi.mock('@/services/users', () => ({ createUsersClient: () => mocks }))
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
const control: ReportContentControl = {
  report_id: report.id,
  report_version: report.version,
  report_status: report.status,
  target_kind: report.target_kind,
  target_id: report.target_id,
  content_ref: report.content_ref,
  content_version: report.content_version,
  version: 11,
}
let wrapper: VueWrapper | undefined
let router: Router
async function go(path: string) {
  await router.push(path)
  await flushPromises()
}
function button(label: string) {
  const found = wrapper?.findAll('button').find((entry) => entry.text() === label)
  if (!found) throw new Error(`未找到按钮：${label}`)
  return found
}
async function open(edit = true) {
  const found = wrapper?.find('.business-table tbody button')
  if (!found) throw new Error('没有案件按钮')
  await found.trigger('click')
  await flushPromises()
  if (edit) {
    const action = wrapper
      ?.findAll('button')
      .find((item) => ['处理举报', '给予账号处罚', '处理申诉'].includes(item.text()))
    if (action) await action.trigger('click')
  }
}
async function prepare(reason = '核对处理') {
  await wrapper?.get('#safety-reason').setValue(reason)
  await wrapper?.get('form').trigger('submit')
  await flushPromises()
}
async function submit() {
  await button('确认提交').trigger('click')
  await flushPromises()
}
beforeEach(async () => {
  vi.resetAllMocks()
  vi.mocked(confirmDiscardChanges).mockResolvedValue(true)
  mocks.user.mockResolvedValue({ id: 'student', account_version: 19 })
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
  mocks.reportContentControl.mockResolvedValue({ ...control })
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
  router = createRouter({
    history: createMemoryHistory(),
    routes: applicationRouter.options.routes,
  })
  await router.push('/safety/reports')
  await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router] } })
  await flushPromises()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})
describe('T028 举报、处罚与申诉页面', () => {
  it.each([
    ['/safety/reports', '处理举报'],
    ['/safety/reports?status=resolved', '给予账号处罚'],
    ['/safety/appeals', '处理申诉'],
  ])('%s查询和详情默认只读，%s必须显式打开抽屉，取消保留详情与查询结果', async (path, label) => {
    mocks.reports.mockResolvedValue({
      items: [{ id: 'report', version: 7, status: 'resolved' }],
      next_cursor: null,
    })
    mocks.report.mockResolvedValue({ ...report, status: 'resolved' })
    await go(path)
    expect(wrapper?.find('form').exists()).toBe(false)
    await open(false)
    expect(wrapper?.find('form').exists()).toBe(false)
    const reads = path.endsWith('appeals')
      ? mocks.appeals.mock.calls.length
      : mocks.reports.mock.calls.length
    await button(label).trigger('click')
    await wrapper?.get('#safety-reason').setValue('取消的理由')
    await button('取消并关闭').trigger('click')
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(wrapper?.get('[aria-label="案件详情"]').text()).toContain(
      path.endsWith('appeals') ? '申诉正文' : '仅本案可见正文',
    )
    await button(label).trigger('click')
    expect(wrapper?.get('#safety-reason').element).toHaveProperty('value', '')
    expect(
      path.endsWith('appeals') ? mocks.appeals.mock.calls.length : mocks.reports.mock.calls.length,
    ).toBe(reads)
    expect(mocks.penalize).not.toHaveBeenCalled()
    expect(mocks.decideReport).not.toHaveBeenCalled()
    expect(mocks.decideAppeal).not.toHaveBeenCalled()
  })
  it('切换已确认举报由服务端筛选，空页继续透传游标，详情变更为未确认时禁止处罚', async () => {
    mocks.reports.mockResolvedValueOnce({
      items: [{ id: 'pending-report', version: 2, status: 'pending' }],
      next_cursor: 'opaque+/=',
    })
    await button('已确认').trigger('click')
    await flushPromises()
    expect(wrapper?.text()).toContain('本页暂无已确认举报')
    expect(mocks.reports).toHaveBeenLastCalledWith(null, expect.any(AbortSignal), 1, true)
    mocks.reports.mockResolvedValueOnce({
      items: [{ id: 'report', version: 7, status: 'resolved' }],
      next_cursor: null,
    })
    await button('下一页').trigger('click')
    await flushPromises()
    expect(mocks.reports).toHaveBeenLastCalledWith('opaque+/=', expect.any(AbortSignal), 1, true)
    await open(false)
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(wrapper?.findAll('button').some((item) => item.text() === '给予账号处罚')).toBe(false)
    await button('上一页').trigger('click')
    await flushPromises()
    expect(mocks.reports).toHaveBeenLastCalledWith(null, expect.any(AbortSignal), 1, true)
    await button('全部举报').trigger('click')
    await flushPromises()
    expect(mocks.reports).toHaveBeenLastCalledWith(null, expect.any(AbortSignal), 1, false)
    expect(mocks.penalize).not.toHaveBeenCalled()
  })
  it('举报详情分别提供举报处理与处罚，处罚表单留在举报页', async () => {
    mocks.report.mockResolvedValue({ ...report, status: 'resolved' })
    await open(false)
    await button('处理举报').trigger('click')
    expect(wrapper?.get('#safety-operation').text()).not.toContain('给予账号处罚')
    await button('取消并关闭').trigger('click')
    expect(wrapper?.find('form').exists()).toBe(false)
    await button('给予账号处罚').trigger('click')
    expect(router.currentRoute.value.path).toBe('/safety/reports')
    expect(
      wrapper
        ?.get('#safety-operation')
        .findAll('option')
        .map((item) => item.text()),
    ).toEqual(['给予账号处罚'])
    expect(mocks.penalize).not.toHaveBeenCalled()
  })
  it('写入中禁止取消并抑制重复提交，完成后关闭抽屉', async () => {
    let finish: ((value: SafetySummary) => void) | undefined
    mocks.decideReport.mockReturnValueOnce(
      new Promise<SafetySummary>((resolve) => {
        finish = resolve
      }),
    )
    await open()
    await prepare()
    await button('确认提交').trigger('click')
    expect(button('取消并关闭').attributes('disabled')).toBeDefined()
    await button('取消并关闭').trigger('click')
    await button('正在提交…').trigger('click')
    expect(wrapper?.find('form').exists()).toBe(true)
    expect(mocks.decideReport).toHaveBeenCalledTimes(1)
    if (!finish) throw new Error('尚未提交')
    finish({ id: 'report', version: 8, status: 'resolved' })
    await flushPromises()
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(wrapper?.get('[aria-label="处理回执"]').text()).toContain('给予账号处罚')
    mocks.report.mockResolvedValue({ ...report, status: 'resolved', version: 8 })
    await button('给予账号处罚').trigger('click')
    await flushPromises()
    expect(mocks.report).toHaveBeenCalledTimes(2)
    expect(wrapper?.get('#safety-operation').element).toHaveProperty('value', 'penalty')
    expect(mocks.penalize).not.toHaveBeenCalled()
  })
  it('离页取消旧读取；提交中阻止离页，完成后不将回执带入申诉页', async () => {
    let finish: ((value: ReportDetail) => void) | undefined
    mocks.report.mockReturnValueOnce(
      new Promise<ReportDetail>((resolve) => {
        finish = resolve
      }),
    )
    await open(false)
    const signal: unknown = mocks.report.mock.calls[0]?.[1]
    await go('/safety/appeals')
    expect(signal).toHaveProperty('aborted', true)
    if (!finish) throw new Error('尚未读取')
    finish(report)
    await flushPromises()
    expect(wrapper?.text()).not.toContain(report.body)
    await go('/safety/reports')
    await open()
    let written: ((value: SafetySummary) => void) | undefined
    mocks.decideReport.mockReturnValueOnce(
      new Promise<SafetySummary>((resolve) => {
        written = resolve
      }),
    )
    await prepare()
    await button('确认提交').trigger('click')
    const writeSignal: unknown = mocks.decideReport.mock.calls[0]?.[3]
    await go('/safety/appeals')
    expect(writeSignal).toHaveProperty('aborted', false)
    expect(router.currentRoute.value.path).toBe('/safety/reports')
    if (!written) throw new Error('尚未写入')
    written({ id: 'report', version: 8, status: 'resolved' })
    await flushPromises()
    await go('/safety/appeals')
    expect(writeSignal).toHaveProperty('aborted', true)
    expect(wrapper?.find('[aria-label="处理回执"]').exists()).toBe(false)
    expect(wrapper?.find('form').exists()).toBe(false)
  })
  it('从旧处罚链接跳转保留举报和筛选，离页后列表晚到时不再补发详情请求', async () => {
    let finish: ((value: { items: SafetySummary[]; next_cursor: null }) => void) | undefined
    mocks.reports.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    await go('/safety/penalties?report=report')
    expect(router.currentRoute.value.path).toBe('/safety/reports')
    expect(router.currentRoute.value.query).toMatchObject({ report: 'report', status: 'resolved' })
    expect(mocks.reports).toHaveBeenLastCalledWith(null, expect.any(AbortSignal), 1, true)
    await go('/safety/appeals')
    if (!finish) throw new Error('尚未查询')
    finish({ items: [], next_cursor: null })
    await flushPromises()
    expect(mocks.report).not.toHaveBeenCalled()
  })
  it('危机升级独立进入处理抽屉，升级中不可关闭，冲突后重读原举报', async () => {
    await open(false)
    expect(wrapper?.findComponent(CrisisEscalation).exists()).toBe(false)
    await button('升级危机').trigger('click')
    const escalation = wrapper?.findComponent(CrisisEscalation)
    if (!escalation) throw new Error('没有升级组件')
    escalation.vm.$emit('busyChange', true)
    await flushPromises()
    expect(button('取消并关闭').attributes('disabled')).toBeDefined()
    await button('取消并关闭').trigger('click')
    expect(wrapper?.findComponent(CrisisEscalation).exists()).toBe(true)
    escalation.vm.$emit('busyChange', false)
    escalation.vm.$emit('conflict')
    await flushPromises()
    expect(mocks.report).toHaveBeenCalledTimes(2)
    expect(wrapper?.findComponent(CrisisEscalation).exists()).toBe(false)
    expect(wrapper?.get('[aria-label="案件详情"]').text()).toContain(report.body)
  })
  it('危机角色可处理普通案件，列表不加载详情，关闭后清空正文', async () => {
    await flushPromises()
    expect(mocks.report).not.toHaveBeenCalled()
    expect(wrapper?.text()).not.toContain('仅本案可见正文')
    await open(false)
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
    mocks.report.mockResolvedValue({ ...report, status: 'resolved' })
    mocks.reports.mockResolvedValue({
      items: [{ id: 'report', version: 7, status: 'resolved' }],
      next_cursor: null,
    })
    await go('/safety/reports?status=resolved')
    await open(false)
    await button('给予账号处罚').trigger('click')
    expect(wrapper?.get('#safety-operation').element).toHaveProperty('value', 'penalty')
    await wrapper?.get('#penalty-level').setValue('general')
    expect(wrapper?.find('#account-version').exists()).toBe(false)
    expect(mocks.penalize).not.toHaveBeenCalled()
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
  it.each(['offline', 'release-restriction'] as const)(
    '%s 自动读取所选举报的内容对象版本并保留关联约束',
    async (action) => {
      await go('/safety/reports?report=report')
      await button('处理举报').trigger('click')
      await wrapper?.get('#safety-operation').setValue(action)
      expect(wrapper?.find('#resource-version').exists()).toBe(false)
      await prepare()
      expect(mocks.reportContentControl).toHaveBeenCalledWith('report', expect.any(AbortSignal))
      expect(wrapper?.find('[aria-label="处理确认"]').text()).toContain('目标版本 11')
      expect(mocks.restrict).not.toHaveBeenCalled()
      await submit()
      expect(mocks.restrict).toHaveBeenCalledWith(
        'wish',
        'wish',
        action,
        { reason: '核对处理', expected_version: 11, report_id: 'report', report_version: 7 },
        expect.any(String),
        expect.any(AbortSignal),
      )
    },
  )
  it.each([{ target_id: 'other' }, { report_version: 8 }, { content_version: 4 }])(
    '核对发现举报或所关联目标已变化时重新读取案件：%o',
    async (stale) => {
      await go('/safety/reports?report=report')
      await button('处理举报').trigger('click')
      await wrapper?.get('#safety-operation').setValue('offline')
      mocks.reportContentControl.mockResolvedValueOnce({ ...control, ...stale })
      await prepare()
      expect(wrapper?.text()).toContain('案件或关联内容已变化')
      expect(mocks.report).toHaveBeenCalledTimes(2)
      expect(wrapper?.find('[aria-label="处理确认"]').exists()).toBe(false)
      expect(mocks.restrict).not.toHaveBeenCalled()
    },
  )
  it('关联版本读取无权时清除案件与确认', async () => {
    await go('/safety/reports?report=report')
    await button('处理举报').trigger('click')
    await wrapper?.get('#safety-operation').setValue('offline')
    mocks.reportContentControl.mockRejectedValueOnce(new ApiError(403))
    await prepare()
    expect(wrapper?.text()).not.toContain('仅本案可见正文')
    expect(wrapper?.find('[aria-label="处理确认"]').exists()).toBe(false)
    expect(useAdminStore().forbidden).toBe(1)
    expect(mocks.restrict).not.toHaveBeenCalled()
  })
  it('提交冲突后保留原操作选择，重新核对时读取新版本且不自动重试', async () => {
    await go('/safety/reports?report=report')
    await button('处理举报').trigger('click')
    await wrapper?.get('#safety-operation').setValue('release-restriction')
    await prepare()
    mocks.restrict.mockRejectedValueOnce(new ApiError(409))
    await submit()
    expect(mocks.restrict).toHaveBeenCalledTimes(1)
    expect(wrapper?.get('#safety-operation').element).toHaveProperty('value', 'release-restriction')
    expect(wrapper?.find('[aria-label="处理确认"]').exists()).toBe(false)
    mocks.reportContentControl.mockResolvedValueOnce({ ...control, version: 12 })
    await prepare()
    expect(wrapper?.find('[aria-label="处理确认"]').text()).toContain('目标版本 12')
    expect(mocks.restrict).toHaveBeenCalledTimes(1)
  })
  it('取消核对后返回的旧内容对象版本不会恢复确认', async () => {
    await go('/safety/reports?report=report')
    await button('处理举报').trigger('click')
    await wrapper?.get('#safety-operation').setValue('offline')
    let finish: ((value: ReportContentControl) => void) | undefined
    mocks.reportContentControl.mockReturnValueOnce(
      new Promise<ReportContentControl>((resolve) => {
        finish = resolve
      }),
    )
    await prepare()
    await button('取消并关闭').trigger('click')
    if (!finish) throw new Error('内容版本查询尚未开始')
    finish(control)
    await flushPromises()
    expect(wrapper?.find('[aria-label="处理确认"]').exists()).toBe(false)
    expect(mocks.restrict).not.toHaveBeenCalled()
  })
  it('申诉详情按需读取，撤销理由与申诉版本独立，切换清空举报正文', async () => {
    await flushPromises()
    await open()
    await go('/safety/appeals')
    expect(wrapper?.find('[aria-label="案件详情"]').exists()).toBe(false)
    await open(false)
    expect(wrapper?.text()).toContain('原处罚理由')
    await button('处理申诉').trigger('click')
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
    mocks.reports.mockResolvedValue({
      items: [{ id: 'report', version: 7, status: 'resolved' }],
      next_cursor: null,
    })
    await go('/safety/reports?status=resolved')
    await open(false)
    await button('给予账号处罚').trigger('click')
    await prepare()
    mocks.penalize.mockRejectedValueOnce(new ApiError(409))
    await submit()
    expect(mocks.penalize).toHaveBeenCalledTimes(1)
    expect(wrapper?.text()).toContain('系统将重新读取账号版本')
    expect(wrapper?.find('#account-version').exists()).toBe(false)
    expect(wrapper?.find('[aria-label="处理确认"]').exists()).toBe(false)
  })
  it('处罚冲突后举报已非确认时，退回详情并撤下处罚操作', async () => {
    mocks.report.mockResolvedValue({ ...report, status: 'resolved' })
    await go('/safety/reports?report=report')
    await button('给予账号处罚').trigger('click')
    await prepare()
    mocks.penalize.mockRejectedValueOnce(new ApiError(409))
    mocks.report.mockResolvedValueOnce({ ...report, status: 'rejected', version: 8 })
    await submit()
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(wrapper?.text()).toContain('未予支持')
    expect(wrapper?.findAll('button').some((item) => item.text() === '给予账号处罚')).toBe(false)
    expect(mocks.user).toHaveBeenCalledTimes(1)
    expect(mocks.penalize).toHaveBeenCalledTimes(1)
  })
  it('用户导航绑定目标，其他作者案件不得进入处置', async () => {
    useUserNavigation().target = 'another-user'
    mocks.report.mockResolvedValue({ ...report, status: 'resolved' })
    await go('/safety/reports?report=report')
    expect(wrapper?.text()).toContain('案件作者与所选用户不一致')
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(mocks.user).not.toHaveBeenCalled()
  })
  it('申诉链接重新读取指定ID，决定使用申诉自身版本', async () => {
    await go('/safety/appeals?appeal=appeal')
    expect(mocks.appeal).toHaveBeenCalledWith('appeal', expect.any(AbortSignal))
    await button('处理申诉').trigger('click')
    await prepare()
    await submit()
    expect(mocks.decideAppeal.mock.calls[0]?.[1]).toMatchObject({ expected_version: 4 })
    expect(mocks.user).not.toHaveBeenCalled()
  })
  it.each([
    ['reports', 'report'],
    ['appeals', 'appeal'],
  ] as const)('同页 %s 关联链接替换详情，旧请求不可覆盖新案件', async (destination, key) => {
    let finish: ((value: object) => void) | undefined
    const reader = mocks[key]
    reader.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    await go(`/safety/${destination}?${key}=older`)
    const signal: unknown = reader.mock.calls[0]?.[1]
    reader.mockResolvedValueOnce({ ...report, id: 'latest', body: '当前链接的案件材料' })
    await go(`/safety/${destination}?${key}=latest`)
    expect(signal).toHaveProperty('aborted', true)
    expect(reader).toHaveBeenLastCalledWith('latest', expect.any(AbortSignal))
    if (!finish) throw new Error('尚未请求旧案件')
    finish({ ...report, id: 'older', body: '迟到的旧案件材料' })
    await flushPromises()
    expect(wrapper?.text()).toContain('当前链接的案件材料')
    expect(wrapper?.text()).not.toContain('迟到的旧案件材料')
  })
  it('同页举报链接切换前确认放弃未保存的处理理由', async () => {
    await go('/safety/reports?report=report')
    await button('处理举报').trigger('click')
    await wrapper?.get('#safety-reason').setValue('未保存的处理意见')
    vi.mocked(confirmDiscardChanges).mockResolvedValueOnce(false)
    await go('/safety/reports?report=other')
    expect(router.currentRoute.value.query['report']).toBe('report')
    expect(wrapper?.get('#safety-reason').element).toHaveProperty('value', '未保存的处理意见')
    expect(mocks.report).toHaveBeenCalledTimes(1)
  })
  it('账号查询失败阻止处罚确认，不回退人工版本', async () => {
    mocks.report.mockResolvedValue({ ...report, status: 'resolved' })
    await go('/safety/reports?report=report')
    await button('给予账号处罚').trigger('click')
    mocks.user.mockRejectedValueOnce(new ApiError(503))
    await prepare()
    expect(wrapper?.text()).toContain('服务暂不可用')
    expect(wrapper?.find('[aria-label="处理确认"]').exists()).toBe(false)
    expect(mocks.penalize).not.toHaveBeenCalled()
  })
  it('核对期间案件内容换版，重新读取而不生成处罚确认', async () => {
    mocks.report.mockResolvedValue({ ...report, status: 'resolved' })
    await go('/safety/reports?report=report')
    await button('给予账号处罚').trigger('click')
    mocks.report.mockResolvedValue({ ...report, status: 'resolved', content_version: 4 })
    await prepare()
    expect(wrapper?.text()).toContain('案件已变化')
    expect(mocks.user).not.toHaveBeenCalled()
    expect(mocks.penalize).not.toHaveBeenCalled()
  })
  it('普通处罚网络结果不明时保留同键同请求重试', async () => {
    mocks.report.mockResolvedValue({ ...report, status: 'resolved' })
    await go('/safety/reports?report=report')
    await button('给予账号处罚').trigger('click')
    await prepare()
    mocks.penalize.mockRejectedValueOnce(new Error('合成网络故障'))
    await submit()
    await submit()
    expect(mocks.penalize.mock.calls[0]?.slice(0, 3)).toEqual(
      mocks.penalize.mock.calls[1]?.slice(0, 3),
    )
    expect(mocks.user).toHaveBeenCalledTimes(1)
  })
  it('取消核对后晚到账号版本不能恢复处罚确认', async () => {
    mocks.report.mockResolvedValue({ ...report, status: 'resolved' })
    await go('/safety/reports?report=report')
    await button('给予账号处罚').trigger('click')
    let finish: ((value: { account_version: number }) => void) | undefined
    mocks.user.mockReturnValueOnce(
      new Promise<{ account_version: number }>((resolve) => {
        finish = resolve
      }),
    )
    await prepare()
    await button('取消并关闭').trigger('click')
    if (!finish) throw new Error('账号查询尚未开始')
    finish({ account_version: 88 })
    await flushPromises()
    expect(wrapper?.find('[aria-label="处理确认"]').exists()).toBe(false)
    expect(mocks.penalize).not.toHaveBeenCalled()
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
    expect(mocks.reports).toHaveBeenLastCalledWith('opaque', expect.any(AbortSignal), 1, false)
    await button('从首页刷新').trigger('click')
    await flushPromises()
    expect(mocks.reports).toHaveBeenLastCalledWith(null, expect.any(AbortSignal), 1, false)
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

it('WA-03 新树洞申诉复用既有页面和判定，不读取胶囊原文', async () => {
  mocks.appeals.mockResolvedValue({
    items: [{ id: 'appeal', version: 4, status: 'pending', kind: 'whisper_capsule' }],
    next_cursor: null,
  })
  mocks.appeal.mockResolvedValue({
    id: 'appeal',
    version: 4,
    status: 'pending',
    kind: 'whisper_capsule',
    penalty_id: 'penalty',
    body: '合成申诉理由',
    penalty_reason: '原处罚理由',
    reason: null,
  })
  await go('/safety/appeals')
  expect(wrapper?.text()).toContain('私密胶囊')
  expect(wrapper?.text()).not.toContain('合成申诉理由')
  await open(false)
  expect(wrapper?.text()).toContain('合成申诉理由')
  await button('处理申诉').trigger('click')
  await prepare()
  await submit()
  expect(mocks.decideAppeal).toHaveBeenCalledWith(
    'appeal',
    expect.objectContaining({ expected_version: 4 }),
    expect.any(String),
    expect.any(AbortSignal),
  )
})

it.each([new TypeError('offline'), new ApiError(408), new ApiError(429), new ApiError(503)])(
  '普通安全未知结果阻止取消和离页，重试保留案件、正文与键：%s',
  async (failure) => {
    await open()
    await prepare()
    mocks.decideReport.mockRejectedValueOnce(failure)
    await submit()
    const original = mocks.decideReport.mock.calls[0]?.slice(0, 3)
    expect(wrapper?.text()).toContain('提交结果尚未确认')
    expect(button('取消并关闭').attributes('disabled')).toBeDefined()
    expect(button('返回修改').attributes('disabled')).toBeDefined()
    await go('/safety/appeals')
    expect(router.currentRoute.value.path).toBe('/safety/reports')
    await submit()
    expect(mocks.decideReport.mock.calls[1]?.slice(0, 3)).toEqual(original)
    await go('/safety/appeals')
    expect(router.currentRoute.value.path).toBe('/safety/appeals')
  },
)
