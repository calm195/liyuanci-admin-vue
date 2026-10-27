/** 来自 whispers/1.0.0 固定契约的后台独立投影。 */

export interface ContentControl {
  source: ContentRef
  version: number
  restricted: boolean
  state:
    | 'draft'
    | 'scanning'
    | 'review_pending'
    | 'published'
    | 'rejected'
    | 'withdrawn'
    | 'cancelled'
    | 'restricted'
    | 'isolated'
    | 'privacy_hold'
    | 'context_changed'
    | 'approved'
    | 'locked'
    | 'unlocked'
    | 'deleted'
  allowed_actions: ('whisperAdminPenaltyCreate' | 'whisperAdminRestrictionSet')[]
}

export interface ContentRef {
  kind: 'whisper_post' | 'whisper_comment' | 'whisper_nickname' | 'whisper_capsule'
  id: string
  content_version: number
}

export interface CrisisCommand {
  expected_version: number
  action: 'take_over' | 'follow_up' | 'resolve' | 'retry_notification'
  reason: string
}

export interface CrisisDetail {
  id: string
  version: number
  source: ContentRef
  status: 'open' | 'in_progress' | 'resolved' | 'false_positive'
  handoff_at: string
  allowed_actions: ('whisperAdminCrisisAct' | 'whisperAdminCrisisFalsePositive')[]
  body: string
  student_number: string | null
  identity_status: 'verified' | 'not_verified'
  evidence_scope_id: string
  timeline: TimelineEntry[]
  care_delivery: 'pending' | 'delivered' | 'cancelled'
  staff_delivery: 'pending' | 'delivered' | 'cancelled'
}

export interface CrisisSummary {
  id: string
  version: number
  source: ContentRef
  status: 'open' | 'in_progress' | 'resolved' | 'false_positive'
  handoff_at: string
  allowed_actions: never[]
}

export interface CrisisSummaryPage {
  items: CrisisSummary[]
  next_cursor: string | null
}

export interface DeletionJob {
  id: string
  status: 'processing' | 'completed'
  scope: 'evidence'
  allowed_actions: never[]
}

export interface Error {
  code: number
  message: string
  error_code:
    | 'VALIDATION_FAILED'
    | 'UNAUTHENTICATED'
    | 'VERIFICATION_REQUIRED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'VERSION_CONFLICT'
    | 'STATE_CONFLICT'
    | 'IDEMPOTENCY_CONFLICT'
    | 'INTERACTION_UNAVAILABLE'
    | 'DICTIONARY_CHANGED'
    | 'MODE_UNAVAILABLE'
    | 'NICKNAME_NOT_READY'
    | 'UNLOCK_TIME_INVALID'
    | 'CAPSULE_LIMIT'
    | 'RATE_LIMITED'
    | 'DEPENDENCY_UNAVAILABLE'
    | 'MODULE_UNAVAILABLE'
    | 'CLIENT_UPGRADE_REQUIRED'
    | 'INTERNAL_ERROR'
  request_id: string
  retry_after_seconds?: number
}

export interface EvidenceDelete {
  expected_version: number
  confirmation: 'DELETE_EVIDENCE_SCOPE'
  reason: string
}

export interface EvidenceScope {
  id: string
  version: number
  state: 'retained' | 'deleting'
  allowed_actions: 'whisperAdminEvidenceDelete'[]
}

export interface PenaltyCommand {
  expected_version: number
  report_id: string
  expected_report_version: number
  level: 'minor' | 'general' | 'severe'
  reason: string
}

export interface PenaltyResult {
  id: string
  kind: 'warning' | 'mute' | 'ban'
  ends_at: string | null
}

export interface ReasonCommand {
  expected_version: number
  reason: string
}

export interface ReportDecision {
  expected_version: number
  decision: 'confirmed' | 'dismissed'
  reason: string
}

export interface ReportDetail {
  id: string
  version: number
  source: ContentRef
  status: 'pending' | 'confirmed' | 'dismissed'
  created_at: string
  allowed_actions: ('whisperAdminReportDecide' | 'whisperAdminReportEscalate')[]
  type_code: string
  description: string | null
  body: string
}

export interface ReportSummary {
  id: string
  version: number
  source: ContentRef
  status: 'pending' | 'confirmed' | 'dismissed'
  created_at: string
  allowed_actions: never[]
}

export interface ReportSummaryPage {
  items: ReportSummary[]
  next_cursor: string | null
}

export interface RestrictionCommand {
  expected_version: number
  restricted: boolean
  reason: string
}

export interface ReviewCommand {
  expected_version: number
  expected_content_version: number
  decision: 'approved' | 'rejected'
  reason?: string
  revision_suggestion?: string
}

export interface ReviewDetail {
  id: string
  version: number
  source: ContentRef
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  created_at: string
  allowed_actions: ('whisperAdminReviewDecide' | 'whisperAdminReviewEscalate')[]
  body: string
  school_related: boolean
  privacy_recheck: boolean
}

export interface ReviewOutcome {
  id: string
  version: number
  content_decision: 'approved' | 'rejected'
  business_outcome:
    | 'published'
    | 'nickname_activated'
    | 'capsule_locked'
    | 'capsule_unlocked'
    | 'cancelled'
    | 'rejected'
    | 'privacy_review_required'
}

export interface ReviewSummary {
  id: string
  version: number
  source: ContentRef
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  created_at: string
  allowed_actions: never[]
}

export interface ReviewSummaryPage {
  items: ReviewSummary[]
  next_cursor: string | null
}

export interface TimelineEntry {
  at: string
  action: string
  operator_label: string
  reason: string | null
}
