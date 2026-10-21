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
}))
beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
})
const session = {
  token: 'synthetic',
  account: { id: 'synthetic', version: 1, active: true, roles: ['review_operator' as const] },
}
describe('T010 REQ-018/019 会话生命周期', () => {
  it('登录完成前退出会使旧登录失败，不能恢复会话', async () => {
    vi.mocked(service.loginAdmin).mockReturnValue(session)
    const admin = useAdminStore()
    const pending = admin.login('review_operator')
    await admin.logout()
    await expect(pending).rejects.toThrow('登录操作已失效')
    expect(admin.authenticated).toBe(false)
  })
  it('重复登录仅最后一次成功，旧操作不能报告登录成功', async () => {
    vi.mocked(service.loginAdmin)
      .mockReturnValueOnce(session)
      .mockReturnValueOnce({
        token: 'new-synthetic',
        account: { ...session.account, roles: ['crisis_operator'] },
      })
    const admin = useAdminStore()
    const first = admin.login('review_operator')
    const second = admin.login('crisis_operator')
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
    vi.mocked(service.loginAdmin).mockReturnValue(session)
    await admin.login('review_operator')
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
    vi.mocked(service.loginAdmin).mockReturnValue(session)
    await admin.login('review_operator')
    fail?.(new ApiError(status))
    await expect(pending).rejects.toBeInstanceOf(ApiError)
    expect(admin.authenticated).toBe(true)
    expect(admin.forbidden).toBe(0)
    expect(admin.notice).toBe('')
  })
  it('运营无危机和超管权限，清理后全部禁入', async () => {
    vi.mocked(service.loginAdmin).mockReturnValue(session)
    const admin = useAdminStore()
    await admin.login('review_operator')
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
