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
/** 仅向同源后台路径发送请求，不携带浏览器会话凭据或学生令牌。 */
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
  // 模拟令牌不得发送至真实接口。
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
/** 后台身份方案尚未接入，仅提供开发环境的模拟登录。 */
export function loginAdmin(role: Role): AdminSession {
  if (!mockEnabled) throw new Error('后台身份提供方尚未接入，真实登录待联调')
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
