import { describe, expect, it, vi } from 'vitest'
import { createContentManagementClient } from './content-management'
import type { ContentFilters } from './content-management'

const filters: ContentFilters = {
  keyword: '  校园 %_  ',
  state: 'published',
  requester: '许愿人',
  helper: '应愿人',
  from: '2026-11-06',
  until: '2026-11-07',
}
const id = '00000000-0000-4000-8000-000000000001'
const summary = {
  id,
  title: '周末心愿',
  state: 'published',
  created_at: '2026-11-07T08:00:00+08:00',
  published_at: null,
  requester: '许愿人',
  helper: '',
  matched_at: null,
}
const signal = new AbortController().signal
function response(data: unknown) {
  return Response.json({ code: 0, message: '成功', request_id: 'request', data })
}

describe('内容管理传输', () => {
  it('按北京时间筛选并编码关键词和游标', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ items: [{ ...summary, private_body: '原始内容' }], next_cursor: 'a+b=' }),
      )
    const client = createContentManagementClient('session-token', () => true, transport)
    const result = await client.list('wishes', filters, 'a+b=', signal)
    expect(result.items[0]).toMatchObject({ id, title: '周末心愿', requester: '许愿人' })
    expect(result.items[0]).not.toHaveProperty('private_body')
    const call = transport.mock.calls[0]
    expect(call).toBeDefined()
    const endpoint = call?.[0]
    if (typeof endpoint !== 'string') throw new Error('请求地址应为字符串')
    const path = new URL(endpoint, 'http://localhost')
    expect(path.pathname).toBe('/api/v1/admin/content/wishes')
    expect(Object.fromEntries(path.searchParams)).toEqual({
      keyword: '校园 %_',
      state: 'published',
      requester: '许愿人',
      helper: '应愿人',
      from: '2026-11-06T00:00:00+08:00',
      until: '2026-11-07T16:00:00.000Z',
      cursor: 'a+b=',
    })
    expect(call?.[1]).toMatchObject({ cache: 'no-store', credentials: 'omit', signal })
  })

  it('拒绝错配详情，并使用独立的 POST 草稿接口', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          ...summary,
          id: '00000000-0000-4000-8000-000000000002',
          original: null,
          story: null,
          comments: [],
          comments_more: false,
          exportable: false,
        }),
      )
      .mockResolvedValueOnce(response({ markdown: '# 悄悄话\n\n> 正文' }))
    const client = createContentManagementClient('session-token', () => true, transport)
    await expect(client.detail('whispers', id, 1, signal)).rejects.toThrow('不符合契约')
    await expect(client.export('whispers', id, signal)).resolves.toContain('> 正文')
    expect(transport.mock.calls[0]?.[0]).toBe(
      `/api/v1/admin/content/whispers/${id}?comments_page=1`,
    )
    expect(transport.mock.calls[1]?.[0]).toBe(`/api/v1/admin/content/whispers/${id}/export`)
    expect(transport.mock.calls[1]?.[1]?.method).toBe('POST')
  })
})
