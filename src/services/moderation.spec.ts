import { describe, expect, it } from 'vitest'
import { parseModerationCase, parseModerationOutcome, parseModerationPage } from './moderation'
import { businessOutcomes } from '@/types/moderation'

describe('T017 内容审核协议解析', () => {
  it('队列保留案件和正文版本及类型，不保留正文与身份', () => {
    const page = parseModerationPage({
      items: [
        {
          id: 'case',
          version: 3,
          content_version: 7,
          kind: 'message',
          status: 'human_required',
          body: '不在列表展示',
          name: '不能保留',
        },
      ],
      next_cursor: 'opaque',
    })
    expect(page).toEqual({
      items: [
        { id: 'case', version: 3, content_version: 7, kind: 'message', status: 'human_required' },
      ],
      next_cursor: 'opaque',
    })
  })
  it('详情保留精确正文与涉校提示，不泄漏额外字段', () => {
    expect(
      parseModerationCase({
        id: 'case',
        version: 3,
        content_version: 7,
        status: 'human_required',
        body: '案件原文',
        school_related: true,
        private: '不可见',
      }),
    ).toEqual({
      id: 'case',
      version: 3,
      content_version: 7,
      status: 'human_required',
      body: '案件原文',
      school_related: true,
    })
  })
  it.each(businessOutcomes)('内容通过独立消费业务结果%s，不推断已公开', (business_outcome) => {
    expect(
      parseModerationOutcome({ content_decision: 'approved', business_outcome, version: 4 }),
    ).toEqual({ content_decision: 'approved', business_outcome, version: 4 })
  })
  it('拒绝畸形边界、未知判定及业务结果', () => {
    expect(() => parseModerationCase({})).toThrow()
    expect(() =>
      parseModerationOutcome({
        content_decision: 'approved',
        business_outcome: 'unknown',
        version: 1,
      }),
    ).toThrow()
    expect(() => parseModerationPage({ items: [], next_cursor: 5 })).toThrow()
  })
})
