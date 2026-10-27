import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WhisperEvidenceView from './WhisperEvidenceView.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type { DeletionJob, EvidenceScope } from '@/types/whispers'
import type * as Service from '@/services/whispers'

const mocks = vi.hoisted(() => ({
  whisperAdminEvidenceGet: vi.fn(),
  whisperAdminEvidenceDelete: vi.fn(),
  whisperAdminDeletionGet: vi.fn(),
}))
vi.mock('@/services/whispers', async (original) => ({
  ...(await original<typeof Service>()),
  createWhispersClient: () => mocks,
}))
const scope: EvidenceScope = {
  id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  version: 31,
  state: 'retained',
  allowed_actions: ['whisperAdminEvidenceDelete'],
}
const job: DeletionJob = {
  id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  status: 'processing',
  scope: 'evidence',
  allowed_actions: [],
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
async function load() {
  await view().get('#whisper-evidence-id').setValue(scope.id)
  await view().get('[aria-label="树洞证据范围"] form').trigger('submit')
  await flushPromises()
}
async function process() {
  await button('处理证据删除').trigger('click')
  await flushPromises()
  await view().get('#whisper-delete-reason').setValue(' 合成范围删除理由 ')
  await view().get('#whisper-delete-confirmation').setValue('DELETE_EVIDENCE_SCOPE')
}
async function confirm() {
  await view().get('.el-drawer form').trigger('submit')
  await button('确认删除证据范围').trigger('click')
  await flushPromises()
}
async function query() {
  await view().get('#whisper-job-id').setValue(job.id)
  await view().get('[aria-label="树洞证据删除进度"] form').trigger('submit')
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'test',
    account: { id: 'op', login_name: '合成超管', version: 1, active: true, roles: ['super_admin'] },
  }
  mocks.whisperAdminEvidenceGet.mockResolvedValue(scope)
  mocks.whisperAdminEvidenceDelete.mockResolvedValue(job)
  mocks.whisperAdminDeletionGet.mockResolvedValue(job)
  wrapper = mount(WhisperEvidenceView, { global: { plugins: [pinia] } })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('WA-04 REQ-018/019 树洞证据范围', () => {
  it('即使受理回执写completed也须独立查询后才显示完成', async () => {
    mocks.whisperAdminEvidenceDelete.mockResolvedValueOnce({ ...job, status: 'completed' })
    await load()
    await process()
    await confirm()
    expect(view().find('[aria-label="树洞证据清理结果"]').exists()).toBe(false)
    expect(view().text()).toContain('尚未确认清理完成')
    mocks.whisperAdminDeletionGet.mockResolvedValueOnce({ ...job, status: 'completed' })
    await query()
    expect(view().get('[aria-label="树洞证据清理结果"]').text()).toContain('清理已完成（后端确认）')
  })
  it('按已知UUID读取元信息，不预取、不提供正文或学号', async () => {
    await flushPromises()
    expect(mocks.whisperAdminEvidenceGet).not.toHaveBeenCalled()
    expect(button('读取证据范围').attributes('disabled')).toBeDefined()
    await view().get('#whisper-evidence-id').setValue('不是UUID')
    expect(button('读取证据范围').attributes('disabled')).toBeDefined()
    await load()
    expect(mocks.whisperAdminEvidenceGet).toHaveBeenCalledWith(scope.id, expect.any(AbortSignal))
    expect(view().text()).toContain('范围版本 31')
    expect(view().find('blockquote').exists()).toBe(false)
    expect(view().find('input[type="number"]').exists()).toBe(false)
    await view().get('#whisper-evidence-id').setValue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    expect(hasButton('处理证据删除')).toBe(false)
  })
  it('精确确认短语和非空500码点理由必填，不自动预填确认', async () => {
    await load()
    await button('处理证据删除').trigger('click')
    await flushPromises()
    expect(view().get<HTMLInputElement>('#whisper-delete-confirmation').element.value).toBe('')
    await view().get('#whisper-delete-reason').setValue('合成理由')
    for (const text of ['DELETE', 'delete_evidence_scope', ' DELETE_EVIDENCE_SCOPE']) {
      await view().get('#whisper-delete-confirmation').setValue(text)
      expect(button('核对删除范围').attributes('disabled')).toBeDefined()
    }
    await view().get('#whisper-delete-confirmation').setValue('DELETE_EVIDENCE_SCOPE')
    for (const text of [' ', '😀'.repeat(501)]) {
      await view().get('#whisper-delete-reason').setValue(text)
      expect(button('核对删除范围').attributes('disabled')).toBeDefined()
    }
    await view().get('#whisper-delete-reason').setValue('😀'.repeat(500))
    expect(button('核对删除范围').attributes('disabled')).toBeUndefined()
    expect(mocks.whisperAdminEvidenceDelete).not.toHaveBeenCalled()
  })
  it('使用范围版本和明确确认体，受理后清表单，不将202当完成', async () => {
    await load()
    await process()
    await confirm()
    expect(mocks.whisperAdminEvidenceDelete).toHaveBeenCalledWith(
      scope.id,
      { expected_version: 31, confirmation: 'DELETE_EVIDENCE_SCOPE', reason: ' 合成范围删除理由 ' },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(view().text()).toContain('删除请求已受理，尚未确认清理完成')
    expect(view().get<HTMLInputElement>('#whisper-job-id').element.value).toBe(job.id)
    expect(view().find('#whisper-delete-reason').exists()).toBe(false)
    expect(view().find('[aria-label="树洞证据清理结果"]').exists()).toBe(false)
    expect(mocks.whisperAdminDeletionGet).not.toHaveBeenCalled()
    expect(hasButton('处理证据删除')).toBe(false)
  })
  it('任务独立查询processing与completed，切任务即清旧完成状态', async () => {
    await query()
    expect(mocks.whisperAdminDeletionGet).toHaveBeenCalledWith(job.id, expect.any(AbortSignal))
    expect(view().get('[aria-label="树洞证据清理结果"]').text()).toContain('尚未全部完成')
    mocks.whisperAdminDeletionGet.mockResolvedValueOnce({ ...job, status: 'completed' })
    await query()
    expect(view().get('[aria-label="树洞证据清理结果"]').text()).toContain('清理已完成（后端确认）')
    await view().get('#whisper-job-id').setValue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    expect(view().find('[aria-label="树洞证据清理结果"]').exists()).toBe(false)
    expect(mocks.whisperAdminEvidenceDelete).not.toHaveBeenCalled()
  })
  it.each([
    { ...scope, state: 'deleting' as const },
    { ...scope, allowed_actions: [] },
  ])('范围状态或动作不允许时不开放删除', async (value) => {
    mocks.whisperAdminEvidenceGet.mockResolvedValueOnce(value)
    await load()
    expect(hasButton('处理证据删除')).toBe(false)
  })
  it.each([404, 409])('%s清范围及表单，重读后使用新范围版本', async (status) => {
    await load()
    await process()
    mocks.whisperAdminEvidenceDelete.mockRejectedValueOnce(new ApiError(status))
    await confirm()
    expect(view().find('#whisper-delete-reason').exists()).toBe(false)
    expect(hasButton('处理证据删除')).toBe(false)
    expect(mocks.whisperAdminEvidenceGet).toHaveBeenCalledTimes(1)
    mocks.whisperAdminEvidenceGet.mockResolvedValueOnce({ ...scope, version: 48 })
    await load()
    await process()
    await confirm()
    expect(mocks.whisperAdminEvidenceDelete.mock.calls[1]?.[1]).toMatchObject({
      expected_version: 48,
    })
  })
  it('受理结果未知原键原体重试，锁定表单关闭与其他查询，双击只提交一次', async () => {
    await load()
    await process()
    mocks.whisperAdminEvidenceDelete.mockRejectedValueOnce(new TypeError('offline'))
    await confirm()
    const original = mocks.whisperAdminEvidenceDelete.mock.calls[0]
    expect(button('返回修改').attributes('disabled')).toBeDefined()
    expect(button('取消处理').attributes('disabled')).toBeDefined()
    expect(view().get('#whisper-delete-reason').element.closest('fieldset')?.disabled).toBe(true)
    expect(view().get('#whisper-job-id').element.closest('fieldset')?.disabled).toBe(true)
    const pending = deferred<DeletionJob>()
    mocks.whisperAdminEvidenceDelete.mockReturnValueOnce(pending.promise)
    await button('使用原请求重试').trigger('click')
    await button('正在提交…').trigger('click')
    expect(mocks.whisperAdminEvidenceDelete).toHaveBeenCalledTimes(2)
    expect(mocks.whisperAdminEvidenceDelete.mock.calls[1]?.slice(0, 3)).toEqual(
      original?.slice(0, 3),
    )
    pending.resolve(job)
    await flushPromises()
  })
  it.each([400, 429, 503])('%s明确未执行可修改理由并生成新键', async (status) => {
    await load()
    await process()
    mocks.whisperAdminEvidenceDelete.mockRejectedValueOnce(new ApiError(status))
    await confirm()
    const key: unknown = mocks.whisperAdminEvidenceDelete.mock.calls[0]?.[2]
    expect(button('取消处理').attributes('disabled')).toBeUndefined()
    await view().get('#whisper-delete-reason').setValue('修改后理由')
    await confirm()
    expect(mocks.whisperAdminEvidenceDelete.mock.calls[1]?.[2]).not.toBe(key)
  })
  it('取消处理不保留确认短语及理由，关闭按钮也清表单', async () => {
    await load()
    await process()
    await button('取消处理').trigger('click')
    await button('处理证据删除').trigger('click')
    await flushPromises()
    expect(view().get<HTMLInputElement>('#whisper-delete-confirmation').element.value).toBe('')
    expect(view().get<HTMLTextAreaElement>('#whisper-delete-reason').element.value).toBe('')
    await view().get('.el-drawer__close-btn').trigger('click')
    await flushPromises()
    expect(view().find('#whisper-delete-reason').exists()).toBe(false)
  })
  it('查询失败清旧进度且可手动重试', async () => {
    await query()
    mocks.whisperAdminDeletionGet.mockRejectedValueOnce(new ApiError(503))
    await query()
    expect(view().find('[aria-label="树洞证据清理结果"]').exists()).toBe(false)
    expect(view().text()).toContain('服务暂不可用')
    await query()
    expect(view().get('[aria-label="树洞证据清理结果"]').text()).toContain('尚未全部完成')
  })
  it.each([401, 403])('%s拒绝清除范围、理由、任务及回执', async (status) => {
    await load()
    await process()
    mocks.whisperAdminEvidenceDelete.mockRejectedValueOnce(new ApiError(status))
    await confirm()
    expect(view().find('#whisper-delete-reason').exists()).toBe(false)
    expect(view().text()).not.toContain(scope.id)
    expect(view().text()).not.toContain(job.id)
    expect(useAdminStore().authenticated).toBe(status !== 401)
  })
  it.each(['role', 'account', 'leave'] as const)(
    '%s失效取消写入，迟到任务不能回填',
    async (mode) => {
      await load()
      await process()
      const pending = deferred<DeletionJob>()
      mocks.whisperAdminEvidenceDelete.mockReturnValueOnce(pending.promise)
      await view().get('.el-drawer form').trigger('submit')
      await button('确认删除证据范围').trigger('click')
      const signal: unknown = mocks.whisperAdminEvidenceDelete.mock.calls[0]?.[3]
      const session = useAdminStore().session
      if (!session) throw new Error('缺少会话')
      if (mode === 'role') session.account.roles = ['crisis_operator']
      if (mode === 'account') useAdminStore().session = { ...session, token: 'another' }
      if (mode === 'leave') {
        view().unmount()
        wrapper = undefined
      }
      pending.resolve(job)
      await flushPromises()
      expect(signal).toBeInstanceOf(AbortSignal)
      if (signal instanceof AbortSignal) expect(signal.aborted).toBe(true)
      if (mode !== 'leave') {
        expect(view().text()).not.toContain(job.id)
        expect(view().find('#whisper-delete-reason').exists()).toBe(false)
      }
    },
  )
  it('读取目标或进度时撤权，迟到响应不能恢复元信息', async () => {
    const pending = deferred<EvidenceScope>()
    mocks.whisperAdminEvidenceGet.mockReturnValueOnce(pending.promise)
    await load()
    const session = useAdminStore().session
    if (!session) throw new Error('缺少会话')
    session.account.roles = []
    pending.resolve(scope)
    await flushPromises()
    expect(view().text()).not.toContain(scope.id)
    expect(hasButton('处理证据删除')).toBe(false)
  })
  it.each(['review_operator', 'crisis_operator'] as const)(
    '%s直接挂载不展示证据操作',
    async (role) => {
      wrapper?.unmount()
      const session = useAdminStore().session
      if (!session) throw new Error('缺少会话')
      session.account.roles = [role]
      wrapper = mount(WhisperEvidenceView)
      await flushPromises()
      expect(view().find('form').exists()).toBe(false)
      expect(mocks.whisperAdminEvidenceGet).not.toHaveBeenCalled()
    },
  )
})
