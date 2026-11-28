import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { router, menu, canAccessMenu } from './index'
import { useAdminStore } from '@/stores/admin'
import type * as AdminServices from '@/services/admin'
vi.mock('@/services/admin', async (original) => {
  const services = await original<typeof AdminServices>()
  return { ...services, restoreAdmin: vi.fn(() => Promise.reject(new services.ApiError(401))) }
})
beforeEach(async () => {
  setActivePinia(createPinia())
  await router.replace('/login')
})
describe('T010 REQ-019 路由与菜单', () => {
  it.each([
    '/identity',
    '/identity/history',
    '/identity?tab=processed',
    '/moderation',
    '/moderation?case=sample',
    '/whispers/reviews',
    '/wordlists',
    '/accounts',
    '/module-guide',
    '/random-profiles',
    '/evidence-deletion',
    '/deletion-receipts',
  ])('未登录访问%s回登录', async (path) => {
    await router.push(path)
    expect(router.currentRoute.value.path).toBe('/login')
  })
  it.each([
    '/identity',
    '/identity/history',
    '/identity?tab=processed',
    '/moderation',
    '/moderation?case=sample',
    '/whispers/reviews',
    '/wordlists',
    '/accounts',
    '/module-guide',
    '/random-profiles',
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
    '/module-guide',
    '/random-profiles',
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

it.each([
  { role: 'review_operator', allowed: true },
  { role: 'super_admin', allowed: true },
  { role: 'crisis_operator', allowed: false },
  { role: null, allowed: false },
] as const)('身份审核旧入口与内容审核定位遵循岗位权限 $role', async ({ role, allowed }) => {
  useAdminStore().session = {
    token: 'synthetic',
    account: {
      id: 'a',
      login_name: '合成岗位',
      active: true,
      version: 1,
      roles: role ? [role] : [],
    },
  }
  const destinations = [
    ['/identity/history', '/identity?tab=processed'],
    ['/identity?tab=processed', '/identity?tab=processed'],
    ['/moderation?case=sample', '/moderation?case=sample'],
  ] as const
  for (const [path, expected] of destinations) {
    await router.replace('/')
    await router.push(path)
    expect(router.currentRoute.value.fullPath).toBe(allowed ? expected : '/403')
  }
  const navigation = menu.filter(canAccessMenu).map((item) => item.path)
  expect(navigation.includes('/identity')).toBe(allowed)
  expect(navigation.includes('/moderation')).toBe(allowed)
  expect(navigation).not.toContain('/identity/history')
})

it('审核运营无法通过深链访问随机资料配置', async () => {
  const admin = useAdminStore()
  admin.session = {
    token: 'synthetic',
    account: {
      id: 'op',
      login_name: '测试账号',
      version: 1,
      active: true,
      roles: ['review_operator'],
    },
  }
  await router.push('/random-profiles')
  expect(router.currentRoute.value.path).toBe('/403')
  expect(menu.filter(canAccessMenu).some((item) => item.path === '/random-profiles')).toBe(false)
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

it.each(['/safety/reports', '/safety/appeals', '/whispers/reports'])(
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

it('旧处罚入口保留单个举报定位并沿用举报路由授权', async () => {
  const legacy = '/safety/penalties?report=sample&status=pending'
  await router.push(legacy)
  expect(router.currentRoute.value.path).toBe('/login')
  for (const roles of [[], ['review_operator'], ['crisis_operator'], ['super_admin']] as const) {
    useAdminStore().session = {
      token: 'synthetic',
      account: { id: 'a', login_name: '合成角色', version: 1, active: true, roles: [...roles] },
    }
    await router.push(legacy)
    if (roles.length) {
      expect(router.currentRoute.value.path).toBe('/safety/reports')
      expect(router.currentRoute.value.query).toEqual({ status: 'resolved', report: 'sample' })
    } else expect(router.currentRoute.value.path).toBe('/403')
    expect(menu.filter(canAccessMenu).some((item) => item.path === '/safety/penalties')).toBe(false)
  }
  await router.push('/safety/penalties?report=one&report=two')
  expect(router.currentRoute.value.fullPath).toBe('/safety/reports?status=resolved')
  await router.push('/safety/penalties')
  expect(router.currentRoute.value.fullPath).toBe('/safety/reports?status=resolved')
})

it.each(['review_operator', 'crisis_operator', 'super_admin'] as const)(
  '%s的用户处罚历史关联页沿用各工作台权限',
  async (role) => {
    useAdminStore().session = {
      token: 'synthetic',
      account: { id: 'a', login_name: '合成角色', version: 1, active: true, roles: [role] },
    }
    await router.push('/users')
    expect(router.currentRoute.value.path).toBe('/users')
    await router.push('/safety/reports?report=sample')
    expect(router.currentRoute.value.path).toBe('/safety/reports')
    await router.push('/safety/appeals?appeal=sample')
    expect(router.currentRoute.value.path).toBe('/safety/appeals')
    await router.push('/moderation?case=sample')
    expect(router.currentRoute.value.path).toBe(role === 'crisis_operator' ? '/403' : '/moderation')
  },
)

it.each([
  ['/deletion-receipts', '删除任务与回执', true],
  ['/evidence-deletion', '证据删除', false],
  ['/whispers/evidence', '树洞证据', false],
] as const)('%s仅超管可进入，证据处理从案件关联进入', async (path, title, hasMenu) => {
  await router.push(path)
  expect(router.currentRoute.value.path).toBe('/login')
  for (const roles of [[], ['review_operator'], ['crisis_operator'], ['super_admin']] as const) {
    useAdminStore().session = {
      token: 'synthetic',
      account: { id: 'a', login_name: '合成岗位', version: 1, active: true, roles: [...roles] },
    }
    await router.replace('/')
    await router.push(path)
    const allowed = roles[0] === 'super_admin'
    expect(router.currentRoute.value.path).toBe(allowed ? path : '/403')
    expect(menu.filter(canAccessMenu).some((item) => item.path === path)).toBe(allowed && hasMenu)
  }
  expect(router.resolve(path).meta).toMatchObject({ title, group: '隐私管理', role: 'super_admin' })
})

it.each(['/whispers/crises'])('WA-04 %s危机投影严格隔离角色与菜单', async (path) => {
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
})

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
