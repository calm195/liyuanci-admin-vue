import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import ModuleGuideView from './ModuleGuideView.vue'
import { useAdminStore } from '@/stores/admin'
import { readModuleGuide, saveModuleGuide, publishModuleGuide } from '@/services/moduleGuide'
import type { ModuleGuide } from '@/types/moduleGuide'

vi.mock('@/services/moduleGuide', () => ({
  readModuleGuide: vi.fn(),
  saveModuleGuide: vi.fn(),
  publishModuleGuide: vi.fn(),
}))
const modules = [{ module: 'wishes', title: '许愿池', body: '填写心愿并等待应愿。' }]
const initial: ModuleGuide = { version: 2, published_version: 0, modules, published_modules: [] }
let wrapper: VueWrapper
beforeEach(async () => {
  vi.resetAllMocks()
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'synthetic',
    account: {
      id: 'a',
      login_name: '合成管理员',
      roles: ['super_admin'],
      active: true,
      version: 1,
    },
  }
  vi.mocked(readModuleGuide).mockResolvedValue(structuredClone(initial))
  wrapper = mount(ModuleGuideView, { global: { plugins: [pinia] } })
  await flushPromises()
})
afterEach(() => wrapper.unmount())
function button(text: string) {
  const found = wrapper.findAll('button').find((item) => item.text() === text)
  if (!found) throw new Error('按钮不存在')
  return found
}
describe('模块说明配置与发布', () => {
  it('保存草稿后再发布，预览只展示已发布快照', async () => {
    await button('编辑说明').trigger('click')
    await wrapper.get('textarea').setValue('更新后的使用说明')
    expect(button('发布当前草稿').attributes('disabled')).toBeDefined()
    vi.mocked(saveModuleGuide).mockResolvedValue({
      ...initial,
      version: 3,
      modules: [{ ...modules[0], module: 'wishes', title: '许愿池', body: '更新后的使用说明' }],
    })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(saveModuleGuide).toHaveBeenCalledWith(
      'synthetic',
      {
        expected_version: 2,
        modules: [{ module: 'wishes', title: '许愿池', body: '更新后的使用说明' }],
      },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(wrapper.get('[aria-label="已发布说明预览"]').text()).toContain('尚未发布')
    vi.mocked(publishModuleGuide).mockResolvedValue({
      ...initial,
      version: 4,
      published_version: 3,
      published_modules: modules,
    })
    await button('发布当前草稿').trigger('click')
    await flushPromises()
    expect(publishModuleGuide).toHaveBeenCalledWith(
      'synthetic',
      3,
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(wrapper.get('[aria-label="已发布说明预览"]').text()).toContain('填写心愿并等待应愿')
  })
  it('不明确写入沿用同一请求与幂等键，成功核实后解除输入锁', async () => {
    vi.mocked(saveModuleGuide).mockRejectedValue(new Error('合成网络中断'))
    await button('编辑说明').trigger('click')
    await wrapper.get('textarea').setValue('保留输入')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const first = vi.mocked(saveModuleGuide).mock.calls[0]
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
    await button('原样重试').trigger('click')
    await flushPromises()
    expect(vi.mocked(saveModuleGuide).mock.calls[1]?.slice(0, 3)).toEqual(first?.slice(0, 3))
    expect(button('重新读取草稿与发布内容').attributes('disabled')).toBeDefined()
    vi.mocked(saveModuleGuide).mockResolvedValue({ ...initial, version: 3 })
    await button('原样重试').trigger('click')
    await flushPromises()
    expect(wrapper.get('fieldset').attributes('disabled')).toBeUndefined()
  })
  it('换号清除说明草稿与当前会话请求作用域', async () => {
    const requestSignal = vi.mocked(readModuleGuide).mock.calls[0]?.[1]
    useAdminStore().session = null
    await flushPromises()
    expect(wrapper.text()).toContain('无权配置')
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(requestSignal?.aborted).toBe(true)
  })
})

it('默认阅读已发布版本，动态模块卡片切换后编辑仍提交完整快照', async () => {
  const all = [...modules, { module: 'custom_module', title: '动态模块', body: '另一份已发布说明' }]
  vi.mocked(readModuleGuide).mockResolvedValue({
    version: 4,
    published_version: 3,
    modules: all,
    published_modules: all,
  })
  await button('重新读取草稿与发布内容').trigger('click')
  await flushPromises()
  expect(wrapper.find('textarea').exists()).toBe(false)
  const cards = wrapper.findAll('[aria-label="说明模块"] button')
  expect(cards).toHaveLength(2)
  await cards[1]?.trigger('click')
  expect(wrapper.get('[aria-label="已发布说明预览"]').text()).toContain('另一份已发布说明')
  await button('编辑说明').trigger('click')
  await wrapper.findAll('textarea')[0]?.setValue('更新第一模块')
  await wrapper.findAll('[aria-label="说明模块"] button')[1]?.trigger('click')
  await wrapper.findAll('textarea')[1]?.setValue('更新动态模块')
  vi.mocked(saveModuleGuide).mockResolvedValue({
    version: 5,
    published_version: 3,
    modules: all,
    published_modules: all,
  })
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(vi.mocked(saveModuleGuide).mock.lastCall?.[1].modules).toEqual([
    { ...modules[0], body: '更新第一模块' },
    { module: 'custom_module', title: '动态模块', body: '更新动态模块' },
  ])
})
