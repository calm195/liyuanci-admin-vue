import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import type { Router } from 'vue-router'
import { router as applicationRouter } from '@/router'
import AppBreadcrumb from '@/components/AppBreadcrumb.vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import type { Wordlist, WordlistHead, WordlistPage, WordlistDetail } from '@/types/wordlists'
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  publish: vi.fn(),
}))
vi.mock('@/services/content-transport', () => ({ createWordlistTransport: () => mocks }))
const published: Wordlist = {
  id: 'school-old',
  kind: 'school',
  version: 2,
  status: 'published',
  base_effective_id: null,
}
const draft: Wordlist = {
  id: 'school-draft',
  kind: 'school',
  version: 1,
  status: 'draft',
  base_effective_id: 'school-old',
}
const heads: WordlistHead[] = [
  { kind: 'crisis', version: 1, effective_id: null },
  { kind: 'school', version: 7, effective_id: 'school-old' },
  { kind: 'ordinary_violation', version: 1, effective_id: null },
]
let wrapper: VueWrapper | undefined
let router: Router
async function go(path: string) {
  await router.push(path)
  await flushPromises()
}
async function detail(id = draft.id) {
  await go(`/wordlists/${id}`)
}
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
beforeEach(async () => {
  vi.resetAllMocks()
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'synthetic',
    account: {
      login_name: 'synthetic-operator',
      id: 'reviewer',
      version: 1,
      active: true,
      roles: ['review_operator'],
    },
  }
  mocks.list.mockResolvedValue({ items: [published, draft], next_cursor: null, heads })
  mocks.detail.mockImplementation((id: string) =>
    Promise.resolve({ ...(id === published.id ? published : draft), entries: ['合成只读词'] }),
  )
  mocks.create.mockResolvedValue({ ...draft, id: 'new-draft', version: 3 })
  mocks.publish.mockResolvedValue({ ...draft, version: 3, status: 'published' })
  router = createRouter({
    history: createMemoryHistory(),
    routes: applicationRouter.options.routes,
  })
  await router.push('/wordlists/drafts/new')
  await router.isReady()
  wrapper = mount(
    { components: { RouterView, AppBreadcrumb }, template: '<AppBreadcrumb /><RouterView />' },
    { global: { plugins: [pinia, router] } },
  )
  await flushPromises()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})
describe('T017 REQ-015/018/019 词库页面', () => {
  it('列表、草稿和详情使用独立路由，面包屑返回列表且离页丢弃未提交词条', async () => {
    await go('/wordlists')
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(wrapper?.find('[aria-label="词库只读详情"]').exists()).toBe(false)
    await wrapper?.get('a[href="/wordlists/drafts/new"]').trigger('click')
    await vi.waitFor(() => expect(wrapper?.find('form').exists()).toBe(true))
    await wrapper?.get('#wordlist-entries').setValue('未提交词条')
    await wrapper?.get('[aria-label="面包屑导航"] a[href="/wordlists"]').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/wordlists'))
    await flushPromises()
    await wrapper?.get(`a[href="/wordlists/${draft.id}"]`).trigger('click')
    await vi.waitFor(() => expect(wrapper?.find('[aria-label="词库只读详情"]').exists()).toBe(true))
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(wrapper?.text()).not.toContain('未提交词条')
    expect(wrapper?.get('[aria-current="page"]').text()).toContain('词单详情')
    await go('/wordlists/drafts/new')
    expect(wrapper?.get('#wordlist-entries').element).toHaveProperty('value', '')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })
  it('详情直达读取完整快照，响应标识不匹配时不展示或允许发布', async () => {
    mocks.detail.mockResolvedValueOnce({ ...draft, id: 'wrong-id', entries: ['不匹配词条'] })
    await detail()
    expect(wrapper?.find('[aria-label="词库只读详情"]').exists()).toBe(false)
    expect(wrapper?.text()).not.toContain('不匹配词条')
    expect(wrapper?.findAll('button').some((item) => item.text().startsWith('发布 '))).toBe(false)
    await button('刷新词库').trigger('click')
    await flushPromises()
    expect(wrapper?.text()).toContain('合成只读词')
  })
  it('明确契约边界，创建使用heads而非列表资源最高版本', async () => {
    await flushPromises()
    expect(wrapper?.text()).toContain('不自动全量重扫历史')
    expect(wrapper?.text()).toContain('分类创建基准：7')
    await prepare()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(wrapper?.text()).toContain('完整词条 2 条')
    await submit()
    expect(mocks.create).toHaveBeenCalledWith(
      { kind: 'school', entries: ['合成新词', '第二条'], expected_version: 7 },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(wrapper?.get('a[href="/wordlists/new-draft"]').text()).toContain('查看新草稿')
    expect(wrapper?.text()).toContain('尚未发布')
  })
  it('新分类也提交heads基准，空词条按契约允许，返回修改不写入', async () => {
    await flushPromises()
    await wrapper?.get('#wordlist-kind').setValue('crisis')
    await wrapper?.get('form').trigger('submit')
    await button('返回修改').trigger('click')
    expect(mocks.create).not.toHaveBeenCalled()
    await wrapper?.get('form').trigger('submit')
    await submit()
    expect(mocks.create.mock.calls[0]?.[0]).toEqual({
      kind: 'crisis',
      entries: [],
      expected_version: 1,
    })
  })
  it('发布单独确认精确资源与head版本，归档只读', async () => {
    await flushPromises()
    await detail()
    await button('发布 school-draft').trigger('click')
    expect(mocks.publish).not.toHaveBeenCalled()
    await submit()
    expect(mocks.publish).toHaveBeenCalledWith(
      'school-draft',
      { expected_version: 1, expected_head_version: 7 },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(wrapper?.text()).toContain('已有审核任务继续使用原词库快照')
    await go('/wordlists')
    mocks.list.mockResolvedValue({
      items: [{ ...draft, status: 'archived' }],
      next_cursor: null,
      heads,
    })
    await button('刷新词库').trigger('click')
    await flushPromises()
    expect(wrapper?.text()).toContain('已归档')
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
      .mockResolvedValueOnce({
        items: [published],
        next_cursor: 'next',
        heads: heads.map((head) => (head.kind === 'school' ? { ...head, version: 9 } : head)),
      })
      .mockResolvedValueOnce({
        items: [{ ...draft, version: 5 }],
        next_cursor: null,
        heads: heads.map((head) => (head.kind === 'school' ? { ...head, version: 9 } : head)),
      })
    await submit()
    expect(mocks.list).toHaveBeenLastCalledWith('next', expect.any(AbortSignal))
    expect(wrapper?.text()).toContain('分类创建基准：9')
    expect(wrapper?.text()).toContain('不会自动重提')
    expect(wrapper?.find('[aria-label="词库操作确认"]').exists()).toBe(false)
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
  it('分页循环或冲突重读失败时禁止基于不完整列表创建', async () => {
    await flushPromises()
    await prepare()
    mocks.create.mockRejectedValueOnce(new ApiError(409))
    mocks.list.mockResolvedValue({ items: [published], next_cursor: 'same', heads })
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
  it('分页heads变化时失败关闭，不混合不同基准创建', async () => {
    await go('/wordlists')
    mocks.list
      .mockResolvedValueOnce({ items: [published], next_cursor: 'next', heads })
      .mockResolvedValueOnce({
        items: [draft],
        next_cursor: null,
        heads: heads.map((head) => ({ ...head, version: head.version + 1 })),
      })
    await button('刷新词库').trigger('click')
    await flushPromises()
    expect(wrapper?.find('form').exists()).toBe(false)
    expect(wrapper?.find('[aria-label="词库基准"]').exists()).toBe(false)
  })
  it('旧生效基准草稿不可发布；发布409后清空确认并显示新生效指针', async () => {
    await flushPromises()
    await detail()
    await button('发布 school-draft').trigger('click')
    expect(wrapper?.text()).toContain('草稿资源版本 1')
    expect(wrapper?.text()).toContain('分类基准 7')
    mocks.publish.mockRejectedValueOnce(new ApiError(409))
    mocks.list.mockResolvedValue({
      items: [draft],
      next_cursor: null,
      heads: heads.map((head) =>
        head.kind === 'school' ? { ...head, version: 8, effective_id: 'new-effective' } : head,
      ),
    })
    await submit()
    expect(wrapper?.text()).toContain('new-effective')
    expect(wrapper?.text()).toContain('创建基准已被替代')
    expect(wrapper?.find('[aria-label="词库操作确认"]').exists()).toBe(false)
    expect(wrapper?.findAll('button').some((item) => item.text().startsWith('发布 '))).toBe(false)
    expect(mocks.publish).toHaveBeenCalledTimes(1)
  })
  it('归档完整快照授权只读，切换/关闭详情拒绝旧响应，权限撤销清空词条', async () => {
    await flushPromises()
    const old = deferred<WordlistDetail>()
    mocks.detail.mockReturnValueOnce(old.promise)
    await detail(published.id)
    await detail(draft.id)
    await flushPromises()
    old.finish({ ...published, status: 'archived', entries: ['旧详情晚到词'] })
    await flushPromises()
    expect(wrapper?.get('[aria-label="词库只读详情"]').text()).toContain('合成只读词')
    expect(wrapper?.text()).not.toContain('旧详情晚到词')
    await go('/wordlists')
    expect(wrapper?.find('[aria-label="词库只读详情"]').exists()).toBe(false)
    mocks.detail.mockResolvedValueOnce({
      ...published,
      status: 'archived',
      entries: ['归档快照词'],
    })
    await detail(published.id)
    await flushPromises()
    expect(wrapper?.get('[aria-label="词库只读详情"]').text()).toContain('已归档')
    expect(wrapper?.get('[aria-label="词库只读详情"]').find('textarea').exists()).toBe(false)
    const session = useAdminStore().session
    if (!session) throw new Error('缺少会话')
    session.account.roles = ['crisis_operator']
    await flushPromises()
    expect(wrapper?.text()).not.toContain('归档快照词')
  })
  it('离开时取消详情请求，晚到的归档词条和错误不恢复', async () => {
    await flushPromises()
    const pending = deferred<WordlistDetail>()
    mocks.detail.mockReturnValueOnce(pending.promise)
    await detail(published.id)
    const signal: unknown = mocks.detail.mock.calls[0]?.[1]
    wrapper?.unmount()
    wrapper = undefined
    pending.finish({ ...published, status: 'archived', entries: ['离开后晚到'] })
    await flushPromises()
    if (!(signal instanceof AbortSignal)) throw new Error('缺少取消信号')
    expect(signal.aborted).toBe(true)
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
    expect(wrapper?.text()).not.toContain('草稿已创建')
  })
  it('离开取消请求，旧列表晚到不恢复；列表失败后可刷新为空', async () => {
    await go('/wordlists')
    mocks.list.mockRejectedValueOnce(new Error('network'))
    await button('刷新词库').trigger('click')
    await flushPromises()
    expect(wrapper?.find('form').exists()).toBe(false)
    mocks.list.mockResolvedValueOnce({ items: [], next_cursor: null, heads })
    await button('刷新词库').trigger('click')
    await flushPromises()
    expect(wrapper?.text()).toContain('暂无词库版本')
    const pending = deferred<WordlistPage>()
    mocks.list.mockReturnValueOnce(pending.promise)
    await button('刷新词库').trigger('click')
    const signal: unknown = mocks.list.mock.calls.at(-1)?.[1]
    wrapper?.unmount()
    wrapper = undefined
    pending.finish({ items: [draft], next_cursor: null, heads })
    await flushPromises()
    expect(signal).toBeInstanceOf(AbortSignal)
    if (signal instanceof AbortSignal) expect(signal.aborted).toBe(true)
  })
})
