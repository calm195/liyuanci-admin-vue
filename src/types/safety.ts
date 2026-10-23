import type { CursorPage } from './moderation'

export const safetyRoles = ['review_operator', 'crisis_operator', 'super_admin'] as const
export const contentKinds = ['wish', 'application', 'message', 'story'] as const
export type ContentKind = (typeof contentKinds)[number]
export const penaltyLevels = ['minor', 'general', 'severe'] as const
export type PenaltyLevel = (typeof penaltyLevels)[number]
export type ReportDecision = 'confirmed' | 'dismissed'
export type AppealDecision = 'uphold' | 'revoke'
export interface SafetySummary {
  id: string
  version: number
  status: string
  kind?: ContentKind
  content_version?: number
}
export interface ReportDetail extends SafetySummary {
  target_kind: ContentKind
  target_id: string
  type_code: string
  content_ref: string
  content_version: number
  subject_id: string
  body: string
  description: string
  reason: string | null
}
export interface AppealDetail extends SafetySummary {
  penalty_id: string
  body: string
  penalty_reason: string
  reason: string | null
}
export interface ReasonInput {
  expected_version: number
  reason: string
}
export interface ReportDecisionInput extends ReasonInput {
  decision: ReportDecision
}
export interface AppealDecisionInput extends ReasonInput {
  decision: AppealDecision
}
export interface PenaltyInput extends ReasonInput {
  violation_ref: string
  content_ref: string
  content_version: number
  level: PenaltyLevel
}
export type RestrictionAction = 'offline' | 'release-restriction'
export interface SafetyClient {
  reports(cursor: string | null, signal: AbortSignal): Promise<CursorPage<SafetySummary>>
  report(id: string, signal: AbortSignal): Promise<ReportDetail>
  decideReport(
    id: string,
    input: ReportDecisionInput,
    key: string,
    signal: AbortSignal,
  ): Promise<SafetySummary>
  penalize(
    subjectId: string,
    input: PenaltyInput,
    key: string,
    signal: AbortSignal,
  ): Promise<SafetySummary>
  appeals(cursor: string | null, signal: AbortSignal): Promise<CursorPage<SafetySummary>>
  appeal(id: string, signal: AbortSignal): Promise<AppealDetail>
  decideAppeal(
    id: string,
    input: AppealDecisionInput,
    key: string,
    signal: AbortSignal,
  ): Promise<SafetySummary>
  restrict(
    kind: ContentKind,
    id: string,
    action: RestrictionAction,
    input: ReasonInput,
    key: string,
    signal: AbortSignal,
  ): Promise<SafetySummary>
}
