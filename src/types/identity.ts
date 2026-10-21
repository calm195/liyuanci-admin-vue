export interface IdentitySummary {
  id: string
  version: number
  status: string
}
export interface IdentityPage {
  items: IdentitySummary[]
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
  list(cursor: string | null, signal: AbortSignal): Promise<IdentityPage>
  detail(id: string, signal: AbortSignal): Promise<IdentityCase>
  card(id: string, signal: AbortSignal): Promise<Blob>
  decide(
    id: string,
    input: IdentityDecision,
    key: string,
    signal: AbortSignal,
  ): Promise<IdentityReceipt>
}
