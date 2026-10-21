import { ApiError } from './admin'
import { isRole, record } from '@/types/admin'
import type { AdminAccount, Role } from '@/types/admin'
import type { AccountInput, AccountPage, AccountsClient, RolesInput } from '@/types/accounts'

/** 只保留账号公开管理字段，不将额外口令或令牌放入页面状态；停用账号仍可列出。 */
export function parseAccount(value: unknown): AdminAccount {
  if (
    !record(value) ||
    typeof value['id'] !== 'string' ||
    !value['id'].trim() ||
    typeof value['login_name'] !== 'string' ||
    !value['login_name'].trim() ||
    typeof value['version'] !== 'number' ||
    !Number.isSafeInteger(value['version']) ||
    value['version'] < 1 ||
    typeof value['active'] !== 'boolean' ||
    !Array.isArray(value['roles']) ||
    !value['roles'].every(isRole)
  )
    throw new Error('后台账号响应格式不符合契约')
  return {
    id: value['id'],
    login_name: value['login_name'],
    version: value['version'],
    active: value['active'],
    roles: [...value['roles']],
  }
}
export function parseAccountPage(value: unknown): AccountPage {
  if (
    !record(value) ||
    !Array.isArray(value['items']) ||
    (value['next_cursor'] !== null && typeof value['next_cursor'] !== 'string')
  )
    throw new Error('后台账号分页响应格式不符合契约')
  return { items: value['items'].map(parseAccount), next_cursor: value['next_cursor'] }
}
function commandRoles(roles: Role[], reason: string, key: string) {
  if (!Array.isArray(roles) || !roles.every(isRole) || !reason.trim() || !key.trim())
    throw new Error('请填写有效角色、操作理由和操作标识')
  return [...new Set(roles)]
}

/** 令牌由进入页面时的后台会话注入，禁止从列表选择操作者身份。 */
export function createAccountsClient(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch = fetch,
): AccountsClient {
  function guard(signal: AbortSignal) {
    signal.throwIfAborted()
    if (!token.trim()) throw new ApiError(401)
    if (!allowed()) throw new ApiError(403)
  }
  async function request(url: string, status: number, signal: AbortSignal, init: RequestInit = {}) {
    guard(signal)
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const response = await transport(url, {
      ...init,
      headers,
      signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    })
    guard(signal)
    if (response.status !== status) throw new ApiError(response.status)
    const value: unknown = await response.json()
    guard(signal)
    if (
      !record(value) ||
      value['code'] !== 0 ||
      typeof value['message'] !== 'string' ||
      typeof value['request_id'] !== 'string' ||
      !('data' in value)
    )
      throw new Error('后台账号响应封装不符合契约')
    return value['data']
  }
  return {
    async list(cursor, signal) {
      const query = new URLSearchParams({ limit: '20' })
      if (cursor !== null) query.set('cursor', cursor)
      return parseAccountPage(await request(`/api/v1/admin/accounts?${query}`, 200, signal))
    },
    async create(input: AccountInput, key, signal) {
      const roles = commandRoles(input.roles, input.reason, key)
      if (!input.login_name.trim()) throw new Error('请填写后台账号名')
      return parseAccount(
        await request('/api/v1/admin/accounts', 201, signal, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
          body: JSON.stringify({ login_name: input.login_name, roles, reason: input.reason }),
        }),
      )
    },
    async replaceRoles(id, input: RolesInput, key, signal) {
      const roles = commandRoles(input.roles, input.reason, key)
      if (
        !id.trim() ||
        id === '.' ||
        id === '..' ||
        !Number.isSafeInteger(input.expected_version) ||
        input.expected_version < 1
      )
        throw new Error('缺少有效账号标识或目标版本')
      const result = parseAccount(
        await request(`/api/v1/admin/accounts/${encodeURIComponent(id)}/roles`, 200, signal, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
          body: JSON.stringify({
            roles,
            reason: input.reason,
            expected_version: input.expected_version,
          }),
        }),
      )
      if (result.id !== id) throw new Error('账号响应与修改目标不匹配')
      return result
    },
  }
}
