import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ResourcesView from './ResourcesView.vue'
import ResourceCategoriesView from './ResourceCategoriesView.vue'
import { useAdminStore } from '@/stores/admin'
import { ResourceApiError } from '@/services/resources'
import type * as ResourceModule from '@/services/resources'
import type {
  AdminResourceCategory,
  ResourceDetail,
  ResourcesClient,
  ResourceSummary,
} from '@/types/resources'
const mocks = vi.hoisted(() => ({
  list: vi.fn<ResourcesClient['list']>(),
  detail: vi.fn<ResourcesClient['detail']>(),
  create: vi.fn<ResourcesClient['create']>(),
  update: vi.fn<ResourcesClient['update']>(),
  publish: vi.fn<ResourcesClient['publish']>(),
  offline: vi.fn<ResourcesClient['offline']>(),
  categories: vi.fn<ResourcesClient['categories']>(),
  category: vi.fn<ResourcesClient['category']>(),
  createCategory: vi.fn<ResourcesClient['createCategory']>(),
  updateCategory: vi.fn<ResourcesClient['updateCategory']>(),
}))
vi.mock('@/services/resources', async (original) => ({
  ...(await original<typeof ResourceModule>()),
  createResourcesClient: () => mocks,
}))
const id = 'ac230000-0000-4000-8000-000000000001',
  categoryId = 'ac230000-0000-4000-8000-000000000002'
const category: AdminResourceCategory = {
  id: categoryId,
  name: '学习资料',
  sort_order: 0,
  enabled: true,
  version: 1,
  created_at: '2026-10-29T00:00:00Z',
  updated_at: '2026-10-29T00:00:00Z',
}
const detail: ResourceDetail = {
  id,
  title: '合成资料',
  category: { id: categoryId, name: category.name },
  version: 2,
  content_version: 1,
  status: 'published',
  created_at: category.created_at,
  updated_at: category.updated_at,
  published_at: category.created_at,
  visibility_blocked: false,
  description: '简介',
  download_url: 'https://example.test/file',
  extraction_code: 'aB12',
  allowed_actions: ['offline'],
  feedback_summary: {
    content_version: 1,
    valid: 2,
    link_invalid: 1,
    outdated: 0,
    incomplete: 0,
    total: 3,
  },
}
const summary: ResourceSummary = {
  id,
  title: detail.title,
  category: detail.category,
  version: 2,
  content_version: 1,
  status: 'published',
  created_at: category.created_at,
  updated_at: category.updated_at,
  published_at: category.created_at,
  visibility_blocked: false,
  description_excerpt: '简介',
  allowed_actions: ['offline'],
  feedback_summary: detail.feedback_summary,
}
const offline: ResourceDetail = {
  ...detail,
  status: 'offline',
  version: 3,
  allowed_actions: ['update', 'publish'],
}
let wrapper: VueWrapper
function button(label: string) {
  const found = wrapper.findAll('button').find((item) => item.text() === label)
  if (!found) throw new Error(`缺少按钮 ${label}`)
  return found
}
function deferred<T>() {
  let finish: (value: T) => void = () => {
    throw new Error('未初始化')
  }
  const promise = new Promise<T>((resolve) => {
    finish = resolve
  })
  return { promise, finish }
}
async function start(
  kind = 'resource',
  roles: ('review_operator' | 'crisis_operator' | 'super_admin')[] = ['review_operator'],
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'synthetic',
    account: { id: 'operator', login_name: '操作员', version: 1, active: true, roles },
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: kind === 'resource' ? ResourcesView : ResourceCategoriesView },
    ],
  })
  await router.push('/')
  wrapper = mount(kind === 'resource' ? ResourcesView : ResourceCategoriesView, {
    global: {
      plugins: [pinia, router],
      stubs: {
        ElDrawer: {
          props: ['modelValue'],
          template: '<section v-if="modelValue"><slot /></section>',
        },
      },
    },
  })
  await flushPromises()
}
async function open() {
  await button('查看详情').trigger('click')
  await flushPromises()
}
async function down() {
  await button('下架后编辑').trigger('click')
  await wrapper.get('textarea').setValue('更新链接')
  await wrapper.get('.resource-form').trigger('submit')
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  mocks.list.mockResolvedValue({ items: [summary], next_cursor: null })
  mocks.detail.mockResolvedValue(detail)
  mocks.categories.mockResolvedValue({ items: [category], next_cursor: null })
  mocks.category.mockResolvedValue(category)
  mocks.offline.mockResolvedValue(offline)
  mocks.create.mockResolvedValue(offline)
  mocks.update.mockResolvedValue({ ...offline, version: 4, content_version: 2 })
  mocks.publish.mockResolvedValue({ ...detail, version: 4 })
  mocks.createCategory.mockResolvedValue(category)
  mocks.updateCategory.mockResolvedValue(category)
})
afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
})
describe('资料管理页面行为', () => {
  it('创建结果未知后同键重放遇privacy404清除表单，不恢复旧链接', async () => {
    await start()
    await button('新建资料').trigger('click')
    const inputs = wrapper.findAll('.resource-form input')
    await inputs[0]?.setValue('待确认资料')
    await wrapper.get('.resource-form select').setValue(categoryId)
    await inputs[1]?.setValue('https://example.test/hidden')
    mocks.create
      .mockRejectedValueOnce(new TypeError('network'))
      .mockRejectedValueOnce(new ResourceApiError(404, 'NOT_FOUND'))
    await wrapper.get('.resource-form').trigger('submit')
    await flushPromises()
    const first = mocks.create.mock.calls[0]
    await button('原样重试').trigger('click')
    await flushPromises()
    expect(mocks.create.mock.calls[1]?.slice(0, 2)).toEqual(first?.slice(0, 2))
    expect(wrapper.find('.resource-form').exists()).toBe(false)
    expect(wrapper.text()).toContain('已不可访问')
    expect(wrapper.text()).not.toContain('https://example.test/hidden')
  })

  it('仅crisis角色不发送请求，明确无权状态', async () => {
    await start('resource', ['crisis_operator'])
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.categories).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('无权管理资料')
  })
  it('已上架资料必须确认下架后才进入编辑，取消不恢复上架', async () => {
    await start()
    await open()
    expect(wrapper.text()).not.toContain('确认保存')
    mocks.detail.mockResolvedValue(offline)
    await down()
    expect(mocks.offline).toHaveBeenCalledWith(
      id,
      2,
      '更新链接',
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(wrapper.text()).toContain('确认保存')
    await button('关闭').trigger('click')
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('结果未知锁定表单且原样重试使用同输入和同幂等键', async () => {
    await start()
    await open()
    mocks.offline.mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(offline)
    mocks.detail.mockResolvedValue(offline)
    await down()
    expect(wrapper.text()).toContain('原样重试')
    const first = mocks.offline.mock.calls[0]
    await button('原样重试').trigger('click')
    await flushPromises()
    expect(mocks.offline.mock.calls[1]?.slice(0, 4)).toEqual(first?.slice(0, 4))
    expect(wrapper.text()).toContain('确认保存')
  })
  it('下架成功但重读很慢时禁止关闭或切换详情，旧回调不能编辑新目标', async () => {
    await start()
    await open()
    const wait = deferred<ResourceDetail>()
    mocks.detail.mockReturnValueOnce(wait.promise)
    await down()
    expect(button('关闭').attributes('disabled')).toBeDefined()
    expect(button('查看详情').attributes('disabled')).toBeDefined()
    await button('关闭').trigger('click')
    expect(wrapper.text()).toContain('正在读取详情')
    wait.finish(offline)
    await flushPromises()
    expect(wrapper.text()).toContain('确认保存')
    expect(mocks.detail).toHaveBeenCalledTimes(2)
  })
  it('版本冲突保留输入但阻止自动覆盖，重新读取已上架状态仍不能保存', async () => {
    mocks.detail.mockResolvedValue(offline)
    await start()
    await open()
    await button('编辑').trigger('click')
    await wrapper.get('.resource-form input').setValue('保留本地标题')
    mocks.update.mockRejectedValueOnce(new ResourceApiError(409, 'VERSION_CONFLICT'))
    await wrapper.get('.resource-form').trigger('submit')
    await flushPromises()
    expect(button('确认保存').attributes('disabled')).toBeDefined()
    expect(wrapper.get<HTMLInputElement>('.resource-form input').element.value).toBe('保留本地标题')
    mocks.detail.mockResolvedValue(detail)
    await button('重新读取并核对').trigger('click')
    await flushPromises()
    expect(button('确认保存').attributes('disabled')).toBeDefined()
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })
  it('privacy404清除正文与表单，不把失败伪装成空列表', async () => {
    mocks.detail.mockResolvedValue(offline)
    await start()
    await open()
    await button('编辑').trigger('click')
    mocks.detail.mockRejectedValueOnce(new ResourceApiError(404, 'NOT_FOUND'))
    await button('重新读取并核对').trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('https://example.test')
    expect(wrapper.find('.resource-form').exists()).toBe(false)
    expect(wrapper.text()).toContain('已不可访问')
  })
  it('会话切换清空资料、表单和晚到响应', async () => {
    await start()
    const wait = deferred<ResourceDetail>()
    mocks.detail.mockReturnValueOnce(wait.promise)
    await open()
    useAdminStore().clear()
    wait.finish(detail)
    await flushPromises()
    expect(wrapper.text()).not.toContain(detail.title)
    expect(wrapper.text()).not.toContain(detail.download_url)
    expect(wrapper.text()).toContain('无权管理资料')
  })
  it('创建回执返回当前已发布对象时不强制标记为草稿，刷新失败不再重复创建', async () => {
    await start()
    await button('新建资料').trigger('click')
    const inputs = wrapper.findAll('.resource-form input')
    await inputs[0]?.setValue('新资料')
    await wrapper.get('.resource-form select').setValue(categoryId)
    await inputs[1]?.setValue('https://example.test/file')
    mocks.create.mockResolvedValue(detail)
    mocks.detail.mockRejectedValueOnce(new ResourceApiError(503, 'DEPENDENCY_UNAVAILABLE'))
    await wrapper.get('.resource-form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('操作已成功，刷新失败')
    expect(wrapper.text()).not.toContain('保存草稿')
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
  it('完整读取分类目录，筛选修改后禁止沿用旧游标', async () => {
    mocks.categories
      .mockResolvedValueOnce({ items: [category], next_cursor: 'next-categories' })
      .mockResolvedValueOnce({
        items: [{ ...category, id: 'ac230000-0000-4000-8000-000000000003', name: '更多分类' }],
        next_cursor: null,
      })
    mocks.list.mockResolvedValue({ items: [summary], next_cursor: 'next-resources' })
    await start()
    expect(mocks.categories).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('更多分类')
    await wrapper.get('input').setValue('新词')
    expect(button('下一页').attributes('disabled')).toBeDefined()
  })
  it('分类占用保留表单，重名与占用不自动重发', async () => {
    await start('category')
    await button('编辑分类').trigger('click')
    await flushPromises()
    await wrapper.get('input[type=checkbox]').setValue(false)
    mocks.updateCategory.mockRejectedValueOnce(new ResourceApiError(409, 'CATEGORY_IN_USE'))
    await wrapper.findAll('form')[1]?.trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('分类仍被资料引用')
    expect(wrapper.get<HTMLInputElement>('input[type=checkbox]').element.checked).toBe(false)
    expect(mocks.updateCategory).toHaveBeenCalledTimes(1)
  })
})
