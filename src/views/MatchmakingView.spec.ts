import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MatchmakingView from './MatchmakingView.vue'
import MatchmakingTaskLibraryView from './MatchmakingTaskLibraryView.vue'
import fixture from '@/services/matchmaking.contract.spec.json'
import { useAdminStore } from '@/stores/admin'
import { beijingInput, beijingISO } from '@/composables/useMatchmaking'
import { record } from '@/types/admin'

let wrapper: VueWrapper
let router: Router
const transport = vi.fn<typeof fetch>()
const response = (value: unknown) =>
  Promise.resolve(new Response(JSON.stringify(value), { status: 200 }))
function requestURL(input: RequestInfo | URL | undefined) {
  if (typeof input !== 'string') throw new Error('测试只接受同源字符串路径')
  return input
}
function requestBody(body: BodyInit | null | undefined) {
  if (typeof body !== 'string') throw new Error('测试只接受 JSON 字符串请求')
  const value: unknown = JSON.parse(body)
  if (!record(value)) throw new Error('请求必须是对象')
  return value
}
beforeEach(async () => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', transport)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  transport.mockImplementation((input, init) => {
    if (init?.method === 'POST' || init?.method === 'PUT') return response(fixture.receipt)
    const url = requestURL(input)
    if (url.includes('/candidates/')) return response(fixture.candidates)
    if (url.includes(`${fixture.workspace.data.activity.id}?`)) return response(fixture.workspace)
    return response(fixture.list)
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminStore().session = {
    token: 'synthetic',
    account: {
      id: 'synthetic-admin',
      login_name: '合成管理员',
      version: 1,
      roles: ['review_operator'],
      active: true,
    },
  }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/matchmaking', component: MatchmakingView },
      { path: '/matchmaking/task-library', component: MatchmakingTaskLibraryView },
      { path: '/other', component: { template: '<p>其他工作区</p>' } },
    ],
  })
  await router.push('/matchmaking')
  await router.isReady()
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
})
afterEach(() => {
  wrapper.unmount()
  vi.unstubAllGlobals()
})
function button(label: string) {
  const result = wrapper.findAll('button').find((item) => item.text() === label)
  if (!result) throw new Error(`找不到按钮：${label}`)
  return result
}
async function openActivity() {
  await wrapper.get('.match-activity').trigger('click')
  await flushPromises()
}
function writes() {
  return transport.mock.calls.filter(
    (call) => call[1]?.method === 'PUT' || call[1]?.method === 'POST',
  )
}

describe('包分配工作台', () => {
  it('详情回填后只提交可写字段，并按北京时间保存', async () => {
    await openActivity()
    expect(wrapper.get('input[name="starts_at"]').element).toHaveProperty(
      'value',
      '2026-12-07T09:00',
    )
    await wrapper.get('input[name="title"]').setValue('调整后的活动')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const body = requestBody(writes()[0]?.[1]?.body)
    expect(Object.keys(body).sort()).toEqual(
      [
        'expected_version',
        'title',
        'description',
        'days',
        'registration_opens_at',
        'registration_closes_at',
        'results_at',
        'starts_at',
        'ends_at',
      ].sort(),
    )
    expect(body).toMatchObject({
      expected_version: 3,
      title: '调整后的活动',
      starts_at: '2026-12-07T01:00:00.000Z',
    })
    expect(wrapper.text()).toContain('保存活动已成功')
  })
  it('网络未知结果锁定输入并使用原始请求重试', async () => {
    await openActivity()
    transport.mockRejectedValueOnce(new Error('合成网络中断'))
    await wrapper.get('input[name="title"]').setValue('保留原始标题')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('结果尚未确认')
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
    const first = writes()[0]
    await button('原样重试').trigger('click')
    await flushPromises()
    expect(writes()[1]?.[1]?.body).toBe(first?.[1]?.body)
    expect(writes()[1]?.[1]?.headers).toEqual(first?.[1]?.headers)
    expect(wrapper.find('[aria-label="待确认操作"]').exists()).toBe(false)
  })
  it('待审核报名不具备配对资格时仍可审核，提交报名版本', async () => {
    transport.mockImplementation((input, init) =>
      init?.method === 'POST'
        ? response(fixture.receipt)
        : requestURL(input).includes(`${fixture.workspace.data.activity.id}?`)
          ? response({
              ...fixture.workspace,
              data: {
                ...fixture.workspace.data,
                activity: {
                  ...fixture.workspace.data.activity,
                  status: 'published',
                  phase: 'registration',
                },
              },
            })
          : response(fixture.list),
    )
    await openActivity()
    await button('报名与配对').trigger('click')
    await button('查看与审核').trigger('click')
    expect(button('通过报名').attributes('disabled')).toBeUndefined()
    await button('通过报名').trigger('click')
    await flushPromises()
    expect(requestURL(writes()[0]?.[0])).toContain(
      `/enrollments/${fixture.workspace.data.enrollments[0]?.id}/review`,
    )
    expect(requestBody(writes()[0]?.[1]?.body)).toEqual({
      expected_version: 2,
      decision: 'approved',
      reason: '',
    })
  })
  it('模板已发布后冻结编辑，换号后清除敏感资料', async () => {
    transport.mockImplementation((input) =>
      requestURL(input).includes(`${fixture.workspace.data.activity.id}?`)
        ? response({
            ...fixture.workspace,
            data: { ...fixture.workspace.data, templates_locked: true },
          })
        : response(fixture.list),
    )
    await openActivity()
    await button('每日任务').trigger('click')
    expect(wrapper.text()).toContain('模板已冻结')
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
    useAdminStore().session = null
    await flushPromises()
    expect(wrapper.text()).toContain('无权管理')
    expect(wrapper.find('textarea').exists()).toBe(false)
  })
  it('每日任务库独立维护并为活动选择可用的首日任务', async () => {
    const first = {
      id: 'aa110000-0000-4000-8000-000000000010',
      version: 1,
      kind: 'online',
      body: '合成首日问候',
      min_day: 0,
      enabled: true,
    }
    let chosen = false
    transport.mockImplementation((input, init) => {
      const url = requestURL(input)
      if (init?.method === 'POST' || init?.method === 'PUT') {
        if (url.endsWith('/task-plan')) chosen = true
        return response(fixture.receipt)
      }
      if (url.includes('/task-library?'))
        return response({
          ...fixture.list,
          data: {
            total: 2,
            items: [first, { ...first, id: 'aa110000-0000-4000-8000-000000000011', min_day: 3 }],
          },
        })
      if (url.includes(`${fixture.workspace.data.activity.id}?`))
        return response({
          ...fixture.workspace,
          data: {
            ...fixture.workspace.data,
            ...(chosen
              ? {
                  task_plan: {
                    first_task_id: first.id,
                    first_task_body: first.body,
                    missing_day: 2,
                  },
                }
              : {}),
          },
        })
      return response(fixture.list)
    })
    await router.push('/matchmaking/task-library')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('每日任务库')
    expect(wrapper.find('.match-activities').exists()).toBe(false)
    const library = wrapper.get('section[aria-label="每日任务库"]')
    await library.get('textarea').setValue('另一个合成任务')
    await library.get('form').trigger('submit')
    await flushPromises()
    expect(requestURL(writes()[0]?.[0])).toContain('/task-library')
    expect(requestBody(writes()[0]?.[1]?.body)).toEqual({
      expected_version: 0,
      body: '另一个合成任务',
      kind: 'online',
      min_day: 0,
      enabled: true,
    })
    await router.push('/matchmaking')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('活动维护')
    await openActivity()
    await button('每日任务').trigger('click')
    await button('选择固定首日任务').trigger('click')
    await flushPromises()
    const choices = wrapper.findAll('button').filter((item) => item.text() === '设为固定首日任务')
    expect(choices).toHaveLength(2)
    expect(choices[1]?.attributes('disabled')).toBeDefined()
    await button('设为固定首日任务').trigger('click')
    await flushPromises()
    expect(requestURL(writes()[1]?.[0])).toContain('/task-plan')
    expect(requestBody(writes()[1]?.[1]?.body)).toEqual({
      expected_version: 3,
      first_task_id: first.id,
    })
    expect(wrapper.text()).toContain('固定首日任务：合成首日问候')
    expect(wrapper.text()).toContain('第 2 天无法分配任务')
  })
  it('时间转换不依赖浏览器时区并拒绝无效日期', () => {
    expect(beijingISO('2027-01-01T00:00')).toBe('2026-12-31T16:00:00.000Z')
    expect(beijingInput('2026-12-31T16:00:00Z')).toBe('2027-01-01T00:00')
    expect(() => beijingISO('2027-02-31T00:00')).toThrow()
  })
  it('未知新建离页重入保留原始正文与幂等键，不能创建另一份命令', async () => {
    await button('新建活动').trigger('click')
    await wrapper.get('input[name="title"]').setValue('待确认的新活动')
    await wrapper.get('textarea[name="description"]').setValue('合成说明')
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    await wrapper.get('input[name="days"]').setValue(3)
    for (const key of [
      'registration_opens_at',
      'registration_closes_at',
      'results_at',
      'starts_at',
      'ends_at',
    ] as const)
      await wrapper
        .get(`input[name="${key}"]`)
        .setValue(beijingInput(fixture.workspace.data.activity[key]))
    transport.mockRejectedValueOnce(new Error('合成网络中断'))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const original = writes()[0]
    expect(original).toBeDefined()
    await router.push('/other')
    await flushPromises()
    await router.push('/matchmaking')
    await flushPromises()
    expect(wrapper.get('input[name="title"]').element).toHaveProperty('value', '待确认的新活动')
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
    expect(button('新建活动').attributes('disabled')).toBeDefined()
    await button('原样重试').trigger('click')
    await flushPromises()
    expect(writes()).toHaveLength(2)
    expect(writes()[1]?.[1]?.body).toBe(original?.[1]?.body)
    expect(writes()[1]?.[1]?.headers).toEqual(original?.[1]?.headers)
  })
  it('未知命令在换会话后销毁，迟到写入回执不回填旧资料', async () => {
    await openActivity()
    let finish: ((value: Response) => void) | undefined
    transport.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    useAdminStore().clear()
    finish?.(new Response(JSON.stringify(fixture.receipt)))
    await flushPromises()
    expect(wrapper.text()).toContain('无权管理')
    expect(wrapper.text()).not.toContain('已成功')
    await router.push('/other')
    useAdminStore().session = {
      token: 'synthetic-new',
      account: {
        id: 'other',
        login_name: '新管理员',
        version: 1,
        active: true,
        roles: ['review_operator'],
      },
    }
    await router.push('/matchmaking')
    await flushPromises()
    expect(wrapper.find('[aria-label="待确认操作"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('选择一场活动')
  })
  it('结束必须晚于最后一天北京时间零点，跨年日历规则一致', async () => {
    await openActivity()
    await wrapper.get('input[name="ends_at"]').setValue('2026-12-09T00:00')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(writes()).toHaveLength(0)
    expect(wrapper.text()).toContain('最后一天任务')
    await wrapper.get('input[name="starts_at"]').setValue('2026-12-31T23:30')
    await wrapper.get('input[name="ends_at"]').setValue('2027-01-02T00:01')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(writes()).toHaveLength(1)
    expect(requestBody(writes()[0]?.[1]?.body)['ends_at']).toBe('2027-01-01T16:01:00.000Z')
  })
  it.each(['cancelled', 'ended'])(
    '活动%s后保留只读资料，关闭审核、发布结果和模板编辑',
    async (phase) => {
      transport.mockImplementation((input) =>
        requestURL(input).includes(`${fixture.workspace.data.activity.id}?`)
          ? response({
              ...fixture.workspace,
              data: {
                ...fixture.workspace.data,
                activity: {
                  ...fixture.workspace.data.activity,
                  status: phase === 'cancelled' ? 'cancelled' : 'published',
                  phase,
                },
              },
            })
          : response(fixture.list),
      )
      await openActivity()
      await button('报名与配对').trigger('click')
      await button('查看与审核').trigger('click')
      expect(button('通过报名').attributes('disabled')).toBeDefined()
      expect(button('驳回报名').attributes('disabled')).toBeDefined()
      await button('配对记录').trigger('click')
      expect(button('发布全部待发布结果').attributes('disabled')).toBeDefined()
      await button('每日任务').trigger('click')
      expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(writes()).toHaveLength(0)
    },
  )
})
