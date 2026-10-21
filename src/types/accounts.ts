import type { AdminAccount, Role } from './admin'
export interface AccountInput {
  login_name: string
  roles: Role[]
  reason: string
}
export interface RolesInput {
  roles: Role[]
  reason: string
  expected_version: number
}
export interface AccountPage {
  items: AdminAccount[]
  next_cursor: string | null
}
export interface AccountsClient {
  list(cursor: string | null, signal: AbortSignal): Promise<AccountPage>
  create(input: AccountInput, key: string, signal: AbortSignal): Promise<AdminAccount>
  replaceRoles(
    id: string,
    input: RolesInput,
    key: string,
    signal: AbortSignal,
  ): Promise<AdminAccount>
}
