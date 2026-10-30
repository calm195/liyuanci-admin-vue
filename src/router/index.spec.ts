import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { router, menu, canAccessMenu } from './index'
import { useAdminStore } from '@/stores/admin'
beforeEach(async () => {
  setActivePinia(createPinia())
  await router.replace('/login')
})
describe('T010 REQ-019 路由与菜单', () => {
  it.each([
    '/identity',
    '/moderation',
    '/whispers/reviews',
    '/wordlists',
    '/accounts',
    '/evidence-deletion',
    '/deletion-receipts',
  ])('未登录访问%s回登录', async (path) => {
    await router.push(path)
    expect(router.currentRoute.value.path).toBe('/login')
  })
  it.each([
    '/identity',
    '/moderation',
    '/whispers/reviews',
    '/wordlists',
    '/accounts',
    '/evidence-deletion',
    '/deletion-receipts',
  ])('危机角色不能进入%s且审核菜单不可见', async (path) => {
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
    expect(menu.filter(canAccessMenu).map((item) => item.path)).toEqual([
      '/users',
      '/',
      '/password',
      '/whispers/reports',
      '/safety/reports',
      '/safety/penalties',
      '/safety/appeals',
      '/whispers/crises',
      '/crisis',
    ])
  })
  it.each([
    '/identity',
    '/moderation',
    '/whispers/reviews',
    '/wordlists',
    '/accounts',
    '/evidence-deletion',
    '/deletion-receipts',
  ])('超管可进入%s', async (path) => {
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

it('REQ-019 审核运营不能访问超管账号管理', async () => {
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
  await router.push('/accounts')
  expect(router.currentRoute.value.path).toBe('/403')
  expect(menu.filter(canAccessMenu).some((item) => item.path === '/accounts')).toBe(false)
})

it.each(['review_operator', 'crisis_operator', 'super_admin'] as const)(
  'T028 %s可进入普通安全治理页面',
  async (role) => {
    useAdminStore().session = {
      token: 'test',
      account: { id: 'admin', login_name: '测试账号', version: 1, active: true, roles: [role] },
    }
    await router.push('/safety')
    expect(router.currentRoute.value.path).toBe('/safety/reports')
    expect(menu.filter(canAccessMenu).some((item) => item.path === '/safety/reports')).toBe(true)
  },
)
it('T028 空角色和未登录拒绝安全治理入口', async () => {
  await router.push('/safety')
  expect(router.currentRoute.value.path).toBe('/login')
  useAdminStore().session = {
    token: 'test',
    account: { id: 'admin', login_name: '测试账号', version: 1, active: true, roles: [] },
  }
  await router.push('/safety')
  expect(router.currentRoute.value.path).toBe('/403')
  expect(menu.filter(canAccessMenu).some((item) => item.path === '/safety/reports')).toBe(false)
})

it.each(['crisis_operator', 'super_admin'] as const)('T030 %s可进入危机工作台', async (role) => {
  useAdminStore().session = {
    token: 'test',
    account: { id: 'admin', login_name: '测试账号', version: 1, active: true, roles: [role] },
  }
  await router.push('/crisis')
  expect(router.currentRoute.value.path).toBe('/crisis')
  expect(menu.filter(canAccessMenu).some((item) => item.path === '/crisis')).toBe(true)
})
it('T030 普通审核与空角色不能进入危机工作台，未登录回登录', async () => {
  await router.push('/crisis')
  expect(router.currentRoute.value.path).toBe('/login')
  for (const roles of [['review_operator' as const], []]) {
    useAdminStore().session = {
      token: 'test',
      account: { id: 'admin', login_name: '测试账号', version: 1, active: true, roles },
    }
    await router.push('/crisis')
    expect(router.currentRoute.value.path).toBe('/403')
    expect(menu.filter(canAccessMenu).some((item) => item.path === '/crisis')).toBe(false)
  }
})

it.each(['/safety/reports', '/safety/penalties', '/safety/appeals', '/whispers/reports'])(
  'REQ-019 %s独立路由要求登录与案件角色，三类案件角色均可访问',
  async (path) => {
    await router.push(path)
    expect(router.currentRoute.value.path).toBe('/login')
    for (const roles of [[], ['review_operator'], ['crisis_operator'], ['super_admin']] as const) {
      useAdminStore().session = {
        token: 'synthetic',
        account: { id: 'a', login_name: '合成角色', version: 1, active: true, roles: [...roles] },
      }
      await router.push(path)
      expect(router.currentRoute.value.path).toBe(roles.length ? path : '/403')
      expect(menu.filter(canAccessMenu).some((item) => item.path === path)).toBe(roles.length > 0)
    }
  },
)

it('回执查询面包屑与菜单独立，普通审核角色不可见', async () => {
  useAdminStore().session = {
    token: 'synthetic',
    account: {
      id: 'a',
      login_name: '合成审核',
      version: 1,
      active: true,
      roles: ['review_operator'],
    },
  }
  await router.push('/deletion-receipts')
  expect(router.currentRoute.value.path).toBe('/403')
  expect(menu.filter(canAccessMenu).some((item) => item.path === '/deletion-receipts')).toBe(false)
  expect(router.resolve('/deletion-receipts').meta).toMatchObject({
    title: '回执查询',
    group: '隐私管理',
    role: 'super_admin',
  })
})

it.each(['/whispers/crises', '/whispers/evidence'])(
  'WA-04 %s独立投影严格隔离角色与菜单',
  async (path) => {
    await router.push(path)
    expect(router.currentRoute.value.path).toBe('/login')
    for (const role of ['review_operator', 'crisis_operator', 'super_admin'] as const) {
      useAdminStore().session = {
        token: 'test',
        account: {
          id: 'admin',
          login_name: '合成角色',
          version: 1,
          active: true,
          roles: [role],
        },
      }
      const allowed =
        role === 'super_admin' || (path === '/whispers/crises' && role === 'crisis_operator')
      await router.push(path)
      expect(router.currentRoute.value.path).toBe(allowed ? path : '/403')
      expect(menu.filter(canAccessMenu).some((item) => item.path === path)).toBe(allowed)
    }
    useAdminStore().session = {
      token: 'test',
      account: {
        id: 'admin',
        login_name: '空角色',
        version: 1,
        active: true,
        roles: [],
      },
    }
    await router.replace('/')
    await router.push(path)
    expect(router.currentRoute.value.path).toBe('/403')
  },
)

it.each(['/resources', '/resource-categories'])(
  'REQ-023 %s仅审核运营和超管可访问，菜单与深链一致',
  async (path) => {
    await router.push(path)
    expect(router.currentRoute.value.path).toBe('/login')
    for (const role of ['review_operator', 'crisis_operator', 'super_admin'] as const) {
      useAdminStore().session = {
        token: 'synthetic',
        account: { id: 'a', login_name: '合成角色', active: true, version: 1, roles: [role] },
      }
      await router.replace('/')
      await router.push(path)
      expect(router.currentRoute.value.path).toBe(role === 'crisis_operator' ? '/403' : path)
      expect(menu.filter(canAccessMenu).some((item) => item.path === path)).toBe(
        role !== 'crisis_operator',
      )
    }
  },
)
