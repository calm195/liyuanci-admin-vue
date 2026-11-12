import type { ContentImage } from '@/services/content-images'
import type { WordlistEvidence } from './wordlists'

export interface ModerationSummary {
  id: string
  version: number
  status: string
  kind?: string
  content_version?: number
}
export interface ModerationCase {
  images?: ContentImage[]
  title?: string
  reward_text?: string
  id: string
  version: number
  content_version: number
  body: string
  status: string
  school_related?: boolean
  wordlist_evidence?: WordlistEvidence
}
export interface CursorPage<T> {
  items: T[]
  next_cursor: string | null
}
export type ReviewDecision =
  | { decision: 'approved'; expected_version: number }
  | { decision: 'rejected'; expected_version: number; reason: string; revision_suggestion: string }
export const businessOutcomes = [
  'published',
  'delivered',
  'cancelled',
  'privacy_review_required',
  'pending_review',
  'ready',
  'expired',
  'active',
] as const
export type BusinessOutcome = (typeof businessOutcomes)[number]
export interface ModerationOutcome {
  content_decision: 'approved' | 'rejected'
  business_outcome: BusinessOutcome
  version: number
}
export interface ModerationFilters {
  q: string
  status: 'human_required' | 'all' | 'approved' | 'rejected'
  kind: '' | 'wish' | 'application' | 'message' | 'story' | 'wish_comment'
}

export interface ModerationClient {
  list(
    cursor: string | null,
    signal: AbortSignal,
    filters?: ModerationFilters,
  ): Promise<CursorPage<ModerationSummary>>
  detail(id: string, signal: AbortSignal): Promise<ModerationCase>
  decide(
    id: string,
    input: ReviewDecision,
    key: string,
    signal: AbortSignal,
  ): Promise<ModerationOutcome>
}
