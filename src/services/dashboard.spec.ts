import { describe, expect, it } from 'vitest'
import { parseDashboard, parseHotItems } from './dashboard'
const counts = {
  registered_users: 5,
  verified_users: 2,
  new_users: 3,
  resources: 0,
  wishes: 4,
  fulfilled_wishes: 1,
}
const sample = {
  code: 0,
  data: {
    range: 'month',
    timezone: 'Asia/Shanghai',
    generated_at: '2026-11-07T12:00:00Z',
    summary: counts,
    series: [{ ...counts, date: '2026-11-07' }],
    history_note: '仅统计保留记录',
  },
}
describe('首页聚合数据边界', () => {
  it('消费真实零值与历史口径，不从曲线推算指标卡', () => {
    const result = parseDashboard({
      ...sample,
      data: { ...sample.data, series: [{ ...counts, new_users: 1, date: '2026-11-07' }] },
    })
    expect(result.summary.new_users).toBe(3)
    expect(result.series[0]?.new_users).toBe(1)
    expect(result.summary.resources).toBe(0)
    expect(result.history_note).toBe('仅统计保留记录')
  })
  it.each([-1, 1.5, '5', null])('拒绝非法计数 %s', (registered_users) => {
    expect(() =>
      parseDashboard({
        ...sample,
        data: { ...sample.data, summary: { ...counts, registered_users } },
      }),
    ).toThrow()
  })
})

describe('首页热点榜单数据边界', () => {
  const item = { id: 'hot-1', title: '合成标题', body: '公开摘要', heat_score: 1 }
  const response = (items: unknown[]) => ({ code: 0, data: { items } })

  it('保留服务端顺序和心愿零支持数', () => {
    const next = { ...item, id: 'hot-2', heat_score: 2 }
    expect(
      parseHotItems(
        response([
          { ...item, support_count: 0 },
          { ...next, support_count: 1 },
        ]),
        'wish',
      ),
    ).toMatchObject([
      { id: 'hot-1', supportCount: 0 },
      { id: 'hot-2', supportCount: 1 },
    ])
  })

  it('悄悄话只投影公开榜单字段', () => {
    expect(parseHotItems(response([{ ...item, identity: '合成身份' }]), 'whisper')).toEqual([
      { id: item.id, title: item.title, body: item.body, heatScore: 1 },
    ])
  })

  it('拒绝超长榜单和缺失的心愿支持数', () => {
    expect(() =>
      parseHotItems(response(Array.from({ length: 11 }, () => item)), 'whisper'),
    ).toThrow()
    expect(() => parseHotItems(response([item]), 'wish')).toThrow()
  })
})
