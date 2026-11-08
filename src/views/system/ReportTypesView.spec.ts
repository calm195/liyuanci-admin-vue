import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAdminStore } from '@/stores/admin'
import { readReportTypes, saveReportType } from '@/services/report-types'
import type * as ReportService from '@/services/report-types'
import ReportTypesView from './ReportTypesView.vue'
vi.mock('@/services/report-types', async (original) => ({
  ...(await original<typeof ReportService>()),
  readReportTypes: vi.fn(),
  saveReportType: vi.fn(),
}))
const snapshot = { version: 3, items: [{ code: 'spam', label: '广告', published: true }] }
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
  vi.mocked(readReportTypes).mockResolvedValue(structuredClone(snapshot))
  wrapper = mount(ReportTypesView, {
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
describe('举报类型运营', () => {
  it('新增默认不发布，不允许使用已有代码覆盖原类型', async () => {
    await flushPromises()
    await button('新增类型').trigger('click')
    const inputs = wrapper.findAll('form input')
    await inputs[0]?.setValue('spam')
    await inputs[1]?.setValue('新名称')
    expect(inputs[2]?.element).toHaveProperty('checked', false)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(saveReportType).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('该代码已存在')
  })
  it('举报类型代码最多32位，允许维护大写和连字符的历史格式', async () => {
    await flushPromises()
    await button('新增类型').trigger('click')
    const inputs = wrapper.findAll('form input')
    await inputs[0]?.setValue('A'.repeat(33))
    await inputs[1]?.setValue('合成举报类型')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(saveReportType).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('1至32位')
    const code = `A-${'x'.repeat(30)}`
    await inputs[0]?.setValue(code)
    vi.mocked(saveReportType).mockResolvedValue({
      version: 4,
      items: [{ code, label: '合成举报类型', published: false }],
    })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(vi.mocked(saveReportType).mock.calls[0]?.[1].code).toBe(code)
  })
  it('已有类型代码不可修改，停用沿用版本并且未知结果原样重试', async () => {
    await flushPromises()
    await button('编辑').trigger('click')
    expect(wrapper.findAll('form input')[0]?.attributes('disabled')).toBeDefined()
    await wrapper.get('form input[type="checkbox"]').setValue(false)
    vi.mocked(saveReportType)
      .mockRejectedValueOnce(new Error('断网'))
      .mockResolvedValueOnce({ version: 4, items: [{ ...snapshot.items[0]!, published: false }] })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('保存结果尚未确认')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(vi.mocked(saveReportType).mock.calls[1]?.slice(0, 4)).toEqual(
      vi.mocked(saveReportType).mock.calls[0]?.slice(0, 4),
    )
    expect(wrapper.text()).toContain('未发布')
  })
})
