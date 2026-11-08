import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAdminStore } from '@/stores/admin'
import { useDictionariesStore } from '@/stores/dictionaries'
import { ApiError } from '@/services/admin'
import { readAdminDictionaries, saveDictionary } from '@/services/dictionaries'
import type * as DictionaryService from '@/services/dictionaries'
import DictionariesView from './DictionariesView.vue'
vi.mock('@/services/dictionaries', async (original) => ({
  ...(await original<typeof DictionaryService>()),
  readAdminDictionaries: vi.fn(),
  saveDictionary: vi.fn(),
}))
const snapshot = {
  version: 3,
  items: [
    { type: 'resource_feedback', code: 'valid', label: '有用', enabled: true, sort_order: 0 },
  ],
}
let wrapper: VueWrapper
beforeEach(() => {
  vi.resetAllMocks()
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'synthetic',
    account: {
      id: 'op',
      login_name: '测试管理员',
      active: true,
      version: 1,
      roles: ['super_admin'],
    },
  }
  vi.mocked(readAdminDictionaries).mockResolvedValue(structuredClone(snapshot))
  wrapper = mount(DictionariesView, {
    global: {
      plugins: [pinia],
      stubs: { RouterLink: true, NoticePortal: { template: '<div><slot /></div>' } },
    },
  })
})
afterEach(() => wrapper.unmount())
function button(text: string) {
  const value = wrapper.findAll('button').find((item) => item.text() === text)
  if (!value) throw new Error(`找不到按钮 ${text}`)
  return value
}
describe('展示字典管理', () => {
  it('不确定提交冻结输入，原样重试保留同一版本、请求体与幂等键', async () => {
    await flushPromises()
    await button('编辑').trigger('click')
    await wrapper.get('form input').setValue('确有帮助')
    vi.mocked(saveDictionary)
      .mockRejectedValueOnce(new Error('网络断开'))
      .mockResolvedValueOnce({ version: 4, items: [{ ...snapshot.items[0]!, label: '确有帮助' }] })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('form input').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('保存结果尚未确认')
    await button('原样重试').trigger('submit')
    await flushPromises()
    expect(vi.mocked(saveDictionary).mock.calls[1]?.slice(0, 4)).toEqual(
      vi.mocked(saveDictionary).mock.calls[0]?.slice(0, 4),
    )
    expect(useDictionariesStore().label('resource_feedback', 'valid')).toBe('确有帮助')
  })
  it('冲突后不报告成功，刷新核对后才能使用新版本继续编辑', async () => {
    await flushPromises()
    await button('编辑').trigger('click')
    vi.mocked(saveDictionary).mockRejectedValue(new ApiError(409))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('版本或状态已变化')
    expect(wrapper.text()).not.toContain('字典已保存')
    vi.mocked(readAdminDictionaries).mockResolvedValue({ ...snapshot, version: 4 })
    await button('刷新字典').trigger('click')
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(useDictionariesStore().snapshot.version).toBe(4)
  })
})
