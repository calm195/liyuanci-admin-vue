import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElDrawer } from 'element-plus'
import WhisperReviewsView from './WhisperReviewsView.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type { Role } from '@/types/admin'
import type { ReviewDetail, ReviewOutcome, ReviewSummary } from '@/types/whispers'
import type * as Service from '@/services/whispers'

const mocks = vi.hoisted(() => ({
  whisperAdminReviewsList: vi.fn(),
  whisperAdminReviewGet: vi.fn(),
  whisperAdminReviewDecide: vi.fn(),
  whisperAdminReviewEscalate: vi.fn(),
}))
vi.mock('@/services/whispers', async (original) => ({
  ...(await original<typeof Service>()),
  createWhispersClient: () => mocks,
}))
const first: ReviewDetail = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  version: 3,
  source: { kind: 'whisper_post', id: '11111111-1111-1111-1111-111111111111', content_version: 7 },
  status: 'pending',
  created_at: '2026-10-27T00:00:00Z',
  allowed_actions: ['whisperAdminReviewDecide', 'whisperAdminReviewEscalate'],
  body: '合成树洞命中正文',
  school_related: true,
  privacy_recheck: false,
}
const second: ReviewDetail = {
  ...first,
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  source: { ...first.source, kind: 'whisper_capsule' },
  body: '私密合成胶囊正文',
}
const summary = ({
  body,
  school_related,
  privacy_recheck,
  ...data
}: ReviewDetail): ReviewSummary => {
  void body
  void school_related
  void privacy_recheck
  return { ...data, allowed_actions: [] }
}
const receipt: ReviewOutcome = {
  id: first.id,
  version: 4,
  content_decision: 'approved',
  business_outcome: 'cancelled',
}
let wrapper: VueWrapper | undefined
function view() {
  if (!wrapper) throw new Error('未挂载页面')
  return wrapper
}
function button(text: string) {
  const found = view()
    .findAll('button')
    .find((item) => item.text() === text)
  if (!found) throw new Error(`未找到按钮：${text}`)
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
      if (!finish) throw new Error('未准备')
      finish(value)
    },
  }
}
function login(roles: Role[] = ['review_operator']) {
  useAdminStore().session = {
    token: 'test',
    account: { id: 'operator', login_name: '合成审核', version: 1, active: true, roles },
  }
}
async function open(id = first.id) {
  const item = view()
    .findAll('.workflow-list button')
    .find((entry) => entry.text().includes(id))
  if (!item) throw new Error('未找到案件')
  await item.trigger('click')
  await flushPromises()
}
async function processing() {
  await button('处理树洞审核').trigger('click')
  await flushPromises()
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
  login()
  mocks.whisperAdminReviewsList.mockResolvedValue({
    items: [summary(first), summary(second)],
    next_cursor: null,
  })
  mocks.whisperAdminReviewGet.mockImplementation((id: string) =>
    Promise.resolve({ ...(id === first.id ? first : second) }),
  )
  mocks.whisperAdminReviewDecide.mockResolvedValue(receipt)
  mocks.whisperAdminReviewEscalate.mockResolvedValue({ id: 'crisis-new' })
  wrapper = mount(WhisperReviewsView, { global: { plugins: [pinia] } })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

describe('WA-02 树洞审核页面', () => {
  it('列表仅元数据，详情显示来源、双版本和涉校提示，正文按文本呈现', async () => {
    await flushPromises()
    expect(view().text()).not.toContain(first.body)
    expect(mocks.whisperAdminReviewGet).not.toHaveBeenCalled()
    mocks.whisperAdminReviewGet.mockResolvedValueOnce({
      ...first,
      body: '<img src=x onerror=alert(1)>',
    })
    await open()
    expect(view().text()).toContain('案件版本 3 · 正文版本 7')
    expect(view().text()).toContain('未经证实')
    expect(view().get('blockquote').text()).toBe('<img src=x onerror=alert(1)>')
    expect(view().find('blockquote img').exists()).toBe(false)
    expect(view().find('form').exists()).toBe(false)
    expect(view().find('input[type="search"]').exists()).toBe(false)
  })
  it.each(['whisper_post', 'whisper_comment', 'whisper_nickname', 'whisper_capsule'] as const)(
    '显示来源%s及适用提示',
    async (kind) => {
      await flushPromises()
      mocks.whisperAdminReviewGet.mockResolvedValueOnce({
        ...first,
        source: { ...first.source, kind },
        privacy_recheck: true,
      })
      await open()
      expect(view().text()).toContain('隐私复核')
      if (kind === 'whisper_capsule')
        expect(view().text()).toContain('私密胶囊：仅因当前安全命中案件授权读取')
      if (kind === 'whisper_nickname') expect(view().text()).toContain('候选昵称')
    },
  )
  it('仅在详情允许动作且状态待审时处理，取消案件不显示正文', async () => {
    await flushPromises()
    mocks.whisperAdminReviewGet.mockResolvedValueOnce({ ...first, allowed_actions: [] })
    await open()
    expect(view().text()).toContain('没有可执行的处理动作')
    expect(
      view()
        .findAll('button')
        .some((item) => item.text() === '处理树洞审核'),
    ).toBe(false)
    mocks.whisperAdminReviewGet.mockResolvedValueOnce({ ...first, status: 'cancelled' })
    await button('重新读取案件').trigger('click')
    await flushPromises()
    expect(view().find('blockquote').exists()).toBe(false)
    expect(view().text()).toContain('案件已取消')
  })
  it('驳回按500码点校验原因及建议，保留空白并提交双版本', async () => {
    await flushPromises()
    await open()
    await processing()
    await view().get('input[value="rejected"]').setValue()
    await view().get('#whisper-reason').setValue(' ')
    await view().get('#whisper-suggestion').setValue('修改建议')
    expect(button('核对操作').attributes('disabled')).toBeDefined()
    await view().get('#whisper-reason').setValue('😀'.repeat(501))
    expect(button('核对操作').attributes('disabled')).toBeDefined()
    await view().get('#whisper-reason').setValue(' 合成理由 ')
    await view().get('#whisper-suggestion').setValue(' 合成建议 ')
    await confirm()
    expect(mocks.whisperAdminReviewDecide).toHaveBeenCalledWith(
      first.id,
      {
        expected_version: 3,
        expected_content_version: 7,
        decision: 'rejected',
        reason: ' 合成理由 ',
        revision_suggestion: ' 合成建议 ',
      },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(view().find('blockquote').exists()).toBe(false)
    expect(view().find('form').exists()).toBe(false)
  })
  it.each([
    ['published', '已公开'],
    ['nickname_activated', '昵称已启用'],
    ['capsule_locked', '胶囊仍锁定'],
    ['capsule_unlocked', '胶囊已解锁'],
    ['cancelled', '业务已取消'],
    ['rejected', '业务已拒绝'],
    ['privacy_review_required', '仍需隐私复核'],
  ])('准确展示%s的业务结果', async (business_outcome, label) => {
    await flushPromises()
    await open()
    await processing()
    mocks.whisperAdminReviewDecide.mockResolvedValueOnce({ ...receipt, business_outcome })
    await confirm()
    expect(view().get('[aria-label="树洞审核回执"]').text()).toContain(`业务结果：${label}`)
    expect(view().text()).toContain('内容判定：通过')
    expect(view().find('blockquote').exists()).toBe(false)
    expect(view().find('form').exists()).toBe(false)
  })
  it.each([404, 409])('%s清除正文及表单，不自动重提，需手工重新读取', async (status) => {
    await flushPromises()
    await open()
    await processing()
    mocks.whisperAdminReviewDecide.mockRejectedValueOnce(new ApiError(status))
    await confirm()
    expect(view().find('blockquote').exists()).toBe(false)
    expect(view().find('form').exists()).toBe(false)
    expect(mocks.whisperAdminReviewGet).toHaveBeenCalledTimes(1)
    mocks.whisperAdminReviewGet.mockResolvedValueOnce({
      ...first,
      version: 8,
      source: { ...first.source, content_version: 9 },
      body: '重新读取后的合成正文',
    })
    await button('重新读取案件').trigger('click')
    await flushPromises()
    expect(view().text()).toContain('案件版本 8 · 正文版本 9')
    await processing()
    await confirm()
    expect(mocks.whisperAdminReviewDecide.mock.calls[1]?.[1]).toMatchObject({
      expected_version: 8,
      expected_content_version: 9,
    })
  })
  it('结果未知时锁定表单、阻止双击，只允许原键原体重试', async () => {
    await flushPromises()
    await open()
    await processing()
    const pending = deferred<ReviewOutcome>()
    mocks.whisperAdminReviewDecide.mockReturnValueOnce(pending.promise)
    await view().get('form').trigger('submit')
    await button('确认提交').trigger('click')
    await button('正在提交…').trigger('click')
    expect(mocks.whisperAdminReviewDecide).toHaveBeenCalledTimes(1)
    pending.resolve(receipt)
    await flushPromises()
    await button('刷新列表').trigger('click')
    await flushPromises()
    await open()
    await processing()
    mocks.whisperAdminReviewDecide.mockRejectedValueOnce(new TypeError('offline'))
    await confirm()
    const before = mocks.whisperAdminReviewDecide.mock.calls[1]
    expect(button('返回修改').attributes('disabled')).toBeDefined()
    expect(button('取消处理').attributes('disabled')).toBeDefined()
    await button('使用原请求重试').trigger('click')
    await flushPromises()
    expect(mocks.whisperAdminReviewDecide.mock.calls[2]?.slice(0, 3)).toEqual(before?.slice(0, 3))
  })
  it('空页仍可继续、跨页去重并停止循环游标', async () => {
    await flushPromises()
    mocks.whisperAdminReviewsList
      .mockResolvedValueOnce({ items: [], next_cursor: 'opaque-a' })
      .mockResolvedValueOnce({ items: [summary(first), summary(first)], next_cursor: 'opaque-b' })
      .mockResolvedValueOnce({ items: [summary(first), summary(second)], next_cursor: 'opaque-a' })
    await button('刷新列表').trigger('click')
    await flushPromises()
    expect(view().text()).toContain('当前页暂无审核案件')
    await button('加载更多案件').trigger('click')
    await flushPromises()
    expect(view().findAll('.workflow-list li')).toHaveLength(1)
    await button('加载更多案件').trigger('click')
    await flushPromises()
    expect(view().findAll('.workflow-list li')).toHaveLength(2)
    expect(view().text()).toContain('分页游标重复')
    expect(
      view()
        .findAll('button')
        .some((item) => item.text() === '加载更多案件'),
    ).toBe(false)
  })
  it('空列表、列表失败和重试均有明确反馈', async () => {
    await flushPromises()
    mocks.whisperAdminReviewsList.mockRejectedValueOnce(new ApiError(503))
    await button('刷新列表').trigger('click')
    await flushPromises()
    expect(view().text()).toContain('服务暂不可用')
    mocks.whisperAdminReviewsList.mockResolvedValueOnce({ items: [], next_cursor: null })
    await button('刷新列表').trigger('click')
    await flushPromises()
    expect(view().text()).toContain('当前页暂无审核案件')
    expect(view().text()).not.toContain('服务暂不可用')
  })
  it('加载更多时发现选中案件换版，立即清除旧详情', async () => {
    await flushPromises()
    mocks.whisperAdminReviewsList.mockResolvedValueOnce({
      items: [summary(first)],
      next_cursor: 'next',
    })
    await button('刷新列表').trigger('click')
    await flushPromises()
    await open()
    mocks.whisperAdminReviewsList.mockResolvedValueOnce({
      items: [{ ...summary(first), version: 9 }],
      next_cursor: null,
    })
    await button('加载更多案件').trigger('click')
    await flushPromises()
    expect(view().find('blockquote').exists()).toBe(false)
    expect(view().text()).toContain('清除旧正文')
  })
  it('切案拒绝旧响应回填，离页取消请求', async () => {
    await flushPromises()
    const pending = deferred<ReviewDetail>()
    mocks.whisperAdminReviewGet.mockReturnValueOnce(pending.promise)
    await open()
    await open(second.id)
    pending.resolve(first)
    await flushPromises()
    expect(view().text()).toContain(second.body)
    expect(view().text()).not.toContain(first.body)
    const abort: unknown = mocks.whisperAdminReviewGet.mock.calls[1]?.[1]
    view().unmount()
    wrapper = undefined
    expect(abort).toBeInstanceOf(AbortSignal)
    if (abort instanceof AbortSignal) expect(abort.aborted).toBe(true)
  })
  it.each([401, 403])('%s清理正文和决定，执行会话/权限拒绝流程', async (status) => {
    await flushPromises()
    await open()
    await processing()
    mocks.whisperAdminReviewDecide.mockRejectedValueOnce(new ApiError(status))
    await confirm()
    expect(view().find('blockquote').exists()).toBe(false)
    expect(view().find('form').exists()).toBe(false)
    expect(useAdminStore().authenticated).toBe(status !== 401)
    expect(useAdminStore().forbidden).toBe(status === 403 ? 1 : 0)
  })
  it('撤权或切账号立即清除正文，迟到写入回执无效', async () => {
    await flushPromises()
    await open()
    await processing()
    const pending = deferred<ReviewOutcome>()
    mocks.whisperAdminReviewDecide.mockReturnValueOnce(pending.promise)
    await view().get('form').trigger('submit')
    await button('确认提交').trigger('click')
    login(['crisis_operator'])
    await flushPromises()
    pending.resolve(receipt)
    await flushPromises()
    expect(view().find('blockquote').exists()).toBe(false)
    expect(view().find('form').exists()).toBe(false)
    expect(view().find('[aria-label="树洞审核回执"]').exists()).toBe(false)
  })
  it('普通审核和双岗位没有升级入口，超管仍需服务端允许动作', async () => {
    await flushPromises()
    await open()
    expect(
      view()
        .findAll('button')
        .some((item) => item.text() === '升级危机'),
    ).toBe(false)
    const session = useAdminStore().session
    if (!session) throw new Error('缺少会话')
    session.account.roles = ['review_operator', 'crisis_operator']
    await flushPromises()
    expect(
      view()
        .findAll('button')
        .some((item) => item.text() === '升级危机'),
    ).toBe(false)
    session.account.roles = ['super_admin']
    await flushPromises()
    await button('升级危机').trigger('click')
    await view().get('#whisper-reason').setValue(' 合成危机理由 ')
    await confirm()
    expect(mocks.whisperAdminReviewEscalate).toHaveBeenCalledWith(
      first.id,
      { expected_version: 3, reason: ' 合成危机理由 ' },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(view().text()).toContain('已升级危机，案件标识：crisis-new')
    expect(view().find('blockquote').exists()).toBe(false)
  })
  it('开始处理时取消尚未完成的分页，迟到列表不能清除当前表单', async () => {
    await flushPromises()
    mocks.whisperAdminReviewsList.mockResolvedValueOnce({
      items: [summary(first)],
      next_cursor: 'next',
    })
    await button('刷新列表').trigger('click')
    await flushPromises()
    await open()
    const pending = deferred<{ items: ReviewSummary[]; next_cursor: string | null }>()
    mocks.whisperAdminReviewsList.mockReturnValueOnce(pending.promise)
    await button('加载更多案件').trigger('click')
    await processing()
    pending.resolve({ items: [{ ...summary(first), version: 9 }], next_cursor: null })
    await flushPromises()
    expect(view().find('form').exists()).toBe(true)
    expect(view().text()).toContain('案件版本 3 · 正文版本 7')
    await confirm()
    expect(mocks.whisperAdminReviewDecide.mock.calls[0]?.[1]).toMatchObject({
      expected_version: 3,
      expected_content_version: 7,
    })
  })
  it('同一会话原地撤销审核角色立即清理正文及抽屉', async () => {
    await flushPromises()
    await open()
    await processing()
    const session = useAdminStore().session
    if (!session) throw new Error('缺少会话')
    session.account.roles = ['crisis_operator']
    await flushPromises()
    expect(view().find('form').exists()).toBe(false)
    expect(view().find('blockquote').exists()).toBe(false)
    expect(mocks.whisperAdminReviewDecide).not.toHaveBeenCalled()
  })
  it('抽屉关闭前清空处理表单，下次不复用旧意见', async () => {
    await flushPromises()
    await open()
    await processing()
    await view().get('input[value="rejected"]').setValue()
    await view().get('#whisper-reason').setValue('暂存意见')
    await view().findComponent(ElDrawer).get('.el-drawer__close-btn').trigger('click')
    await flushPromises()
    await processing()
    expect(view().find('#whisper-reason').exists()).toBe(false)
  })
})

it.each(['editing', 'pending', 'uncertain'] as const)(
  'WA-05 升级权限撤销但普通权限保留时清理%s抽屉与正文',
  async (mode) => {
    await flushPromises()
    const session = useAdminStore().session
    if (!session) throw new Error('缺少会话')
    session.account.roles = ['super_admin']
    await open()
    await button('升级危机').trigger('click')
    await flushPromises()
    await view().get('#whisper-reason').setValue('合成升级理由')
    const pending = deferred<{ id: string }>()
    if (mode === 'pending') mocks.whisperAdminReviewEscalate.mockReturnValueOnce(pending.promise)
    if (mode === 'uncertain')
      mocks.whisperAdminReviewEscalate.mockRejectedValueOnce(new TypeError('合成中断'))
    if (mode !== 'editing') await confirm()
    session.account.roles = ['review_operator']
    await flushPromises()
    expect(view().find('form').exists()).toBe(false)
    expect(view().find('blockquote').exists()).toBe(false)
    expect(view().text()).toContain('危机升级权限已撤销')
    pending.resolve({ id: '迟到回执' })
    await flushPromises()
    expect(view().text()).not.toContain('迟到回执')
    expect(mocks.whisperAdminReviewEscalate).toHaveBeenCalledTimes(mode === 'editing' ? 0 : 1)
  },
)
