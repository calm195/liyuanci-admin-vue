import { describe, expect, it } from 'vitest'
import { parseWordlistRules } from './wordlists'

describe('词条边界与处置配置', () => {
  const rule = {
    entry: '缩写示例',
    category: 'abbreviation',
    aliases: ['sxsl'],
    match_mode: 'word',
    action: 'hint',
  }
  it('保留显式缩写、完整词边界和提示处置', () => {
    expect(parseWordlistRules([rule], ['缩写示例'])).toEqual([rule])
  })
  it('旧词条未配置运营分类仍可读取', () => {
    expect(
      parseWordlistRules([{ ...rule, category: '', aliases: [] }], ['缩写示例'])[0]?.category,
    ).toBe('')
  })
  it('拒绝不存在的词条、重复规则及未知处置', () => {
    expect(() => parseWordlistRules([rule], [])).toThrow()
    expect(() => parseWordlistRules([rule, rule], ['缩写示例'])).toThrow()
    expect(() => parseWordlistRules([{ ...rule, action: 'approve' }], ['缩写示例'])).toThrow()
  })
})
