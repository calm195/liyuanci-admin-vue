import { describe, expect, it } from 'vitest'
import { parseWordlist, parseWordlistDetail, parseWordlistPage } from './wordlists'
import { wordlistKinds, wordlistStatuses } from '@/types/wordlists'
const item = {
  id: 'list',
  kind: 'school',
  version: 2,
  status: 'published',
  base_effective_id: null,
}
const heads = wordlistKinds.map((kind) => ({ kind, version: 7, effective_id: null }))
describe('T017 词库完整快照与基准解析', () => {
  it('每页保留三类heads，资源版本与分类基准独立', () => {
    const page = parseWordlistPage({
      items: [{ ...item, entries: ['不在列表暴露'] }],
      heads,
      next_cursor: null,
    })
    expect(page.heads).toEqual(heads)
    expect(page.items).toEqual([item])
  })
  it.each(wordlistStatuses)('读取%s完整只读快照且不保留未知字段', (status) => {
    expect(parseWordlistDetail({ ...item, status, entries: ['词条'], private: '不可见' })).toEqual({
      ...item,
      status,
      entries: ['词条'],
    })
  })
  it('空快照合法，空白词条拒绝', () => {
    expect(parseWordlistDetail({ ...item, entries: [] }).entries).toEqual([])
    expect(() => parseWordlistDetail({ ...item, entries: [' '] })).toThrow()
  })
  it.each([
    undefined,
    [],
    Array(3).fill(heads[0]),
    heads.map((head) => ({ ...head, version: 0 })),
    heads.map((head) => ({ ...head, effective_id: false })),
  ])('拒绝缺失或异常heads %#', (invalid) => {
    expect(() => parseWordlistPage({ items: [item], heads: invalid, next_cursor: null })).toThrow()
  })
  it('拒绝未知状态、缺失生效基准及非法分页游标', () => {
    expect(() => parseWordlist({ ...item, status: 'future' })).toThrow()
    expect(() =>
      parseWordlist({ id: 'list', kind: 'school', status: 'draft', version: 1 }),
    ).toThrow()
    expect(() => parseWordlistPage({ items: [item], heads, next_cursor: 1 })).toThrow()
  })
})
