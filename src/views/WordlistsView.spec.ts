import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import WordlistsView from './WordlistsView.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type * as adminService from '@/services/admin'
import type { Wordlist } from '@/types/wordlists'
const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), publish: vi.fn() }))
vi.mock('@/services/wordlists', () => ({ createWordlistClient: () => mocks }))
vi.mock('@/services/admin', async (original) => ({
  ...(await original<typeof adminService>()),
  mockEnabled: true,
}))
const published: Wordlist = { id: 'school-old', kind: 'school', version: 1, status: 'published' }
const draft: Wordlist = { id: 'school-draft', kind: 'school', version: 2, status: 'draft' }
let wrapper: VueWrapper | undefined
function button(label: string) {
  const value = wrapper?.findAll('button').find((item) => item.text() === label)
  if (!value) throw new Error(`未找到按钮：${label}`)
  return value
}
function deferred<T>() {
  let resolve: ((value: T) => void) | undefined
  return {
    promise: new Promise<T>((done) => {
      resolve = done
    }),
    finish(value: T) {
      if (!resolve) throw new Error('未准备')
      resolve(value)
    },
  }
}
async function prepare() {
  await wrapper?.get('#wordlist-entries').setValue(' 合成新词 \n\n 第二条 ')
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
    token: 'synthetic',
    account: { id: 'reviewer', version: 1, active: true, roles: ['review_operator'] },
  }
  mocks.list.mockResolvedValue({ items: [published, draft], next_cursor: null })
  mocks.create.mockResolvedValue({ ...draft, id: 'new-draft', version: 3 })
  mocks.publish.mockResolvedValue({ ...draft, version: 3, status: 'published' })
  wrapper = mount(WordlistsView, { global: { plugins: [pinia] } })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})
describe('T017 REQ-015/018/019 合成词库页面', () => {
  it('明确模拟规则、未读原词条和真实扫描边界，创建使用完整列表最高版本', async () => {
    await flushPromises()
    expect(wrapper?.text()).toContain('尚非真实契约')
    expect(wrapper?.text()).toContain('未读取原词条')
    await prepare()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(wrapper?.text()).toContain('完整词条 2 条')
    await submit()
    expect(mocks.create).toHaveBeenCalledWith(
      { kind: 'school', entries: ['合成新词', '第二条'], expected_version: 2 },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(wrapper?.text()).toContain('尚未发布')
  })
  it('新分类无基准，空词条按契约允许，返回修改不写入', async () => {
    await flushPromises()
    await wrapper?.get('#wordlist-kind').setValue('crisis')
    await wrapper?.get('form').trigger('submit')
    await button('返回修改').trigger('click')
    expect(mocks.create).not.toHaveBeenCalled()
    await wrapper?.get('form').trigger('submit')
    await submit()
    expect(mocks.create.mock.calls[0]?.[0]).toEqual({ kind: 'crisis', entries: [] })
  })
  it('发布单独确认精确资源版本，未知状态只读', async () => {
    await flushPromises()
    await button('发布 school-draft').trigger('click')
    expect(mocks.publish).not.toHaveBeenCalled()
    await submit()
    expect(mocks.publish).toHaveBeenCalledWith(
      'school-draft',
      2,
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(wrapper?.text()).toContain('不代表真实扫描生效')
    mocks.list.mockResolvedValue({ items: [{ ...draft, status: 'future' }], next_cursor: null })
    await button('刷新词库').trigger('click')
    await flushPromises()
    expect(wrapper?.text()).toContain('未知状态（只读）')
    expect(wrapper?.findAll('button').some((value) => value.text().startsWith('发布 '))).toBe(false)
  })
  it('重复提交只发送一次；不确定失败沿用幂等键，修改输入换键', async () => {
    await flushPromises()
    const pending = deferred<Wordlist>()
    mocks.create.mockReturnValueOnce(pending.promise)
    await prepare()
    await button('确认提交').trigger('click')
    await button('正在提交…').trigger('click')
    expect(mocks.create).toHaveBeenCalledTimes(1)
    pending.finish(draft)
    await flushPromises()
    mocks.create.mockRejectedValue(new Error('network'))
    await prepare()
    await submit()
    const key: unknown = mocks.create.mock.calls[1]?.[1]
    await submit()
    expect(mocks.create.mock.calls[2]?.[1]).toBe(key)
    await button('返回修改').trigger('click')
    await wrapper?.get('#wordlist-entries').setValue('修改后词条')
    await wrapper?.get('form').trigger('submit')
    await submit()
    expect(mocks.create.mock.calls[3]?.[1]).not.toBe(key)
  })
  it('409重读全部分页并清空确认，不自动重提', async () => {
    await flushPromises()
    await prepare()
    mocks.create.mockRejectedValueOnce(new ApiError(409))
    mocks.list
      .mockResolvedValueOnce({ items: [published], next_cursor: 'next' })
      .mockResolvedValueOnce({ items: [{ ...draft, version: 5 }], next_cursor: null })
    await submit()
    expect(mocks.list).toHaveBeenLastCalledWith('next', expect.any(AbortSignal))
    expect(wrapper?.text()).toContain('模拟创建基准：5')
    expect(wrapper?.text()).toContain('不会自动重提')
    expect(wrapper?.find('[aria-label="词库操作确认"]').exists()).toBe(false)
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
  it('分页循环或冲突重读失败时禁止基于不完整列表创建', async () => {
    await flushPromises()
    await prepare()
    mocks.create.mockRejectedValueOnce(new ApiError(409))
    mocks.list.mockResolvedValue({ items: [published], next_cursor: 'same' })
    await submit()
    expect(wrapper?.text()).toContain('重读失败')
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
  it.each([401, 403])('%s清空词条和版本，进入既有会话拒绝流程', async (code) => {
    await flushPromises()
    await prepare()
    mocks.create.mockRejectedValueOnce(new ApiError(code))
    await submit()
    expect(wrapper?.text()).not.toContain('合成新词')
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(useAdminStore().authenticated).toBe(code !== 401)
    expect(useAdminStore().forbidden).toBe(code === 403 ? 1 : 0)
  })
  it('权限收回清空状态，晚到写入不显示回执', async () => {
    await flushPromises()
    const pending = deferred<Wordlist>()
    mocks.create.mockReturnValueOnce(pending.promise)
    await prepare()
    await button('确认提交').trigger('click')
    const session = useAdminStore().session
    if (!session) throw new Error('缺少会话')
    session.account.roles = ['crisis_operator']
    pending.finish(draft)
    await flushPromises()
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(wrapper?.text()).not.toContain('合成草稿已创建')
  })
  it('离开取消请求，旧列表晚到不恢复；列表失败后可刷新为空', async () => {
    await flushPromises()
    mocks.list.mockRejectedValueOnce(new Error('network'))
    await button('刷新词库').trigger('click')
    await flushPromises()
    expect(wrapper?.find('form').exists()).toBe(false)
    mocks.list.mockResolvedValueOnce({ items: [], next_cursor: null })
    await button('刷新词库').trigger('click')
    await flushPromises()
    expect(wrapper?.text()).toContain('暂无词库版本')
    const pending = deferred<{ items: Wordlist[]; next_cursor: null }>()
    mocks.list.mockReturnValueOnce(pending.promise)
    await button('刷新词库').trigger('click')
    const signal: unknown = mocks.list.mock.calls.at(-1)?.[1]
    wrapper?.unmount()
    wrapper = undefined
    pending.finish({ items: [draft], next_cursor: null })
    await flushPromises()
    expect(signal).toBeInstanceOf(AbortSignal)
    if (signal instanceof AbortSignal) expect(signal.aborted).toBe(true)
  })
})
