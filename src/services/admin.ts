import { parseAdminSession, adminLoginInput, adminPasswordInput } from '@/types/admin'
import type {
  AdminSession,
  AdminLoginInput,
  AdminPasswordInput,
  AdminAccount,
  Role,
} from '@/types/admin'

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
let fixture: { input: AdminLoginInput; account: AdminAccount; tokens: Set<string> } | null = null
/** 仅为本次开发演示生成临时虚构凭据，不是账号创建接口或真实授权来源。 */
export function createSyntheticCredentials(role: Role): AdminLoginInput {
  if (!mockEnabled) throw new ApiError(503)
  const input = { login_name: `synthetic-${crypto.randomUUID()}`, password: crypto.randomUUID() }
  fixture = {
    input: { ...input },
    account: {
      id: 'synthetic-account',
      login_name: input.login_name,
      version: 1,
      roles: [role],
      active: true,
    },
    tokens: new Set(),
  }
  return input
}
/** 真实登录尚未接线；合成分支验证临时凭据，角色仅由夹具账号返回。 */
export async function loginAdmin(
  input: AdminLoginInput,
  signal?: AbortSignal,
): Promise<AdminSession> {
  if (!mockEnabled) throw new ApiError(503)
  const command = adminLoginInput(input)
  await Promise.resolve()
  signal?.throwIfAborted()
  if (
    !fixture ||
    fixture.input.login_name !== command.login_name ||
    fixture.input.password !== command.password
  )
    throw new ApiError(401)
  const token = `synthetic-${crypto.randomUUID()}`
  fixture.tokens.add(token)
  return parseAdminSession({
    code: 0,
    message: '合成会话',
    request_id: 'synthetic',
    data: { token, account: fixture.account },
  })
}
/** 合成撤销仅验证本进程场景，不代表后端密码摘要、跨进程撤销或审计已经生效。 */
export async function changeAdminPassword(
  token: string,
  input: AdminPasswordInput,
  key: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!mockEnabled) throw new ApiError(503)
  const command = adminPasswordInput(input)
  if (!key.trim()) throw new ApiError(400)
  await Promise.resolve()
  signal?.throwIfAborted()
  if (!fixture || !fixture.tokens.has(token)) throw new ApiError(401)
  if (fixture.input.password !== command.current_password) throw new ApiError(403)
  fixture.input.password = command.new_password
  fixture.tokens.clear()
}
export async function revokeAdmin(token: string): Promise<void> {
  if (mockEnabled) {
    fixture?.tokens.delete(token)
    return
  }
  await adminRequest('/admin/session', token, { method: 'DELETE' })
}
