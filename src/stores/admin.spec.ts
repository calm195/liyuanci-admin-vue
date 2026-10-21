import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAdminStore } from './admin'
import { ApiError } from '@/services/admin'
import * as service from '@/services/admin'
vi.mock('@/services/admin', async (original) => ({
  ...(await original<typeof service>()),
  adminRequest: vi.fn(),
  revokeAdmin: vi.fn(),
  loginAdmin: vi.fn(),
  changeAdminPassword: vi.fn(),
}))
beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
})
const session = {
  token: 'synthetic',
  account: {
    login_name: 'synthetic-operator',
    id: 'synthetic',
    version: 1,
    active: true,
    roles: ['review_operator' as const],
  },
}
describe('T010 REQ-018/019 会话生命周期', () => {
  it('登录完成前退出会使旧登录失败，不能恢复会话', async () => {
    vi.mocked(service.loginAdmin).mockResolvedValue(session)
    const admin = useAdminStore()
    const pending = admin.login({ login_name: 'synthetic-operator', password: 'generated-in-test' })
    await admin.logout()
    await expect(pending).rejects.toThrow('登录操作已失效')
    expect(admin.authenticated).toBe(false)
  })
  it('重复登录仅最后一次成功，旧操作不能报告登录成功', async () => {
    vi.mocked(service.loginAdmin)
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce({
        token: 'new-synthetic',
        account: { ...session.account, roles: ['crisis_operator'] },
      })
    const admin = useAdminStore()
    const first = admin.login({ login_name: 'synthetic-operator', password: 'generated-in-test' })
    const second = admin.login({ login_name: 'synthetic-second', password: 'generated-in-test' })
    await expect(first).rejects.toThrow('登录操作已失效')
    await second
    expect(admin.can('crisis_operator')).toBe(true)
    expect(admin.can('review_operator')).toBe(false)
  })
  it('旧退出失败不会覆盖新会话的提示或权限', async () => {
    const admin = useAdminStore()
    admin.session = session
    let fail: ((reason: Error) => void) | undefined
    vi.mocked(service.revokeAdmin).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject
        }),
    )
    const pending = admin.logout()
    vi.mocked(service.loginAdmin).mockResolvedValue(session)
    await admin.login({ login_name: 'synthetic-operator', password: 'generated-in-test' })
    fail?.(new Error('offline'))
    await pending
    expect(admin.authenticated).toBe(true)
    expect(admin.notice).toBe('')
  })
  it.each([401, 403])('旧会话的 %s 晚到不会影响重新登录的会话', async (status) => {
    const admin = useAdminStore()
    admin.session = session
    let fail: ((reason: Error) => void) | undefined
    vi.mocked(service.adminRequest).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject
        }),
    )
    const pending = admin.request('/admin/accounts')
    admin.clear()
    vi.mocked(service.loginAdmin).mockResolvedValue(session)
    await admin.login({ login_name: 'synthetic-operator', password: 'generated-in-test' })
    fail?.(new ApiError(status))
    await expect(pending).rejects.toBeInstanceOf(ApiError)
    expect(admin.authenticated).toBe(true)
    expect(admin.forbidden).toBe(0)
    expect(admin.notice).toBe('')
  })
  it('运营无危机和超管权限，清理后全部禁入', async () => {
    vi.mocked(service.loginAdmin).mockResolvedValue(session)
    const admin = useAdminStore()
    await admin.login({ login_name: 'synthetic-operator', password: 'generated-in-test' })
    expect(admin.can('review_operator')).toBe(true)
    expect(admin.can('crisis_operator')).toBe(false)
    expect(admin.can('super_admin')).toBe(false)
    admin.clear()
    expect(admin.authenticated).toBe(false)
    expect(admin.can('review_operator')).toBe(false)
  })
  it.each([401, 403])('%s：401清会话，403保留会话并通知页面', async (status) => {
    const admin = useAdminStore()
    admin.session = session
    vi.mocked(service.adminRequest).mockRejectedValue(new ApiError(status))
    await expect(admin.request('/admin/accounts')).rejects.toBeInstanceOf(ApiError)
    expect(admin.authenticated).toBe(status !== 401)
    expect(admin.forbidden).toBe(status === 403 ? 1 : 0)
  })
  it('退出失败也清理内存，提示撤销未确认', async () => {
    const admin = useAdminStore()
    admin.session = session
    vi.mocked(service.revokeAdmin).mockRejectedValue(new Error('offline'))
    await admin.logout()
    expect(admin.session).toBeNull()
    expect(admin.notice).toContain('撤销未确认')
  })
  it('旧请求晚到不能恢复会话或泄漏结果', async () => {
    const admin = useAdminStore()
    admin.session = session
    let finish: ((value: unknown) => void) | undefined
    vi.mocked(service.adminRequest).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pending = admin.request('/admin/accounts')
    admin.clear()
    finish?.({ private: 'synthetic' })
    await expect(pending).rejects.toThrow('会话已变更')
  })
})

describe('T010 0.2.0 本人改密会话代次', () => {
  it('204后清会话并要求重登，403旧口令错误保留会话且不触发越权导航', async () => {
    const admin = useAdminStore()
    admin.session = session
    vi.mocked(service.changeAdminPassword).mockRejectedValueOnce(new ApiError(403))
    const input = { current_password: '合成旧', new_password: '合成新' }
    await expect(admin.changePassword(input, 'first')).rejects.toMatchObject({ status: 403 })
    expect(admin.authenticated).toBe(true)
    expect(admin.forbidden).toBe(0)
    vi.mocked(service.changeAdminPassword).mockResolvedValueOnce()
    await admin.changePassword(input, 'second')
    expect(admin.session).toBeNull()
    expect(admin.notice).toContain('请重新登录')
  })
  it.each([401, 403, 204])('旧改密%s晚到不清理或改变新会话', async (status) => {
    const admin = useAdminStore()
    admin.session = session
    let finish: (() => void) | undefined
    let fail: ((cause: Error) => void) | undefined
    vi.mocked(service.changeAdminPassword).mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          finish = resolve
          fail = reject
        }),
    )
    const pending = admin.changePassword(
      { current_password: '合成旧', new_password: '合成新' },
      'key',
    )
    admin.clear()
    vi.mocked(service.loginAdmin).mockResolvedValue({ ...session, token: 'new-session' })
    await admin.login({ login_name: 'synthetic', password: '合成输入' })
    if (status === 204) finish?.()
    else fail?.(new ApiError(status))
    await expect(pending).rejects.toThrow()
    expect(admin.session?.token).toBe('new-session')
    expect(admin.notice).toBe('')
    expect(admin.forbidden).toBe(0)
  })
  it('当前401清会话，未登录不发送改密', async () => {
    const admin = useAdminStore()
    const input = { current_password: '合成旧', new_password: '合成新' }
    await expect(admin.changePassword(input, 'key')).rejects.toMatchObject({ status: 401 })
    expect(service.changeAdminPassword).not.toHaveBeenCalled()
    admin.session = session
    vi.mocked(service.changeAdminPassword).mockRejectedValueOnce(new ApiError(401))
    await expect(admin.changePassword(input, 'key')).rejects.toMatchObject({ status: 401 })
    expect(admin.authenticated).toBe(false)
  })
})

describe('B07 revision 1 后台角色快照消费', () => {
  it('403停止且不推导角色，只有显式重登替换菜单角色，401清除角色快照', async () => {
    const admin = useAdminStore()
    vi.mocked(service.loginAdmin).mockResolvedValue(session)
    await admin.login({ login_name: 'synthetic', password: '合成' })
    vi.mocked(service.adminRequest).mockRejectedValueOnce(new ApiError(403))
    await expect(admin.request('/admin/accounts')).rejects.toMatchObject({ status: 403 })
    expect(service.adminRequest).toHaveBeenCalledTimes(1)
    expect(admin.session?.account.roles).toEqual(['review_operator'])
    expect(admin.can('super_admin')).toBe(false)
    expect(admin.authenticated).toBe(true)
    vi.mocked(service.loginAdmin).mockResolvedValue({
      ...session,
      token: 'new-synthetic',
      account: { ...session.account, roles: ['crisis_operator'] },
    })
    await admin.login({ login_name: 'synthetic', password: '合成' })
    expect(admin.can('review_operator')).toBe(false)
    expect(admin.can('crisis_operator')).toBe(true)
    vi.mocked(service.adminRequest).mockRejectedValueOnce(new ApiError(401))
    await expect(admin.request('/admin/accounts')).rejects.toMatchObject({ status: 401 })
    expect(admin.session).toBeNull()
    expect(admin.can('crisis_operator')).toBe(false)
  })
})
