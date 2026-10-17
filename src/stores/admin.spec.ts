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
