import type { AdminSession, AdminLoginInput, AdminPasswordInput } from '@/types/admin'

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
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.method && init.method !== 'GET' && !headers.has('Idempotency-Key'))
    headers.set('Idempotency-Key', crypto.randomUUID())
  const response = await transport(`/api/v1${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
  })
  if (!response.ok || (path === '/admin/session' && response.status !== 204))
    throw new ApiError(response.status)
  return response.status === 204 ? undefined : response.json()
}
/** 登录结果和角色只消费服务端投影，后台会话由调用方保存在内存。 */
export async function loginAdmin(
  input: AdminLoginInput,
  signal?: AbortSignal,
): Promise<AdminSession> {
  const { createAdminAuthTransport } = await import('./admin-auth-transport')
  return createAdminAuthTransport(fetch).login(input, signal)
}
export async function changeAdminPassword(
  token: string,
  input: AdminPasswordInput,
  key: string,
  signal?: AbortSignal,
): Promise<void> {
  const { createAdminAuthTransport } = await import('./admin-auth-transport')
  return createAdminAuthTransport(fetch).password(token, input, key, signal)
}
export async function revokeAdmin(token: string): Promise<void> {
  await adminRequest('/admin/session', token, { method: 'DELETE' })
}
