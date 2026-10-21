import { ApiError } from './admin'
import {
  createReviewBoundary,
  mockPage,
  reviewPage,
  reviewRecord,
  reviewText,
  reviewVersion,
} from './review-boundary'
import { businessOutcomes } from '@/types/moderation'
import type {
  DemoContent,
  ModerationCase,
  ModerationClient,
  ModerationOutcome,
  ModerationSummary,
} from '@/types/moderation'

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

export function createModerationClient(allowed: () => boolean): ModerationClient {
  const boundary = createReviewBoundary(allowed)
  const cases: (ModerationCase & { outcome: ModerationOutcome['business_outcome'] })[] = [
    {
      id: 'synthetic-review-ordinary',
      version: 1,
      content_version: 1,
      status: 'pending',
      body: '合成普通命中样例：待人工核对的心愿正文。',
      school_related: false,
      outcome: 'ready',
    },
    {
      id: 'synthetic-review-school',
      version: 1,
      content_version: 1,
      status: 'pending',
      body: '合成涉校样例：此内容未经证实，需人工审核。',
      school_related: true,
      outcome: 'published',
    },
    {
      id: 'synthetic-review-updated',
      version: 2,
      content_version: 2,
      status: 'pending',
      body: '合成改版样例：仅此新版本可审核，旧版本决定应冲突。',
      school_related: false,
      outcome: 'pending_review',
    },
    {
      id: 'synthetic-review-cancelled',
      version: 1,
      content_version: 1,
      status: 'pending',
      body: '合成已取消交互样例：审核通过也不会恢复交互。',
      outcome: 'cancelled',
    },
    {
      id: 'synthetic-review-privacy',
      version: 1,
      content_version: 1,
      status: 'pending',
      body: '合成隐私屏障样例：审核通过仍需隐私复核。',
      outcome: 'privacy_review_required',
    },
    {
      id: 'synthetic-review-message',
      version: 1,
      content_version: 1,
      status: 'pending',
      body: '合成命中消息：仅展示本案命中正文，不提供前后会话。',
      outcome: 'delivered',
    },
  ]
  const contents: DemoContent[] = [
    {
      id: 'synthetic-wish',
      kind: 'wish',
      version: 1,
      content_version: 1,
      status: 'published',
      ordinary_restricted: false,
    },
    {
      id: 'synthetic-story',
      kind: 'story',
      version: 1,
      content_version: 2,
      status: 'offline',
      ordinary_restricted: true,
    },
  ]
  return {
    async list(cursor, signal) {
      await boundary.authorize(signal)
      return parseModerationPage(mockPage(cases, cursor))
    },
    async detail(id, signal) {
      await boundary.authorize(signal)
      const item = cases.find((entry) => entry.id === id)
      if (!item) throw new ApiError(404)
      return parseModerationCase(item)
    },
    decide(id, input, key, signal) {
      return boundary.command(`decision/${id}`, input, key, signal, parseModerationOutcome, () => {
        reviewVersion(input.expected_version)
        if (
          input.decision === 'rejected' &&
          (!input.reason.trim() || !input.revision_suggestion.trim())
        )
          throw new Error('驳回原因和修改建议均不能为空')
        const item = cases.find((entry) => entry.id === id)
        if (!item) throw new ApiError(404)
        if (item.version !== input.expected_version || item.status !== 'pending')
          throw new ApiError(409)
        item.status = input.decision
        item.version++
        return {
          content_decision: input.decision,
          business_outcome: input.decision === 'rejected' ? 'cancelled' : item.outcome,
          version: item.version,
        }
      })
    },
    async demoContents(signal) {
      await boundary.authorize(signal)
      return contents.map((item) => ({ ...item }))
    },
    restrict(kind, id, action, input, key, signal) {
      return boundary.command(
        `${action}/${kind}/${id}`,
        input,
        key,
        signal,
        parseModerationSummary,
        () => {
          reviewVersion(input.expected_version)
          reviewText(input.reason)
          const item = contents.find((entry) => entry.id === id && entry.kind === kind)
          if (!item) throw new ApiError(404)
          if (
            item.version !== input.expected_version ||
            (action === 'offline' ? item.status !== 'published' : !item.ordinary_restricted)
          )
            throw new ApiError(409)
          item.ordinary_restricted = action === 'offline'
          item.status = action === 'offline' ? 'offline' : 'withdrawn'
          item.version++
          return parseModerationSummary(item)
        },
      )
    },
  }
}
