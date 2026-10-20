/** 后台角色独立于学生会话，禁止接受学生身份。 */
export const roles = ['review_operator', 'crisis_operator', 'super_admin'] as const
export type Role = (typeof roles)[number]
export interface AdminAccount {
  id: string
  version: number
  roles: Role[]
  active: boolean
}
export interface AdminSession {
  token: string
  account: AdminAccount
}
export function isRole(value: unknown): value is Role {
  return roles.some((role) => role === value)
}
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
/** 仅提取后台会话所需的非敏感字段，拒绝学生会话及格式异常的响应。 */
export function parseAdminSession(value: unknown): AdminSession {
  if (
    !record(value) ||
    value['code'] !== 0 ||
    typeof value['message'] !== 'string' ||
    typeof value['request_id'] !== 'string' ||
    !record(value['data'])
  )
    throw new Error('后台响应格式不符合契约')
  const { token, account } = value['data']
  if (
    typeof token !== 'string' ||
    !token.trim() ||
    !record(account) ||
    typeof account['id'] !== 'string' ||
    !account['id'] ||
    typeof account['version'] !== 'number' ||
    !Number.isInteger(account['version']) ||
    account['version'] < 1 ||
    typeof account['active'] !== 'boolean' ||
    !Array.isArray(account['roles']) ||
    !account['roles'].every(isRole)
  )
    throw new Error('后台会话格式不符合契约')
  if (!account['active']) throw new Error('后台账号不可用')
  return {
    token,
    account: {
      id: account['id'],
      version: account['version'],
      active: account['active'],
      roles: [...account['roles']],
    },
  }
}
