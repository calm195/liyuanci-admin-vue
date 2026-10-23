import { reviewPage, reviewRecord, reviewText, reviewVersion } from './review-boundary'
import { businessOutcomes } from '@/types/moderation'
import type { ModerationCase, ModerationOutcome, ModerationSummary } from '@/types/moderation'

export function parseModerationSummary(value: unknown): ModerationSummary {
  const data = reviewRecord(value)
  const result: ModerationSummary = {
    id: reviewText(data['id']),
    version: reviewVersion(data['version']),
    status: reviewText(data['status']),
  }
  if (data['kind'] !== undefined) result.kind = reviewText(data['kind'])
  if (data['content_version'] !== undefined)
    result.content_version = reviewVersion(data['content_version'])
  return result
}
export function parseModerationCase(value: unknown): ModerationCase {
  const data = reviewRecord(value)
  const result: ModerationCase = {
    id: reviewText(data['id']),
    version: reviewVersion(data['version']),
    status: reviewText(data['status']),
    content_version: reviewVersion(data['content_version']),
    body: reviewText(data['body']),
  }
  if (data['school_related'] !== undefined) {
    if (typeof data['school_related'] !== 'boolean') throw new Error('涉校标记格式异常')
    result.school_related = data['school_related']
  }
  return result
}
export function parseModerationOutcome(value: unknown): ModerationOutcome {
  const data = reviewRecord(value)
  const decision = data['content_decision']
  const outcome = businessOutcomes.find((item) => item === data['business_outcome'])
  if ((decision !== 'approved' && decision !== 'rejected') || !outcome)
    throw new Error('审核结果格式异常')
  return {
    content_decision: decision,
    business_outcome: outcome,
    version: reviewVersion(data['version']),
  }
}
export const parseModerationPage = (value: unknown) => reviewPage(value, parseModerationSummary)
