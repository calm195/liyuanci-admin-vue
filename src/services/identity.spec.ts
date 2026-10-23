import { describe, expect, it } from 'vitest'
import {
  parseIdentityCase,
  parseIdentityPage,
  parseIdentityReceipt,
  validIdentityFeedback,
} from './identity'

describe('T012 身份审核响应边界', () => {
  it('队列仅保留脱敏字段，不保留额外姓名和卡引用', () => {
    expect(
      parseIdentityPage({
        items: [
          { id: 'case', version: 1, status: 'pending', name: '敏感姓名', asset_id: 'private' },
        ],
        next_cursor: null,
      }),
    ).toEqual({ items: [{ id: 'case', version: 1, status: 'pending' }], next_cursor: null })
  })
  it('详情按白名单解析身份字段，不保留外部私有下载地址', () => {
    expect(
      parseIdentityCase({
        id: 'case',
        version: 3,
        status: 'pending',
        name: '测试姓名',
        student_number: '测试学号',
        asset_id: 'asset',
        url: 'private',
      }),
    ).not.toHaveProperty('url')
  })
  it('拒绝异常边界数据', () => {
    expect(() => parseIdentityPage({ items: [], next_cursor: 1 })).toThrow()
    expect(() => parseIdentityCase({ id: 'x', version: 1, status: 'pending' })).toThrow()
    expect(() => parseIdentityReceipt({ request_id: 'x', version: 1, status: 'unknown' })).toThrow()
  })
  it('驳回回执保留原因和建议，案件标识与追踪标识不混淆', () => {
    expect(
      parseIdentityReceipt({
        request_id: 'case',
        version: 2,
        status: 'rejected',
        reason: '图片不清晰',
        revision_suggestion: '重新上传',
        token: '不能保留',
      }),
    ).toEqual({
      request_id: 'case',
      version: 2,
      status: 'rejected',
      reason: '图片不清晰',
      revision_suggestion: '重新上传',
    })
  })
  it('审核意见按UTF-8字节限制，接受边界并拒绝空白及超长中文', () => {
    expect(validIdentityFeedback('a'.repeat(2000))).toBe(true)
    expect(validIdentityFeedback('中'.repeat(666) + 'ab')).toBe(true)
    expect(validIdentityFeedback('中'.repeat(667))).toBe(false)
    expect(validIdentityFeedback('a'.repeat(2001))).toBe(false)
    expect(validIdentityFeedback('  ')).toBe(false)
  })
})
