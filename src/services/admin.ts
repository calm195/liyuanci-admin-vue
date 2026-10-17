import { parseAdminSession } from '@/types/admin'
import type { AdminSession, Role } from '@/types/admin'

export const mockEnabled = import.meta.env.DEV && import.meta.env.VITE_ADMIN_MOCK === 'true'
export class ApiError extends Error {
  constructor(public status: number) {
    super(
      status === 401
        ? '会话已失效，请重新登录'
        : status === 403
          ? '没有此操作权限'
          : status === 503
            ? '服务暂不可用，请稍后重试'
            : '请求未完成，请稍后重试',
    )
  }
}
/** T010 · REQ-018/019. Only admin paths, same-origin, no cookie/student token. */
export async function adminRequest(
  path: `/admin/${string}`,
  token: string,
  init: RequestInit = {},
  transport: typeof fetch = fetch,
): Promise<unknown> {
  if (
    !path.startsWith('/admin/') ||
    path.includes('?') ||
    path.includes('#') ||
    path.includes('..')
  )
    throw new Error('非法后台路径')
  // Mock must never transmit its synthetic token to a real endpoint.
  if (mockEnabled) throw new ApiError(503)
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.method && init.method !== 'GET') headers.set('Idempotency-Key', crypto.randomUUID())
  const response = await transport(`/api/v1${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
  })
  if (!response.ok) throw new ApiError(response.status)
  return response.status === 204 ? undefined : response.json()
}
/** D02 blocks real credential exchange. No invented password/SSO payload. */
export function loginAdmin(role: Role): AdminSession {
  if (!mockEnabled) throw new Error('后台身份提供方尚未接入（D02），真实登录待联调')
  return parseAdminSession({
    code: 0,
    message: '合成 Mock',
    request_id: 'synthetic',
    data: {
      token: 'synthetic-admin-session',
      account: { id: 'synthetic-account', version: 1, roles: [role], active: true },
    },
  })
}
export async function revokeAdmin(token: string): Promise<void> {
  if (mockEnabled) return
  await adminRequest('/admin/session', token, { method: 'DELETE' })
}
