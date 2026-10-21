import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { router, menu } from './index'
import { useAdminStore } from '@/stores/admin'
beforeEach(() => setActivePinia(createPinia()))
describe('T010 REQ-019 路由与菜单', () => {
  it.each(['/identity', '/moderation'])('未登录访问%s回登录', async (path) => {
    await router.push(path)
    expect(router.currentRoute.value.path).toBe('/login')
  })
  it.each(['/identity', '/moderation'])('危机角色不能进入%s且审核菜单不可见', async (path) => {
    const admin = useAdminStore()
    admin.session = {
      token: 'synthetic',
      account: { id: 'a', version: 1, active: true, roles: ['crisis_operator'] },
    }
    await router.push(path)
    expect(router.currentRoute.value.path).toBe('/403')
    expect(
      menu.filter((item) => !item.role || admin.can(item.role)).map((item) => item.path),
    ).toEqual(['/'])
  })
  it.each(['/identity', '/moderation'])('超管可进入%s', async (path) => {
    useAdminStore().session = {
      token: 'synthetic',
      account: { id: 'a', version: 1, active: true, roles: ['super_admin'] },
    }
    await router.push(path)
    expect(router.currentRoute.value.path).toBe(path)
  })
})
