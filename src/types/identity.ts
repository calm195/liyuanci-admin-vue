export interface IdentitySummary {
  id: string
  version: number
  status: string
}
export type IdentityListView = 'pending' | 'history'
export interface IdentityListItem {
  id: string
  name: string
  student_number: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_at: string | null
}
export interface IdentityPage {
  items: IdentityListItem[]
  next_cursor: string | null
}
export interface IdentityCase extends IdentitySummary {
  name: string
  student_number: string
  asset_id: string
}
export type IdentityDecision =
  | { decision: 'approved'; expected_version: number }
  | {
      decision: 'rejected'
      expected_version: number
      reason: string
      revision_suggestion: string
    }
export interface IdentityReceipt {
  request_id: string
  version: number
  status: 'pending' | 'approved' | 'rejected'
  reason?: string
  revision_suggestion?: string
}
export interface IdentityReviewClient {
  list(cursor: string | null, signal: AbortSignal, view: IdentityListView): Promise<IdentityPage>
  detail(id: string, signal: AbortSignal): Promise<IdentityCase>
  card(id: string, signal: AbortSignal): Promise<Blob>
  decide(
    id: string,
    input: IdentityDecision,
    key: string,
    signal: AbortSignal,
  ): Promise<IdentityReceipt>
}
