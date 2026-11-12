import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAdminStore } from '@/stores/admin'
import ContentImages from './ContentImages.vue'

describe('受控内容图片', () => {
  afterEach(() => vi.unstubAllGlobals())
  function setup() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const admin = useAdminStore()
    admin.session = {
      token: 'test-admin',
      account: {
        id: 'admin',
        login_name: '审核员',
        version: 1,
        roles: ['review_operator'],
        active: true,
      },
    }
    return { pinia, admin }
  }
  it('携带当前会话读取私有图片，退出后立即清除预览', async () => {
    const { pinia, admin } = setup()
    const fetcher = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    vi.stubGlobal('fetch', fetcher)
    const create = vi.fn().mockReturnValue('blob:test-preview')
    const revoke = vi.fn()
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }),
    )
    const wrapper = mount(ContentImages, {
      props: {
        images: [
          {
            id: 'image',
            url: '/api/v1/admin/wish-images/image?case_id=case',
            position: 0,
            scan_state: 'approved',
          },
        ],
      },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/admin/wish-images/image?case_id=case',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-admin' } }),
    )
    expect(wrapper.find('img').attributes('src')).toBe('blob:test-preview')
    admin.clear()
    await flushPromises()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(revoke).toHaveBeenCalledWith('blob:test-preview')
    wrapper.unmount()
  })
  it('没有图片读取权限时触发统一撤权并清除预览', async () => {
    const { pinia, admin } = setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    const wrapper = mount(ContentImages, {
      props: {
        images: [
          {
            id: 'image',
            url: '/api/v1/admin/wish-images/image',
            position: 0,
            scan_state: 'approved',
          },
        ],
      },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(admin.forbidden).toBe(1)
    wrapper.unmount()
  })
  it('第二张图片撤权时清除第一张预览并退出失效会话', async () => {
    const { pinia, admin } = setup()
    const fetcher = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([137, 80]), { headers: { 'Content-Type': 'image/png' } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetcher)
    const revoke = vi.fn()
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL: vi.fn().mockReturnValue('blob:review-preview'),
        revokeObjectURL: revoke,
      }),
    )
    const wrapper = mount(ContentImages, {
      props: {
        images: [0, 1].map((position) => ({
          id: String(position),
          url: '/api/v1/admin/wish-images/' + position,
          position,
          scan_state: 'approved',
        })),
      },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    expect(admin.session).toBeNull()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(revoke).toHaveBeenCalledWith('blob:review-preview')
    wrapper.unmount()
  })
  it('图片来源转为不可见时清除同组预览并保留重试说明', async () => {
    const { pinia, admin } = setup()
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(
          new Response(new Uint8Array([137, 80]), { headers: { 'Content-Type': 'image/png' } }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 404 })),
    )
    const revoke = vi.fn()
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL: vi.fn().mockReturnValue('blob:gone-preview'),
        revokeObjectURL: revoke,
      }),
    )
    const wrapper = mount(ContentImages, {
      props: {
        images: [0, 1].map((position) => ({
          id: String(position),
          url: '/api/v1/admin/wish-images/' + position,
          position,
          scan_state: 'approved',
        })),
      },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(revoke).toHaveBeenCalledWith('blob:gone-preview')
    expect(wrapper.get('[role="alert"]').text()).toContain('图片读取失败')
    expect(admin.session?.token).toBe('test-admin')
    wrapper.unmount()
  })
})
