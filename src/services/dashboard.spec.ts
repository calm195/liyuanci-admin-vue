import { describe, expect, it } from 'vitest'
import { parseDashboard } from './dashboard'
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
