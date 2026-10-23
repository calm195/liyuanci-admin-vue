import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import IdentityView from './IdentityView.vue'
import { useAdminStore } from '@/stores/admin'
afterEach(() => {
  vi.unstubAllGlobals()
})
it('T012 默认真实身份审核进入页面即读取后台队列，按需读取详情', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      code: 0,
      message: '合成',
      request_id: 'trace',
      data: {
        items: [{ id: 'case', status: 'pending', version: 3 }],
        next_cursor: null,
      },
    }),
  )
  vi.stubGlobal('fetch', transport)
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'admin-token',
    account: {
      id: 'admin',
      login_name: '合成运营',
      roles: ['review_operator'],
      active: true,
      version: 1,
    },
  }
  const wrapper = mount(IdentityView, { global: { plugins: [pinia] } })
  await flushPromises()
  expect(transport.mock.calls[0]?.[0]).toBe('/api/v1/admin/identity-reviews?limit=20')
  expect(wrapper.text()).not.toContain('待接口验收后开放')
  transport.mockResolvedValue(
    Response.json({
      code: 0,
      message: '合成',
      request_id: 'trace',
      data: {
        id: 'case',
        status: 'pending',
        version: 3,
        name: '合成姓名',
        student_number: '合成学号',
        asset_id: 'asset',
      },
    }),
  )
  await wrapper.get('.case-list button').trigger('click')
  await flushPromises()
  expect(transport.mock.calls[1]?.[0]).toBe('/api/v1/admin/identity-reviews/case')
  expect(new Headers(transport.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe(
    'Bearer admin-token',
  )
  expect(wrapper.text()).toContain('合成姓名')
  wrapper.unmount()
})
