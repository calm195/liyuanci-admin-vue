import type { Role } from './admin'
export const userRoles: readonly Role[] = ['review_operator', 'crisis_operator', 'super_admin']
export const verifications = ['unverified', 'pending', 'verified', 'rejected'] as const
export const restrictions = ['normal', 'muted', 'banned'] as const
export const userActions = [
  'view_penalties',
  'open_case_workspace',
  'open_appeal_workspace',
] as const
export type Verification = (typeof verifications)[number]
export type Restriction = (typeof restrictions)[number]
export interface UserFilters {
  user_id: string
  nickname: string
  verification: '' | Verification
  restriction: '' | Restriction
  limit: number
}
export interface UserSummary {
  id: string
  display_name: string | null
  verification: Verification
  restriction: Restriction
  muted_until: string | null
  created_at: string
  as_of: string
}
export interface ActivePenalty {
  id: string
  kind: 'mute' | 'ban'
  starts_at: string
  ends_at: string | null
}
export interface UserDetail extends UserSummary {
  account_version: number
  active_penalties: ActivePenalty[]
  allowed_actions: (typeof userActions)[number][]
}
export interface UserPenalty {
  id: string
  level: 'minor' | 'general' | 'severe'
  kind: 'warning' | 'mute' | 'ban'
  status: 'active' | 'expired' | 'revoked'
  starts_at: string
  ends_at: string | null
  revoked_at: string | null
  reason: string | null
  case_link: { kind: 'ordinary_report' | 'ordinary_review'; id: string } | null
  appeal_id: string | null
}
export interface UserPage<T> {
  items: T[]
  next_cursor: string | null
}
export interface UsersClient {
  restrictions(id: string, signal: AbortSignal): Promise<UserRestrictionState>
  changeRestriction(
    id: string,
    action: UserRestrictionAction,
    input: { reason: string; expected_version: number },
    key: string,
    signal: AbortSignal,
  ): Promise<UserRestrictionState>
  users(
    filters: UserFilters,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<UserPage<UserSummary>>
  user(id: string, signal: AbortSignal): Promise<UserDetail>
  userPenalties(
    id: string,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<UserPage<UserPenalty>>
}

export const restrictionActions = ['ban', 'unban', 'mute', 'unmute'] as const
export type UserRestrictionAction = (typeof restrictionActions)[number]
export interface UserRestrictionState {
  user_id: string
  account_version: number
  banned: boolean
  muted: boolean
  muted_until: string | null
  as_of: string
  allowed_actions: UserRestrictionAction[]
}
