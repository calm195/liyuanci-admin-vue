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
  it('审核详情保留同版本标题和自定义报答', () => {
    expect(
      parseModerationCase({
        id: 'case',
        version: 3,
        content_version: 7,
        status: 'human_required',
        body: '正文',
        title: '标题',
        reward_text: '一杯奶茶',
      }),
    ).toMatchObject({ title: '标题', reward_text: '一杯奶茶' })
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

it('拒绝不安全图片地址并保留同版本合法图片', () => {
  const detail = {
    id: 'case',
    version: 1,
    content_version: 2,
    status: 'human_required',
    body: '图文',
  }
  expect(() =>
    parseModerationCase({
      ...detail,
      images: [{ id: 'image', url: 'javascript:alert(1)', position: 0, scan_state: 'approved' }],
    }),
  ).toThrow()
  expect(
    parseModerationCase({
      ...detail,
      images: [
        { id: 'image', url: '/api/v1/wishes/w/images/i', position: 0, scan_state: 'approved' },
      ],
    }).images,
  ).toHaveLength(1)
  expect(() =>
    parseModerationCase({
      ...detail,
      images: [
        { id: 'fourth', url: '/api/v1/wish-images/fourth', position: 3, scan_state: 'approved' },
      ],
    }),
  ).toThrow()
})
