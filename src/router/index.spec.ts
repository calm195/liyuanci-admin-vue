import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { router, menu } from './index'
import { useAdminStore } from '@/stores/admin'
beforeEach(() => setActivePinia(createPinia()))
describe('T010 REQ-019 路由与菜单', () => {
  it.each(['/identity', '/moderation', '/wordlists'])('未登录访问%s回登录', async (path) => {
    await router.push(path)
    expect(router.currentRoute.value.path).toBe('/login')
  })
  it.each(['/identity', '/moderation', '/wordlists'])(
    '危机角色不能进入%s且审核菜单不可见',
    async (path) => {
      const admin = useAdminStore()
      admin.session = {
        token: 'synthetic',
        account: {
          login_name: 'synthetic-operator',
          id: 'a',
          version: 1,
          active: true,
          roles: ['crisis_operator'],
        },
      }
      await router.push(path)
      expect(router.currentRoute.value.path).toBe('/403')
      expect(
        menu.filter((item) => !item.role || admin.can(item.role)).map((item) => item.path),
      ).toEqual(['/', '/password'])
    },
  )
  it.each(['/identity', '/moderation', '/wordlists'])('超管可进入%s', async (path) => {
    useAdminStore().session = {
      token: 'synthetic',
      account: {
        login_name: 'synthetic-operator',
        id: 'a',
        version: 1,
        active: true,
        roles: ['super_admin'],
      },
    }
    await router.push(path)
    expect(router.currentRoute.value.path).toBe(path)
  })
  it('本人改密要求登录，但不要求审核运营或超管角色', async () => {
    await router.push('/password')
    expect(router.currentRoute.value.path).toBe('/login')
    useAdminStore().session = {
      token: 'synthetic',
      account: {
        id: 'a',
        login_name: 'synthetic-crisis',
        active: true,
        version: 1,
        roles: ['crisis_operator'],
      },
    }
    await router.push('/password')
    expect(router.currentRoute.value.path).toBe('/password')
  })
})
