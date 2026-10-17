import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { router, menu } from './index'
import { useAdminStore } from '@/stores/admin'
beforeEach(() => setActivePinia(createPinia()))
describe('T010 REQ-019 路由与菜单', () => {
  it('未登录直接访问受保护路径回登录', async () => {
    await router.push('/identity')
    expect(router.currentRoute.value.path).toBe('/login')
  })
  it('危机角色不能进入身份审核且菜单不可见', async () => {
    const admin = useAdminStore()
    admin.session = {
      token: 'synthetic',
      account: { id: 'a', version: 1, active: true, roles: ['crisis_operator'] },
    }
    await router.push('/identity')
    expect(router.currentRoute.value.path).toBe('/403')
    expect(
      menu.filter((item) => !item.role || admin.can(item.role)).map((item) => item.path),
    ).toEqual(['/'])
  })
  it('超管可进入身份审核准备页', async () => {
    useAdminStore().session = {
      token: 'synthetic',
      account: { id: 'a', version: 1, active: true, roles: ['super_admin'] },
    }
    await router.push('/identity')
    expect(router.currentRoute.value.path).toBe('/identity')
  })
})
