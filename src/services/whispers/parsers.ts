import type * as T from '@/types/whispers'

import { object, text, integer, boolean, choice, array, empty, literal } from './boundary'

export function parseContentControl(value: unknown): T.ContentControl {
  const data = object(value, ['source', 'version', 'restricted', 'state', 'allowed_actions'])
  return {
    source: parseContentRef(data['source']),
    version: integer(data['version'], 1),
    restricted: boolean(data['restricted']),
    state: choice(data['state'], [
      'draft',
      'scanning',
      'review_pending',
      'published',
      'rejected',
      'withdrawn',
      'cancelled',
      'restricted',
      'isolated',
      'privacy_hold',
      'context_changed',
      'approved',
      'locked',
      'unlocked',
      'deleted',
    ]),
    allowed_actions: array(
      data['allowed_actions'],
      (item) => choice(item, ['whisperAdminPenaltyCreate', 'whisperAdminRestrictionSet']),
      true,
    ),
  }
}

export function parseContentRef(value: unknown): T.ContentRef {
  const data = object(value, ['kind', 'id', 'content_version'])
  return {
    kind: choice(data['kind'], [
      'whisper_post',
      'whisper_comment',
      'whisper_nickname',
      'whisper_capsule',
    ]),
    id: text(data['id'], {
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      format: 'uuid',
    }),
    content_version: integer(data['content_version'], 1),
  }
}

export function parseCrisisCommand(value: unknown): T.CrisisCommand {
  const data = object(value, ['expected_version', 'action', 'reason'])
  return {
    expected_version: integer(data['expected_version'], 1),
    action: choice(data['action'], ['take_over', 'follow_up', 'resolve', 'retry_notification']),
    reason: text(data['reason'], { minLength: 1, maxLength: 500, pattern: '\\S' }),
  }
}

export function parseCrisisDetail(value: unknown): T.CrisisDetail {
  const data = object(value, [
    'id',
    'version',
    'source',
    'status',
    'handoff_at',
    'allowed_actions',
    'body',
    'student_number',
    'identity_status',
    'evidence_scope_id',
    'timeline',
    'care_delivery',
    'staff_delivery',
  ])
  return {
    id: text(data['id'], {
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      format: 'uuid',
    }),
    version: integer(data['version'], 1),
    source: parseContentRef(data['source']),
    status: choice(data['status'], ['open', 'in_progress', 'resolved', 'false_positive']),
    handoff_at: text(data['handoff_at'], {
      pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      format: 'date-time',
    }),
    allowed_actions: array(
      data['allowed_actions'],
      (item) => choice(item, ['whisperAdminCrisisAct', 'whisperAdminCrisisFalsePositive']),
      true,
    ),
    body: text(data['body'], { minLength: 1, maxLength: 500, pattern: '\\S' }),
    student_number: data['student_number'] === null ? null : text(data['student_number'], {}),
    identity_status: choice(data['identity_status'], ['verified', 'not_verified']),
    evidence_scope_id: text(data['evidence_scope_id'], {
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      format: 'uuid',
    }),
    timeline: array(data['timeline'], (item) => parseTimelineEntry(item), false),
    care_delivery: choice(data['care_delivery'], ['pending', 'delivered', 'cancelled']),
    staff_delivery: choice(data['staff_delivery'], ['pending', 'delivered', 'cancelled']),
  }
}

export function parseCrisisSummary(value: unknown): T.CrisisSummary {
  const data = object(value, ['id', 'version', 'source', 'status', 'handoff_at', 'allowed_actions'])
  return {
    id: text(data['id'], {
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      format: 'uuid',
    }),
    version: integer(data['version'], 1),
    source: parseContentRef(data['source']),
    status: choice(data['status'], ['open', 'in_progress', 'resolved', 'false_positive']),
    handoff_at: text(data['handoff_at'], {
      pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      format: 'date-time',
    }),
    allowed_actions: empty(data['allowed_actions']),
  }
}

export function parseCrisisSummaryPage(value: unknown): T.CrisisSummaryPage {
  const data = object(value, ['items', 'next_cursor'])
  return {
    items: array(data['items'], (item) => parseCrisisSummary(item), false),
    next_cursor:
      data['next_cursor'] === null
        ? null
        : text(data['next_cursor'], { minLength: 1, maxLength: 4096 }),
  }
}

export function parseDeletionJob(value: unknown): T.DeletionJob {
  const data = object(value, ['id', 'status', 'scope', 'allowed_actions'])
  return {
    id: text(data['id'], {
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      format: 'uuid',
    }),
    status: choice(data['status'], ['processing', 'completed']),
    scope: literal(data['scope'], 'evidence'),
    allowed_actions: empty(data['allowed_actions']),
  }
}

export function parseError(value: unknown): T.Error {
  const data = object(value, ['code', 'message', 'error_code', 'request_id', 'retry_after_seconds'])
  return {
    code: integer(data['code'], 1),
    message: text(data['message'], {}),
    error_code: choice(data['error_code'], [
      'VALIDATION_FAILED',
      'UNAUTHENTICATED',
      'VERIFICATION_REQUIRED',
      'FORBIDDEN',
      'NOT_FOUND',
      'VERSION_CONFLICT',
      'STATE_CONFLICT',
      'IDEMPOTENCY_CONFLICT',
      'INTERACTION_UNAVAILABLE',
      'DICTIONARY_CHANGED',
      'MODE_UNAVAILABLE',
      'NICKNAME_NOT_READY',
      'UNLOCK_TIME_INVALID',
      'CAPSULE_LIMIT',
      'RATE_LIMITED',
      'DEPENDENCY_UNAVAILABLE',
      'MODULE_UNAVAILABLE',
      'CLIENT_UPGRADE_REQUIRED',
      'INTERNAL_ERROR',
    ]),
    request_id: text(data['request_id'], {}),
    ...(data['retry_after_seconds'] === undefined
      ? {}
      : { retry_after_seconds: integer(data['retry_after_seconds'], 0) }),
  }
}

export function parseEvidenceDelete(value: unknown): T.EvidenceDelete {
  const data = object(value, ['expected_version', 'confirmation', 'reason'])
  return {
    expected_version: integer(data['expected_version'], 1),
    confirmation: literal(data['confirmation'], 'DELETE_EVIDENCE_SCOPE'),
    reason: text(data['reason'], { minLength: 1, maxLength: 500, pattern: '\\S' }),
  }
}

export function parseEvidenceScope(value: unknown): T.EvidenceScope {
  const data = object(value, ['id', 'version', 'state', 'allowed_actions'])
  return {
    id: text(data['id'], {
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      format: 'uuid',
    }),
    version: integer(data['version'], 1),
    state: choice(data['state'], ['retained', 'deleting']),
    allowed_actions: array(
      data['allowed_actions'],
      (item) => choice(item, ['whisperAdminEvidenceDelete']),
      true,
    ),
  }
}

export function parsePenaltyCommand(value: unknown): T.PenaltyCommand {
  const data = object(value, [
    'expected_version',
    'report_id',
    'expected_report_version',
    'level',
    'reason',
  ])
  return {
    expected_version: integer(data['expected_version'], 1),
    report_id: text(data['report_id'], {
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      format: 'uuid',
    }),
    expected_report_version: integer(data['expected_report_version'], 1),
    level: choice(data['level'], ['minor', 'general', 'severe']),
    reason: text(data['reason'], { minLength: 1, maxLength: 500, pattern: '\\S' }),
  }
}

export function parsePenaltyResult(value: unknown): T.PenaltyResult {
  const data = object(value, ['id', 'kind', 'ends_at'])
  return {
    id: text(data['id'], {
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      format: 'uuid',
    }),
    kind: choice(data['kind'], ['warning', 'mute', 'ban']),
    ends_at:
      data['ends_at'] === null
        ? null
        : text(data['ends_at'], {
            pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
            format: 'date-time',
          }),
  }
}

export function parseReasonCommand(value: unknown): T.ReasonCommand {
  const data = object(value, ['expected_version', 'reason'])
  return {
    expected_version: integer(data['expected_version'], 1),
    reason: text(data['reason'], { minLength: 1, maxLength: 500, pattern: '\\S' }),
  }
}

export function parseReportDecision(value: unknown): T.ReportDecision {
  const data = object(value, ['expected_version', 'decision', 'reason'])
  return {
    expected_version: integer(data['expected_version'], 1),
    decision: choice(data['decision'], ['confirmed', 'dismissed']),
    reason: text(data['reason'], { minLength: 1, maxLength: 500, pattern: '\\S' }),
  }
}

export function parseReportDetail(value: unknown): T.ReportDetail {
  const data = object(value, [
    'id',
    'version',
    'source',
    'status',
    'created_at',
    'allowed_actions',
    'type_code',
    'description',
    'body',
  ])
  return {
    id: text(data['id'], {
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      format: 'uuid',
    }),
    version: integer(data['version'], 1),
    source: parseContentRef(data['source']),
    status: choice(data['status'], ['pending', 'confirmed', 'dismissed']),
    created_at: text(data['created_at'], {
      pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      format: 'date-time',
    }),
    allowed_actions: array(
      data['allowed_actions'],
      (item) => choice(item, ['whisperAdminReportDecide', 'whisperAdminReportEscalate']),
      true,
    ),
    type_code: text(data['type_code'], {}),
    description:
      data['description'] === null
        ? null
        : text(data['description'], { minLength: 1, maxLength: 500, pattern: '\\S' }),
    body: text(data['body'], { minLength: 1, maxLength: 500, pattern: '\\S' }),
  }
}

export function parseReportSummary(value: unknown): T.ReportSummary {
  const data = object(value, ['id', 'version', 'source', 'status', 'created_at', 'allowed_actions'])
  return {
    id: text(data['id'], {
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      format: 'uuid',
    }),
    version: integer(data['version'], 1),
    source: parseContentRef(data['source']),
    status: choice(data['status'], ['pending', 'confirmed', 'dismissed']),
    created_at: text(data['created_at'], {
      pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      format: 'date-time',
    }),
    allowed_actions: empty(data['allowed_actions']),
  }
}

export function parseReportSummaryPage(value: unknown): T.ReportSummaryPage {
  const data = object(value, ['items', 'next_cursor'])
  return {
    items: array(data['items'], (item) => parseReportSummary(item), false),
    next_cursor:
      data['next_cursor'] === null
        ? null
        : text(data['next_cursor'], { minLength: 1, maxLength: 4096 }),
  }
}

export function parseRestrictionCommand(value: unknown): T.RestrictionCommand {
  const data = object(value, ['expected_version', 'restricted', 'reason'])
  return {
    expected_version: integer(data['expected_version'], 1),
    restricted: boolean(data['restricted']),
    reason: text(data['reason'], { minLength: 1, maxLength: 500, pattern: '\\S' }),
  }
}

export function parseReviewCommand(value: unknown): T.ReviewCommand {
  const data = object(value, [
    'expected_version',
    'expected_content_version',
    'decision',
    'reason',
    'revision_suggestion',
  ])
  if (
    data['decision'] === 'rejected' &&
    (data['reason'] === undefined || data['revision_suggestion'] === undefined)
  )
    throw new Error('驳回必须填写原因和修改建议')
  return {
    expected_version: integer(data['expected_version'], 1),
    expected_content_version: integer(data['expected_content_version'], 1),
    decision: choice(data['decision'], ['approved', 'rejected']),
    ...(data['reason'] === undefined
      ? {}
      : { reason: text(data['reason'], { minLength: 1, maxLength: 500, pattern: '\\S' }) }),
    ...(data['revision_suggestion'] === undefined
      ? {}
      : {
          revision_suggestion: text(data['revision_suggestion'], {
            minLength: 1,
            maxLength: 500,
            pattern: '\\S',
          }),
        }),
  }
}

export function parseReviewDetail(value: unknown): T.ReviewDetail {
  const data = object(value, [
    'id',
    'version',
    'source',
    'status',
    'created_at',
    'allowed_actions',
    'body',
    'school_related',
    'privacy_recheck',
  ])
  return {
    id: text(data['id'], {
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      format: 'uuid',
    }),
    version: integer(data['version'], 1),
    source: parseContentRef(data['source']),
    status: choice(data['status'], ['pending', 'approved', 'rejected', 'cancelled']),
    created_at: text(data['created_at'], {
      pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      format: 'date-time',
    }),
    allowed_actions: array(
      data['allowed_actions'],
      (item) => choice(item, ['whisperAdminReviewDecide', 'whisperAdminReviewEscalate']),
      true,
    ),
    body: text(data['body'], { minLength: 1, maxLength: 500, pattern: '\\S' }),
    school_related: boolean(data['school_related']),
    privacy_recheck: boolean(data['privacy_recheck']),
  }
}

export function parseReviewOutcome(value: unknown): T.ReviewOutcome {
  const data = object(value, ['id', 'version', 'content_decision', 'business_outcome'])
  return {
    id: text(data['id'], {
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      format: 'uuid',
    }),
    version: integer(data['version'], 1),
    content_decision: choice(data['content_decision'], ['approved', 'rejected']),
    business_outcome: choice(data['business_outcome'], [
      'published',
      'nickname_activated',
      'capsule_locked',
      'capsule_unlocked',
      'cancelled',
      'rejected',
      'privacy_review_required',
    ]),
  }
}

export function parseReviewSummary(value: unknown): T.ReviewSummary {
  const data = object(value, ['id', 'version', 'source', 'status', 'created_at', 'allowed_actions'])
  return {
    id: text(data['id'], {
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      format: 'uuid',
    }),
    version: integer(data['version'], 1),
    source: parseContentRef(data['source']),
    status: choice(data['status'], ['pending', 'approved', 'rejected', 'cancelled']),
    created_at: text(data['created_at'], {
      pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      format: 'date-time',
    }),
    allowed_actions: empty(data['allowed_actions']),
  }
}

export function parseReviewSummaryPage(value: unknown): T.ReviewSummaryPage {
  const data = object(value, ['items', 'next_cursor'])
  return {
    items: array(data['items'], (item) => parseReviewSummary(item), false),
    next_cursor:
      data['next_cursor'] === null
        ? null
        : text(data['next_cursor'], { minLength: 1, maxLength: 4096 }),
  }
}

export function parseTimelineEntry(value: unknown): T.TimelineEntry {
  const data = object(value, ['at', 'action', 'operator_label', 'reason'])
  return {
    at: text(data['at'], {
      pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      format: 'date-time',
    }),
    action: text(data['action'], {}),
    operator_label: text(data['operator_label'], {}),
    reason:
      data['reason'] === null
        ? null
        : text(data['reason'], { minLength: 1, maxLength: 500, pattern: '\\S' }),
  }
}
