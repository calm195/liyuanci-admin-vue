import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import App from '@/App.vue'
import { router } from '@/router'
import { useAdminStore } from '@/stores/admin'

let pinia: ReturnType<typeof createPinia>
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(async () => {
  pinia = createPinia()
  setActivePinia(pinia)
  localStorage.clear()
  await router.replace('/login')
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  disposePinia(pinia)
})
function login() {
  useAdminStore().session = {
    token: 'synthetic',
    account: {
      id: 'a',
      login_name: '合成运营',
      version: 1,
      active: true,
      roles: ['review_operator'],
    },
  }
}
function render() {
  wrapper = mount(App, { global: { plugins: [pinia, router], stubs: { RouterView: true } } })
  return wrapper
}
it('REQ-019 登录页提供主题切换，不显示受保护的导航', async () => {
  const view = render()
  expect(view.find('nav[aria-label="管理菜单"]').exists()).toBe(false)
  await view.get('input[value="dark"]').setValue(true)
  expect(document.documentElement.classList.contains('dark')).toBe(true)
  expect(localStorage.getItem('liyuanci-theme')).toBe('dark')
})
it('REQ-019 显示当前页面面包屑、标题及按角色过滤的菜单', async () => {
  login()
  await router.push('/identity')
  const view = render()
  const breadcrumb = view.get('[aria-label="面包屑导航"]')
  expect(breadcrumb.text()).toContain('工作台')
  expect(breadcrumb.text()).toContain('认证管理')
  expect(breadcrumb.get('[aria-current="page"] .el-breadcrumb__inner').text()).toBe('身份审核')
  expect(document.title).toBe('身份审核 · 鲤源池')
  const navigation = view.get('nav[aria-label="管理菜单"]')
  expect(navigation.find('a[href="/accounts"]').exists()).toBe(false)
  expect(navigation.find('a[href="/crisis"]').exists()).toBe(false)
  expect(navigation.find('a[href="/identity"]').attributes('aria-current')).toBe('page')
  await breadcrumb.get('a[href="/"]').trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/'))
  expect(view.get('[aria-label="面包屑导航"] .el-breadcrumb__inner').text()).toBe('工作台')
})
it('REQ-019 移动端菜单切换，页面变化后收起，拒绝页也有明确面包屑', async () => {
  login()
  await router.push('/')
  const view = render()
  const toggle = view.get('button[aria-controls="workspace-sidebar"]')
  await toggle.trigger('click')
  expect(toggle.attributes('aria-expanded')).toBe('true')
  await router.push('/accounts')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/403')
  expect(toggle.attributes('aria-expanded')).toBe('false')
  expect(view.get('[aria-current="page"] .el-breadcrumb__inner').text()).toBe('无权访问')
  await router.push('/unknown-page')
  await flushPromises()
  expect(document.title).toBe('页面不存在 · 鲤源池')
})
it('REQ-019 会话失效时移除工作区及菜单，返回登录', async () => {
  login()
  await router.push('/')
  const view = render()
  useAdminStore().clear('会话已失效')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/login')
  expect(view.find('nav[aria-label="管理菜单"]').exists()).toBe(false)
})

it('REQ-019 词库子路由继承权限，详情保留菜单高亮与列表面包屑', async () => {
  await router.push('/wordlists/drafts/new')
  expect(router.currentRoute.value.path).toBe('/login')
  login()
  await router.push('/wordlists/example')
  const view = render()
  expect(document.title).toBe('词单详情 · 鲤源池')
  expect(view.get('nav[aria-label="管理菜单"] a[href="/wordlists"]').classes()).toContain(
    'router-link-active',
  )
  await view.get('[aria-label="面包屑导航"] a[href="/wordlists"]').trigger('click')
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/wordlists'))
  const session = useAdminStore().session
  if (!session) throw new Error('缺少合成会话')
  session.account.roles = ['crisis_operator']
  await router.push('/wordlists/drafts/new')
  expect(router.currentRoute.value.path).toBe('/403')
  await router.push('/wordlists/example')
  expect(router.currentRoute.value.path).toBe('/403')
})
