import { ApiError } from './admin'
import { adminLoginInput, adminPasswordInput, parseAdminSession } from '@/types/admin'
import type { AdminLoginInput, AdminPasswordInput } from '@/types/admin'

/** 显式注入传输用于后台身份协议；运行时仅由隔离模式接线。 */
export function createAdminAuthTransport(transport: typeof fetch) {
  return {
    async login(input: AdminLoginInput, signal?: AbortSignal) {
      const response = await transport('/api/v1/admin/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminLoginInput(input)),
        signal: signal ?? null,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      })
      if (response.status !== 200) throw new ApiError(response.status)
      return parseAdminSession(await response.json())
    },
    async password(token: string, input: AdminPasswordInput, key: string, signal?: AbortSignal) {
      if (!token.trim() || !key.trim()) throw new Error('缺少会话或操作标识')
      const response = await transport('/api/v1/admin/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': key,
        },
        body: JSON.stringify(adminPasswordInput(input)),
        signal: signal ?? null,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      })
      if (response.status !== 204) throw new ApiError(response.status)
    },
  }
}
