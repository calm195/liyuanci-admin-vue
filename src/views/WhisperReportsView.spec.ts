import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WhisperReportsView from './WhisperReportsView.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type { ContentControl, PenaltyResult, ReportDetail, ReportSummary } from '@/types/whispers'
import type * as Service from '@/services/whispers'

const mocks = vi.hoisted(() => ({
  whisperAdminReportsList: vi.fn(),
  whisperAdminReportGet: vi.fn(),
  whisperAdminContentGet: vi.fn(),
  whisperAdminReportDecide: vi.fn(),
  whisperAdminRestrictionSet: vi.fn(),
  whisperAdminPenaltyCreate: vi.fn(),
  whisperAdminReportEscalate: vi.fn(),
}))
vi.mock('@/services/whispers', async (original) => ({
  ...(await original<typeof Service>()),
  createWhispersClient: () => mocks,
}))
const first: ReportDetail = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  version: 4,
  status: 'pending',
  source: { id: '11111111-1111-1111-1111-111111111111', kind: 'whisper_post', content_version: 7 },
  created_at: '2026-10-27T00:00:00Z',
  allowed_actions: ['whisperAdminReportDecide', 'whisperAdminReportEscalate'],
  type_code: 'unsafe',
  description: '合成举报说明',
  body: '仅授权本案正文',
}
const second: ReportDetail = {
  ...first,
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  source: { ...first.source, kind: 'whisper_comment' },
  body: '第二个合成正文',
}
const control: ContentControl = {
  source: { ...first.source },
  version: 31,
  restricted: false,
  state: 'published',
  allowed_actions: ['whisperAdminPenaltyCreate', 'whisperAdminRestrictionSet'],
}
function summary(data: ReportDetail): ReportSummary {
  return {
    id: data.id,
    version: data.version,
    status: data.status,
    source: { ...data.source },
    created_at: data.created_at,
    allowed_actions: [],
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
  const item = view()
    .findAll('.workflow-list button')
    .find((item) => item.text().includes(id))
  if (!item) throw new Error('没有举报')
  await item.trigger('click')
  await flushPromises()
}
async function processing(label: string) {
  await button(label).trigger('click')
  await flushPromises()
  await view().get('#whisper-report-reason').setValue(' 合成处理理由 ')
}
async function confirm() {
  await view().get('form').trigger('submit')
  await button('确认提交').trigger('click')
  await flushPromises()
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
beforeEach(() => {
  vi.resetAllMocks()
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'test',
    account: {
      id: 'op',
      login_name: '合成审核',
      version: 1,
      active: true,
      roles: ['review_operator'],
    },
  }
  mocks.whisperAdminReportsList.mockResolvedValue({
    items: [summary(first), summary(second)],
    next_cursor: null,
  })
  mocks.whisperAdminReportGet.mockImplementation((id: string) =>
    Promise.resolve({ ...(id === first.id ? first : second) }),
  )
  mocks.whisperAdminContentGet.mockImplementation(
    (kind: ContentControl['source']['kind'], id: string) =>
      Promise.resolve({ ...control, source: { ...control.source, kind, id } }),
  )
  mocks.whisperAdminReportDecide.mockResolvedValue({
    ...summary(first),
    status: 'confirmed',
    version: 5,
  })
  mocks.whisperAdminRestrictionSet.mockResolvedValue({ ...control, version: 32, restricted: true })
  mocks.whisperAdminPenaltyCreate.mockResolvedValue({
    id: 'penalty',
    kind: 'warning',
    ends_at: null,
  })
  mocks.whisperAdminReportEscalate.mockResolvedValue({ id: 'new-crisis' })
  wrapper = mount(WhisperReportsView, { global: { plugins: [pinia] } })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})
describe('WA-03 树洞举报与治理', () => {
  it('列表不预读正文，按举报来源获取治理对象，不要求手填身份或版本', async () => {
    await flushPromises()
    expect(view().text()).not.toContain(first.body)
    expect(mocks.whisperAdminContentGet).not.toHaveBeenCalled()
    await open()
    expect(mocks.whisperAdminContentGet).toHaveBeenCalledWith(
      'whisper_post',
      first.source.id,
      expect.any(AbortSignal),
    )
    expect(view().text()).toContain(first.description)
    expect(view().text()).toContain('治理版本 31')
    expect(view().find('input[type="number"]').exists()).toBe(false)
    expect(view().find('input[type="search"]').exists()).toBe(false)
    expect(hasButton('给予处罚')).toBe(false)
  })
  it.each(['confirmed', 'dismissed'] as const)(
    '按当前举报版本提交%s，成功清正文并要求重新读取',
    async (decision) => {
      await flushPromises()
      await open()
      await processing('判定举报')
      await view().get(`input[value="${decision}"]`).setValue()
      await confirm()
      expect(mocks.whisperAdminReportDecide).toHaveBeenCalledWith(
        first.id,
        { expected_version: 4, decision, reason: ' 合成处理理由 ' },
        expect.any(String),
        expect.any(AbortSignal),
      )
      expect(view().find('blockquote').exists()).toBe(false)
      expect(view().find('form').exists()).toBe(false)
      expect(view().text()).toContain('请重新读取举报')
      mocks.whisperAdminReportGet.mockResolvedValueOnce({
        ...first,
        status: 'confirmed',
        version: 5,
      })
      await button('重新读取举报').trigger('click')
      await flushPromises()
      expect(hasButton('给予处罚')).toBe(true)
    },
  )
  it.each([
    ['minor', 'warning', '警告', null],
    ['general', 'mute', '禁言', '2026-11-03T00:00:00Z'],
    ['severe', 'ban', '永久封禁', null],
  ] as const)('已确认举报的%s处罚携带治理和举报双版本', async (level, kind, label, ends_at) => {
    await flushPromises()
    mocks.whisperAdminReportGet.mockResolvedValueOnce({
      ...first,
      status: 'confirmed',
      version: 11,
    })
    await open()
    mocks.whisperAdminPenaltyCreate.mockResolvedValueOnce({ id: 'penalty', kind, ends_at })
    await processing('给予处罚')
    await view().get('#whisper-penalty-level').setValue(level)
    await confirm()
    expect(mocks.whisperAdminPenaltyCreate).toHaveBeenCalledWith(
      first.source.kind,
      first.source.id,
      {
        expected_version: 31,
        report_id: first.id,
        expected_report_version: 11,
        level,
        reason: ' 合成处理理由 ',
      },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(view().get('[aria-label="树洞处罚回执"]').text()).toContain(label)
    expect(view().find('blockquote').exists()).toBe(false)
  })
  it.each([false, true])('普通限制当前为%s，发送明确目标状态与治理版本', async (restricted) => {
    await flushPromises()
    mocks.whisperAdminContentGet.mockResolvedValueOnce({ ...control, restricted })
    mocks.whisperAdminRestrictionSet.mockResolvedValueOnce({
      ...control,
      restricted: !restricted,
      version: 32,
    })
    await open()
    await processing(restricted ? '解除普通限制' : '设置普通限制')
    await confirm()
    expect(mocks.whisperAdminRestrictionSet).toHaveBeenCalledWith(
      first.source.kind,
      first.source.id,
      { expected_version: 31, restricted: !restricted, reason: ' 合成处理理由 ' },
      expect.any(String),
      expect.any(AbortSignal),
    )
    if (restricted) {
      expect(view().text()).toContain('不代表内容已公开')
      expect(view().text()).toContain('不解除危机或隐私屏障')
    }
    expect(view().find('blockquote').exists()).toBe(false)
  })
  it('缺少动作或来源正文换版时关闭治理，不使用举报版本替代治理版本', async () => {
    await flushPromises()
    mocks.whisperAdminContentGet.mockResolvedValueOnce({
      ...control,
      source: { ...control.source, content_version: 8 },
    })
    mocks.whisperAdminReportGet.mockResolvedValueOnce({ ...first, status: 'confirmed' })
    await open()
    expect(view().text()).toContain('治理操作已停用')
    expect(hasButton('给予处罚')).toBe(false)
    expect(hasButton('设置普通限制')).toBe(false)
    mocks.whisperAdminContentGet.mockResolvedValueOnce({ ...control, allowed_actions: [] })
    await button('重新读取举报').trigger('click')
    await flushPromises()
    expect(hasButton('设置普通限制')).toBe(false)
    expect(hasButton('给予处罚')).toBe(false)
  })
  it('治理依赖暂不可用只阻止治理，举报仍可判定', async () => {
    await flushPromises()
    mocks.whisperAdminContentGet.mockRejectedValueOnce(new ApiError(503))
    await open()
    expect(view().text()).toContain('治理状态读取失败')
    expect(view().text()).toContain(first.body)
    expect(hasButton('判定举报')).toBe(true)
    expect(hasButton('设置普通限制')).toBe(false)
  })
  it('无举报决定动作不出现判定入口，正文和说明按文本呈现', async () => {
    await flushPromises()
    mocks.whisperAdminReportGet.mockResolvedValueOnce({
      ...first,
      allowed_actions: [],
      body: '<script>合成文本</script>',
      description: null,
    })
    await open()
    expect(hasButton('判定举报')).toBe(false)
    expect(view().find('blockquote script').exists()).toBe(false)
    expect(view().text()).toContain('未填写说明')
  })
  it('理由非空且最多500码点，表情边界可通过，超界不发请求', async () => {
    await flushPromises()
    await open()
    await processing('判定举报')
    await view().get('#whisper-report-reason').setValue(' ')
    expect(button('核对操作').attributes('disabled')).toBeDefined()
    await view().get('#whisper-report-reason').setValue('😀'.repeat(501))
    expect(button('核对操作').attributes('disabled')).toBeDefined()
    await view().get('#whisper-report-reason').setValue('😀'.repeat(500))
    expect(button('核对操作').attributes('disabled')).toBeUndefined()
    expect(mocks.whisperAdminReportDecide).not.toHaveBeenCalled()
  })
  it('普通岗位不能升级，危机岗位且服务端允许时才能升级授权举报', async () => {
    await flushPromises()
    await open()
    expect(hasButton('升级危机')).toBe(false)
    const session = useAdminStore().session
    if (!session) throw new Error('缺少会话')
    session.account.roles = ['crisis_operator']
    await flushPromises()
    await processing('升级危机')
    await confirm()
    expect(mocks.whisperAdminReportEscalate).toHaveBeenCalledWith(
      first.id,
      { expected_version: 4, reason: ' 合成处理理由 ' },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(view().text()).toContain('new-crisis')
    expect(view().find('blockquote').exists()).toBe(false)
  })
  it.each([404, 409])('%s清正文和治理对象，重新读取才使用新双版本', async (status) => {
    await flushPromises()
    mocks.whisperAdminReportGet.mockResolvedValueOnce({ ...first, status: 'confirmed' })
    await open()
    await processing('给予处罚')
    mocks.whisperAdminPenaltyCreate.mockRejectedValueOnce(new ApiError(status))
    await confirm()
    expect(view().find('blockquote').exists()).toBe(false)
    expect(view().find('form').exists()).toBe(false)
    expect(mocks.whisperAdminReportGet).toHaveBeenCalledTimes(1)
    mocks.whisperAdminReportGet.mockResolvedValueOnce({
      ...first,
      status: 'confirmed',
      version: 19,
    })
    mocks.whisperAdminContentGet.mockResolvedValueOnce({ ...control, version: 48 })
    await button('重新读取举报').trigger('click')
    await flushPromises()
    await processing('给予处罚')
    await confirm()
    expect(mocks.whisperAdminPenaltyCreate.mock.calls[1]?.[2]).toMatchObject({
      expected_version: 48,
      expected_report_version: 19,
    })
  })
  it('结果未知锁表单、原键原体重试，并阻止双击', async () => {
    await flushPromises()
    mocks.whisperAdminReportGet.mockResolvedValueOnce({ ...first, status: 'confirmed' })
    await open()
    await processing('给予处罚')
    mocks.whisperAdminPenaltyCreate.mockRejectedValueOnce(new TypeError('offline'))
    await confirm()
    const old = mocks.whisperAdminPenaltyCreate.mock.calls[0]
    expect(button('返回修改').attributes('disabled')).toBeDefined()
    expect(button('取消处理').attributes('disabled')).toBeDefined()
    const pending = deferred<PenaltyResult>()
    mocks.whisperAdminPenaltyCreate.mockReturnValueOnce(pending.promise)
    await button('使用原请求重试').trigger('click')
    await button('正在提交…').trigger('click')
    expect(mocks.whisperAdminPenaltyCreate).toHaveBeenCalledTimes(2)
    expect(mocks.whisperAdminPenaltyCreate.mock.calls[1]?.slice(0, 4)).toEqual(old?.slice(0, 4))
    pending.resolve({ id: 'penalty', kind: 'warning', ends_at: null })
    await flushPromises()
  })
  it('空页继续、去重和循环游标停止，失败可重试', async () => {
    await flushPromises()
    mocks.whisperAdminReportsList
      .mockResolvedValueOnce({ items: [], next_cursor: 'a' })
      .mockRejectedValueOnce(new ApiError(503))
      .mockResolvedValueOnce({ items: [summary(first), summary(first)], next_cursor: 'a' })
    await button('刷新列表').trigger('click')
    await flushPromises()
    expect(view().text()).toContain('当前页暂无举报')
    await button('加载更多举报').trigger('click')
    await flushPromises()
    expect(view().text()).toContain('服务暂不可用')
    await button('重试加载').trigger('click')
    await flushPromises()
    expect(view().findAll('.workflow-list li')).toHaveLength(1)
    expect(view().text()).toContain('分页游标重复')
    expect(hasButton('加载更多举报')).toBe(false)
  })
  it('切换举报后旧正文和治理请求晚到不污染新案', async () => {
    await flushPromises()
    const pending = deferred<ReportDetail>()
    mocks.whisperAdminReportGet.mockReturnValueOnce(pending.promise)
    await open()
    await open(second.id)
    pending.resolve(first)
    await flushPromises()
    expect(view().text()).toContain(second.body)
    expect(view().text()).not.toContain(first.body)
  })
  it('开始处理取消未完成分页，避免迟到列表清除确认', async () => {
    await flushPromises()
    mocks.whisperAdminReportsList.mockResolvedValueOnce({
      items: [summary(first)],
      next_cursor: 'a',
    })
    await button('刷新列表').trigger('click')
    await flushPromises()
    await open()
    const pending = deferred<{ items: ReportSummary[]; next_cursor: string | null }>()
    mocks.whisperAdminReportsList.mockReturnValueOnce(pending.promise)
    await button('加载更多举报').trigger('click')
    await processing('判定举报')
    pending.resolve({ items: [{ ...summary(first), version: 10 }], next_cursor: null })
    await flushPromises()
    expect(view().find('form').exists()).toBe(true)
    await confirm()
    expect(mocks.whisperAdminReportDecide.mock.calls[0]?.[1]).toMatchObject({ expected_version: 4 })
  })
  it.each([401, 403])('%s拒绝后清理所有正文与表单', async (status) => {
    await flushPromises()
    await open()
    await processing('判定举报')
    mocks.whisperAdminReportDecide.mockRejectedValueOnce(new ApiError(status))
    await confirm()
    expect(view().find('blockquote').exists()).toBe(false)
    expect(view().find('form').exists()).toBe(false)
    expect(useAdminStore().authenticated).toBe(status !== 401)
  })
  it('撤销全部岗位或退出清理正文，迟到回执不可恢复', async () => {
    await flushPromises()
    await open()
    await processing('判定举报')
    const pending = deferred<ReportSummary>()
    mocks.whisperAdminReportDecide.mockReturnValueOnce(pending.promise)
    await view().get('form').trigger('submit')
    await button('确认提交').trigger('click')
    const session = useAdminStore().session
    if (!session) throw new Error('缺少会话')
    session.account.roles = []
    await flushPromises()
    pending.resolve(summary(first))
    await flushPromises()
    expect(view().find('form').exists()).toBe(false)
    expect(view().find('blockquote').exists()).toBe(false)
    expect(view().find('[aria-label="树洞处罚回执"]').exists()).toBe(false)
  })
  it('离页取消读取，关闭处理后不保留旧理由', async () => {
    await flushPromises()
    await open()
    await processing('判定举报')
    await button('取消处理').trigger('click')
    await processing('判定举报')
    const textarea = view().get<HTMLTextAreaElement>('#whisper-report-reason')
    expect(textarea.element.value).toBe(' 合成处理理由 ')
    await button('取消处理').trigger('click')
    await button('判定举报').trigger('click')
    await flushPromises()
    expect(view().get<HTMLTextAreaElement>('#whisper-report-reason').element.value).toBe('')
    const abort: unknown = mocks.whisperAdminReportGet.mock.calls[0]?.[1]
    view().unmount()
    wrapper = undefined
    if (abort instanceof AbortSignal) expect(abort.aborted).toBe(true)
  })
})

it('WA-03 旧治理对象迟到不能替换新举报的版本或解除方向', async () => {
  await flushPromises()
  const old = deferred<ContentControl>()
  mocks.whisperAdminContentGet.mockReturnValueOnce(old.promise)
  await open()
  await open(second.id)
  old.resolve({ ...control, version: 99, restricted: true })
  await flushPromises()
  expect(view().text()).toContain(second.body)
  expect(view().text()).not.toContain('治理版本 99')
  expect(hasButton('设置普通限制')).toBe(true)
  expect(hasButton('解除普通限制')).toBe(false)
})
it('WA-03 危机角色也不能绕过举报的动作投影', async () => {
  await flushPromises()
  const session = useAdminStore().session
  if (!session) throw new Error('缺少会话')
  session.account.roles = ['crisis_operator']
  mocks.whisperAdminReportGet.mockResolvedValueOnce({ ...first, allowed_actions: [] })
  await open()
  expect(hasButton('升级危机')).toBe(false)
})
