import { confirmDiscardChanges } from '@/components/confirmDiscardChanges'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MatchmakingTraitsView from './MatchmakingTraitsView.vue'
import { useAdminStore } from '@/stores/admin'
vi.mock('@/components/confirmDiscardChanges', () => ({ confirmDiscardChanges: vi.fn() }))
const id = 'aa110000-0000-4000-8000-000000000001'
const item = {
  id,
  name: '温柔',
  heat: 9,
  status: 'pending',
  version: 2,
  male_count: 4,
  female_count: 5,
  undisclosed_count: 0,
  created_at: '2026-11-11T00:00:00Z',
  reason: '',
}
let wrapper: VueWrapper, router: Router
function requestURL(value: RequestInfo | URL | undefined) {
  if (typeof value !== 'string') throw new Error('测试仅接受字符串路径')
  return value
}
const transport = vi.fn<typeof fetch>()
const response = (data: unknown) => Promise.resolve(new Response(JSON.stringify({ code: 0, data })))
beforeEach(async () => {
  vi.resetAllMocks()
  vi.mocked(confirmDiscardChanges).mockResolvedValue(true)
  vi.stubGlobal('fetch', transport)
  transport.mockImplementation((input, init) => {
    if (init?.method === 'POST') return response({ id })
    if (requestURL(input).endsWith(`/${id}`))
      return response({
        ...item,
        evidence: {
          matches: [
            {
              word: '温柔',
              source: 'custom',
              kind: 'ordinary',
              disposition: 'review',
              start: 0,
              end: 2,
            },
          ],
          routes: ['ordinary'],
        },
      })
    return response({ items: [item], total: 1 })
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'synthetic',
    account: {
      id: 'synthetic',
      login_name: '合成管理员',
      version: 1,
      roles: ['review_operator'],
      active: true,
    },
  }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/matchmaking/traits', component: MatchmakingTraitsView },
      { path: '/other', component: { template: '<p>其他页面</p>' } },
    ],
  })
  await router.push('/matchmaking/traits')
  await router.isReady()
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
})
afterEach(() => {
  wrapper.unmount()
  vi.unstubAllGlobals()
})
function button(label: string) {
  const found = wrapper.findAll('button').find((b) => b.text() === label)
  if (!found) throw new Error(label)
  return found
}
function writes() {
  return transport.mock.calls.filter((call) => call[1]?.method === 'POST')
}
describe('特质管理', () => {
  it('新增在抽屉中填写分类与理由，结果未知时关闭抽屉仍能原样重试', async () => {
    await button('新增词条').trigger('click')
    await wrapper.get('#trait-editor input').setValue('摄影')
    await wrapper.get('#trait-editor select').setValue('interest')
    await wrapper.get('#trait-editor textarea').setValue('补充兴趣分类')
    transport.mockRejectedValueOnce(new TypeError('网络中断'))
    await wrapper.get('#trait-editor').trigger('submit')
    await flushPromises()
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.[1]?.body).toBe(
      JSON.stringify({ name: '摄影', category: 'interest', reason: '补充兴趣分类' }),
    )
    expect(wrapper.text()).toContain('原样重试')
    await button('关闭详情').trigger('click')
    await flushPromises()
    expect(wrapper.find('#trait-editor').exists()).toBe(false)
    await button('原样重试').trigger('click')
    await flushPromises()
    expect(writes()).toHaveLength(2)
    expect(writes()[1]?.[1]?.headers).toEqual(writes()[0]?.[1]?.headers)
    expect(writes()[1]?.[1]?.body).toBe(writes()[0]?.[1]?.body)
  })
  it('待审词条可以独立归类停用，不触发审核决定', async () => {
    await button('查看与审核').trigger('click')
    await flushPromises()
    await button('维护词条').trigger('click')
    await wrapper.get('#trait-editor select').setValue('lifestyle')
    await wrapper.get('#trait-editor input[type=checkbox]').setValue(false)
    await wrapper.get('#trait-editor textarea').setValue('待审核时更正分类并暂停新选用')
    await wrapper.get('#trait-editor').trigger('submit')
    await flushPromises()
    const updates = transport.mock.calls.filter((call) => call[1]?.method === 'PUT')
    expect(updates).toHaveLength(1)
    expect(requestURL(updates[0]?.[0])).toBe(`/api/v1/admin/matchmaking/traits/${id}`)
    expect(updates[0]?.[1]?.body).toBe(
      JSON.stringify({
        expected_version: 2,
        category: 'lifestyle',
        enabled: false,
        reason: '待审核时更正分类并暂停新选用',
      }),
    )
    expect(writes()).toHaveLength(0)
    expect(wrapper.text()).toContain('待审核')
  })
  it('查询将性别和热度同时应用到列表与词云', async () => {
    await wrapper.get('select[name=gender]').setValue('female')
    await wrapper.get('input[name=min_heat]').setValue('3')
    await wrapper.get('select[name=purpose]').setValue('personal')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const requests = transport.mock.calls.slice(-2).map((call) => requestURL(call[0]))
    expect(
      requests.every(
        (url) =>
          url.includes('gender=female') &&
          url.includes('min_heat=3') &&
          url.includes('purpose=personal'),
      ),
    ).toBe(true)
    expect(requests.some((url) => url.includes('/cloud?') && !url.includes('page='))).toBe(true)
    await button('热度词云').trigger('click')
    expect(wrapper.get('.trait-word-cloud').text()).toContain('温柔')
  })
  it('驳回必填原因，未知结果离页后保留原请求重试', async () => {
    await button('查看与审核').trigger('click')
    await flushPromises()
    await button('驳回词条').trigger('click')
    await flushPromises()
    expect(writes()).toHaveLength(0)
    await wrapper.get('textarea').setValue('不符合规则')
    transport.mockRejectedValueOnce(new TypeError('network'))
    await button('驳回词条').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('尚未确认')
    await router.push('/other')
    await flushPromises()
    await router.push('/matchmaking/traits')
    await flushPromises()
    await button('原样重试').trigger('click')
    await flushPromises()
    expect(writes()).toHaveLength(2)
    expect(writes()[0]?.[1]?.body).toBe(writes()[1]?.[1]?.body)
    expect(writes()[0]?.[1]?.headers).toEqual(writes()[1]?.[1]?.headers)
    expect(wrapper.text()).not.toContain('原样重试')
  })
  it('版本冲突关闭旧详情，必须重新读取后审核', async () => {
    await button('查看与审核').trigger('click')
    await flushPromises()
    transport.mockResolvedValueOnce(
      new Response(JSON.stringify({ error_code: 'VERSION_CONFLICT' }), { status: 409 }),
    )
    await button('通过审核').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('数据版本已变化')
    expect(wrapper.find('textarea').exists()).toBe(false)
  })
})
