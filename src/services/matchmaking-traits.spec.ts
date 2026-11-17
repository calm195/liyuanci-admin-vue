import { describe, expect, it, vi } from 'vitest'
import { createTraitClient, parseTraitPage, traitQuery } from './matchmaking-traits'
import type { TraitFilters } from '@/types/matchmaking-traits'
const filters: TraitFilters = {
  q: '有耐心',
  category: 'personality',
  enabled: 'true',
  purpose: 'personal',
  gender: 'female',
  status: 'approved',
  min_heat: '2',
  max_heat: '50',
  sort: 'heat_desc',
}
const id = 'aa110000-0000-4000-8000-000000000001'
describe('特质接口边界', () => {
  it('创建与维护分别使用固定请求和幂等键，不借审核接口修改启停', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(Response.json({ code: 0, data: { id } })))
    const client = createTraitClient('synthetic', () => true, transport)
    const signal = new AbortController().signal
    await client.execute(
      {
        action: 'create',
        key: 'create-key',
        body: { name: '摄影', category: 'interest', reason: '新增兴趣' },
      },
      signal,
    )
    await client.execute(
      {
        action: 'update',
        id,
        key: 'update-key',
        body: { expected_version: 2, category: 'interest', enabled: false, reason: '暂不推荐' },
      },
      signal,
    )
    expect(transport.mock.calls[0]?.[0]).toBe('/api/v1/admin/matchmaking/traits')
    expect(transport.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'Idempotency-Key': 'create-key' },
    })
    expect(transport.mock.calls[1]?.[0]).toBe(`/api/v1/admin/matchmaking/traits/${id}`)
    expect(transport.mock.calls[1]?.[1]).toMatchObject({
      method: 'PUT',
      headers: { 'Idempotency-Key': 'update-key' },
    })
    expect(transport.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({
        expected_version: 2,
        category: 'interest',
        enabled: false,
        reason: '暂不推荐',
      }),
    )
  })
  it('词云沿用所有筛选且不携带列表页码', () => {
    const list = new URLSearchParams(traitQuery(filters, 3)),
      cloud = new URLSearchParams(traitQuery(filters))
    expect(list.get('page')).toBe('3')
    expect(cloud.has('page')).toBe(false)
    expect(cloud.get('limit')).toBe('100')
    for (const key of [
      'q',
      'gender',
      'status',
      'min_heat',
      'max_heat',
      'sort',
      'purpose',
      'category',
      'enabled',
    ])
      expect(cloud.get(key)).toBe(list.get(key))
  })
  it('拒绝错误热度区间和损坏的响应', () => {
    expect(() => traitQuery({ ...filters, min_heat: '51' })).toThrow('最低热度')
    expect(() => traitQuery({ ...filters, min_heat: '-1' })).toThrow('非负整数')
    expect(() => parseTraitPage({ items: [{ id, heat: -1 }], total: 1 })).toThrow()
  })
  it('审核原样使用给定幂等键且拒绝错对象回执', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: 0, data: { id: 'aa110000-0000-4000-8000-000000000002' } }),
        ),
      )
    const client = createTraitClient('synthetic', () => true, transport)
    await expect(
      client.review(
        {
          id,
          key: 'same-key',
          body: { expected_version: 2, decision: 'rejected', reason: '不合适' },
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow()
    expect(transport.mock.calls[0]?.[1]?.headers).toMatchObject({ 'Idempotency-Key': 'same-key' })
  })
})
