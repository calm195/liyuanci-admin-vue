export interface ModerationSummary {
  id: string
  version: number
  status: string
  kind?: string
  content_version?: number
}
export interface ModerationCase {
  id: string
  version: number
  content_version: number
  body: string
  status: string
  school_related?: boolean
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
export interface ReasonCommand {
  expected_version: number
  reason: string
}
/** 合成内容目录仅服务本地演示，不属于真实案件响应或接口扩展。 */
export interface DemoContent extends ModerationSummary {
  kind: 'wish' | 'story'
  ordinary_restricted: boolean
}
export interface ModerationClient {
  list(cursor: string | null, signal: AbortSignal): Promise<CursorPage<ModerationSummary>>
  detail(id: string, signal: AbortSignal): Promise<ModerationCase>
  decide(
    id: string,
    input: ReviewDecision,
    key: string,
    signal: AbortSignal,
  ): Promise<ModerationOutcome>
  demoContents(signal: AbortSignal): Promise<DemoContent[]>
  restrict(
    kind: string,
    id: string,
    action: 'offline' | 'release-restriction',
    input: ReasonCommand,
    key: string,
    signal: AbortSignal,
  ): Promise<ModerationSummary>
}
