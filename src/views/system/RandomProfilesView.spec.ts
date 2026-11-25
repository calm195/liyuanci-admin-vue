import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAdminStore } from '@/stores/admin'
import * as service from '@/services/random-profiles'
import RandomProfilesView from './RandomProfilesView.vue'

vi.mock('@/services/random-profiles', async (original) => ({
  ...(await original<typeof service>()),
  readRandomProfiles: vi.fn(),
  submitRandomProfile: vi.fn(),
  drawRandomProfile: vi.fn(),
}))

const common = { updated_at: '2026-11-25T00:00:00Z', version: 1, enabled: true }
const firstAvatar = {
  ...common,
  id: 'a1',
  name: '锦鲤',
  image_path: '/api/v1/random-profiles/images/first',
}
const secondAvatar = {
  ...common,
  id: 'a2',
  name: '荷叶',
  image_path: '/api/v1/random-profiles/images/second',
  enabled: false,
}
const firstAdjective = { ...common, id: 'w1', text: '温柔' }
const firstNoun = { ...common, id: 'w2', text: '小亭' }
const snapshot = {
  avatars: [firstAvatar, secondAvatar],
  adjectives: [firstAdjective],
  nouns: [firstNoun],
}
const draw = {
  avatar_id: firstAvatar.id,
  image_path: firstAvatar.image_path,
  nickname: '温柔的小亭',
  can_reroll: true,
}
let wrapper: VueWrapper

beforeEach(async () => {
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
  vi.mocked(service.readRandomProfiles).mockResolvedValue(structuredClone(snapshot))
  wrapper = mount(RandomProfilesView, {
    global: { plugins: [pinia], stubs: { NoticePortal: { template: '<div><slot /></div>' } } },
  })
  await flushPromises()
})

afterEach(() => {
  wrapper.unmount()
  vi.unstubAllGlobals()
})

function button(text: string) {
  const target = wrapper.findAll('button').find((item) => item.text() === text)
  if (!target) throw new Error(`找不到按钮 ${text}`)
  return target
}

function row(name: string) {
  const target = wrapper.findAll('tbody tr').find((item) => item.text().includes(name))
  if (!target) throw new Error(`找不到 ${name} 所在的行`)
  return target
}

describe('随机资料管理', () => {
  it('输入和状态变更立即筛选，阻止停用最后一项直到另一项启用', async () => {
    const search = wrapper.get('input[type="search"]')
    await search.setValue('荷')
    expect(wrapper.get('tbody').text()).not.toContain('锦鲤')
    await wrapper.get('select').setValue('enabled')
    expect(wrapper.get('tbody').text()).toContain('没有符合条件的配置')
    await wrapper.get('select').setValue('all')
    await search.setValue('')
    await row('锦鲤').get('button:last-child').trigger('click')
    expect(wrapper.text()).toContain('请先启用另一项')
    expect(service.submitRandomProfile).not.toHaveBeenCalled()
    vi.mocked(service.submitRandomProfile).mockResolvedValueOnce({
      ...secondAvatar,
      enabled: true,
      version: 2,
    })
    await row('荷叶').get('button:last-child').trigger('click')
    await flushPromises()
    expect(row('荷叶').text()).toContain('已启用')
    vi.mocked(service.submitRandomProfile).mockResolvedValueOnce({
      ...firstAvatar,
      enabled: false,
      version: 2,
    })
    await row('锦鲤').get('button:last-child').trigger('click')
    await flushPromises()
    expect(row('锦鲤').text()).toContain('已停用')
    expect(service.readRandomProfiles).toHaveBeenCalledOnce()
  })

  it('预览形容词拼接，拒绝重复和超长组合，新增词条显示为已启用', async () => {
    await button('形容词 1').trigger('click')
    await button('新增形容词').trigger('click')
    const form = wrapper.get('form')
    await form.get('input').setValue(' 温柔 ')
    expect(form.text()).toContain('温柔的小亭')
    await form.trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('已有相同词条')
    expect(service.submitRandomProfile).not.toHaveBeenCalled()
    await form.get('input').setValue('鲤'.repeat(38))
    await form.trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('会超过 40 个字符')
    expect(service.submitRandomProfile).not.toHaveBeenCalled()
    await form.get('input').setValue(' 明朗 ')
    vi.mocked(service.submitRandomProfile).mockResolvedValueOnce({
      ...common,
      id: 'w3',
      text: '明朗',
    })
    await form.trigger('submit')
    await flushPromises()
    expect(service.submitRandomProfile).toHaveBeenCalledWith(
      'synthetic',
      { type: 'createWord', pool: 'adjectives', text: '明朗' },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(row('明朗').text()).toContain('已启用')
  })

  it('换图结果未确认时保留当前图，原样重试直到确认并释放预览地址', async () => {
    const revokeObjectURL = vi.fn()
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = vi.fn(() => 'blob:test-preview')
        static override revokeObjectURL = revokeObjectURL
      },
    )
    await row('锦鲤').findAll('button')[1]?.trigger('click')
    const file = new File(['synthetic'], 'replacement.png', { type: 'image/png' })
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    const form = wrapper.get('form')
    expect(form.get('img[alt="当前头像"]').attributes('src')).toBe(firstAvatar.image_path)
    expect(form.get('img[alt="待上传图片"]').attributes('src')).toBe('blob:test-preview')
    vi.mocked(service.submitRandomProfile)
      .mockRejectedValueOnce(new Error('合成断网'))
      .mockResolvedValueOnce({
        ...firstAvatar,
        image_path: '/api/v1/random-profiles/images/new',
        version: 2,
      })
    await form.trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('保存结果尚未确认')
    expect(button('原样重试').exists()).toBe(true)
    expect(row('锦鲤').get('img').attributes('src')).toBe(firstAvatar.image_path)
    await button('重新读取列表').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('已刷新列表，保存结果尚未确认')
    expect(service.readRandomProfiles).toHaveBeenCalledTimes(2)
    await button('返回列表').trigger('click')
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('保存结果待确认')
    await button('原样重试').trigger('click')
    await flushPromises()
    expect(vi.mocked(service.submitRandomProfile).mock.calls[1]?.slice(0, 3)).toEqual(
      vi.mocked(service.submitRandomProfile).mock.calls[0]?.slice(0, 3),
    )
    expect(row('锦鲤').get('img').attributes('src')).toBe('/api/v1/random-profiles/images/new')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-preview')
  })

  it('试抽换组失败时保留预览，重试沿用先前组合', async () => {
    vi.mocked(service.drawRandomProfile)
      .mockResolvedValueOnce(draw)
      .mockRejectedValueOnce(new Error('合成断网'))
      .mockResolvedValueOnce({ ...draw, nickname: '明朗的小亭', can_reroll: false })
    await button('试抽一组').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(draw.nickname)
    await button('换一组').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(draw.nickname)
    expect(wrapper.get('.random-draw-preview img').attributes('src')).toBe(draw.image_path)
    await button('换一组').trigger('click')
    await flushPromises()
    expect(
      vi
        .mocked(service.drawRandomProfile)
        .mock.calls.slice(1)
        .map((call) => call[1]),
    ).toEqual([draw, draw])
    expect(wrapper.text()).toContain('明朗的小亭')
    expect(button('换一组').attributes('disabled')).toBeDefined()
  })
})
