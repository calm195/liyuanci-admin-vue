import { describe, expect, it, vi } from 'vitest'
import fixtures from './resources.contract.spec.json'
import {
  createResourcesClient,
  normalizeResourceText,
  parseResourceCategory,
  parseResourceDetail,
  parseResourcePage,
  parseResourceSummary,
  parseResourceJson,
  ResourceApiError,
} from './resources'
import type { ResourcesClient } from '@/types/resources'
const signal = () => new AbortController().signal
const resource = 'ac230000-0000-4000-8000-000000000001'
const category = 'ac230000-0000-4000-8000-000000000002'
const input = {
  title: '合成资料',
  category_id: category,
  description: '',
  download_url: 'https://example.test/file',
  extraction_code: null,
}
const calls: Record<string, (client: ResourcesClient) => Promise<unknown>> = {
  adminResourcesList: (client) =>
    client.list({ q: '', category_id: '', status: '', limit: 20 }, null, signal()),
  adminResourceDetail: (client) => client.detail(resource, signal()),
  adminResourceCreate: (client) => client.create(input, 'key', signal()),
  adminResourceUpdate: (client) =>
    client.update(resource, { ...input, expected_version: 2 }, 'key', signal()),
  adminResourcePublish: (client) => client.publish(resource, 2, 'key', signal()),
  adminResourceOffline: (client) => client.offline(resource, 2, '修复链接', 'key', signal()),
  adminResourceCategoriesList: (client) => client.categories(null, null, signal()),
  adminResourceCategoryDetail: (client) => client.category(category, signal()),
  adminResourceCategoryCreate: (client) =>
    client.createCategory({ name: '合成分类', sort_order: 0 }, 'key', signal()),
  adminResourceCategoryUpdate: (client) =>
    client.updateCategory(
      category,
      { name: '合成分类', sort_order: 0, enabled: true, expected_version: 1 },
      'key',
      signal(),
    ),
}
const parsers: Record<string, (value: unknown) => unknown> = {
  AdminResourceSummary: parseResourceSummary,
  AdminResourceDetail: parseResourceDetail,
  AdminCategory: parseResourceCategory,
  AdminResourcePage: (value) => parseResourcePage(value, parseResourceSummary, 50),
  AdminCategoryPage: (value) => parseResourcePage(value, parseResourceCategory, 100),
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  })
}
function fixture(operation: string) {
  const item = fixtures.exchanges.find((item) => item.operation_id === operation)
  if (!item) throw new Error('缺少合成夹具')
  return item
}
describe('资料正式契约消费', () => {
  for (const entry of fixtures.exchanges.filter((entry) =>
    entry.operation_id.startsWith('admin'),
  )) {
    it(`消费 ${entry.operation_id} 的正式成功封装`, async () => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(response(entry.body, entry.http_status))
      const execute = calls[entry.operation_id]
      if (!execute) throw new Error('缺少操作')
      expect(await execute(createResourcesClient('synthetic', () => true, transport))).toEqual(
        entry.body.data,
      )
      const request = transport.mock.calls[0]?.[1]
      expect(request?.cache).toBe('no-store')
      expect(request?.credentials).toBe('omit')
      expect(new Headers(request?.headers).get('Authorization')).toBe('Bearer synthetic')
    })
  }
  for (const entry of fixtures.error_examples.filter((entry) =>
    entry.operation_id.startsWith('admin'),
  )) {
    it(`区分 ${entry.operation_id} ${entry.body.error_code}`, async () => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(response(entry.body, entry.http_status))
      const execute = calls[entry.operation_id]
      if (!execute) throw new Error('缺少操作')
      await expect(
        execute(createResourcesClient('synthetic', () => true, transport)),
      ).rejects.toMatchObject({ status: entry.http_status, errorCode: entry.body.error_code })
    })
  }
  for (const entry of fixtures.fixtures.filter((entry) => parsers[entry.schema])) {
    it(`字段与跨字段规则 ${entry.name}`, () => {
      const parse = parsers[entry.schema]
      if (!parse) throw new Error('缺少解析器')
      if (entry.valid) expect(() => parse(entry.value)).not.toThrow()
      else expect(() => parse(entry.value)).toThrow()
    })
  }
  for (const entry of fixtures.text_vectors) {
    it(`文本规则 ${entry.name}`, () => {
      const kind = entry.kind
      if (
        kind !== 'title' &&
        kind !== 'name' &&
        kind !== 'description' &&
        kind !== 'download_url' &&
        kind !== 'extraction_code' &&
        kind !== 'q' &&
        kind !== 'reason'
      )
        throw new Error('未知规范')
      const run = () =>
        kind === 'extraction_code'
          ? normalizeResourceText(kind, entry.value)
          : normalizeResourceText(kind, entry.value)
      if (entry.valid) expect(run()).toEqual('normalized' in entry ? entry.normalized : undefined)
      else expect(run).toThrow()
    })
  }
  it.each([
    '{"version":1.0}',
    '{"version":1e0}',
    '{"version":1,"version":2}',
    '{"nested":{"id":1,"\\u0069d":2}}',
    '{"version":9007199254740992}',
  ])('拒绝解码后会丢失的协议错误 %s', (source) => {
    expect(() => parseResourceJson(source)).toThrow()
  })
  it('不会把正文内数字或重复字段文本误判成协议错误', () => {
    expect(parseResourceJson('{"text":"version: 1.0", "data":[{"id":1},{"id":2}]}')).toEqual({
      text: 'version: 1.0',
      data: [{ id: 1 }, { id: 2 }],
    })
  })
  it.each(['CATEGORY_IN_USE', 'CATEGORY_NAME_CONFLICT', 'VERSION_CONFLICT'])(
    '列表拒绝不属于该操作的错误 %s',
    async (code) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          response({ code: 409, message: '', request_id: 'synthetic', error_code: code }, 409),
        )
      await expect(
        createResourcesClient('x', () => true, transport).list(
          { q: '', category_id: '', status: '', limit: 20 },
          null,
          signal(),
        ),
      ).rejects.not.toBeInstanceOf(ResourceApiError)
    },
  )
  it('拒绝目标错配和不存在的日历日期', async () => {
    const data = structuredClone(fixture('adminResourceDetail').body)
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response(data))
    await expect(
      createResourcesClient('x', () => true, transport).detail(
        'ac230000-0000-4000-8000-000000000099',
        signal(),
      ),
    ).rejects.toThrow()
    expect(() =>
      parseResourceDetail({ ...data.data, created_at: '2026-02-30T00:00:00Z' }),
    ).toThrow()
  })
  it('在撤权后丢弃已完成的网络结果', async () => {
    let allowed = true
    const transport = vi.fn<typeof fetch>().mockImplementation(() => {
      allowed = false
      return Promise.resolve(response(fixture('adminResourceDetail').body))
    })
    await expect(
      createResourcesClient('x', () => allowed, transport).detail(resource, signal()),
    ).rejects.toMatchObject({ status: 403 })
  })
  it('查询采用编码后的规范条件，写入使用稳定键且完整清空提取码', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(fixture('adminResourceUpdate').body))
    const client = createResourcesClient('x', () => true, transport)
    await client.update(
      resource,
      { ...input, title: '  资料  ', extraction_code: '', expected_version: 2 },
      'stable-key',
      signal(),
    )
    const init = transport.mock.calls[0]?.[1]
    if (typeof init?.body !== 'string') throw new Error('缺少提交正文')
    expect(JSON.parse(init.body)).toMatchObject({
      title: '资料',
      extraction_code: null,
      description: '',
      expected_version: 2,
    })
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('stable-key')
  })
})

it.each([401, 403])('失权 HTTP %s 即使正文损坏也清理会话/工作区', async (status) => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('<html>error</html>', { status }))
  await expect(
    createResourcesClient('synthetic', () => true, transport).detail(resource, signal()),
  ).rejects.toMatchObject({ status })
})

it('创建成功后隐私屏障使同键重放返回404，不能恢复旧正文', async () => {
  const first = fixture('adminResourceCreate')
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response(first.body, 201))
    .mockResolvedValueOnce(
      response(
        { code: 404, message: '不可访问', error_code: 'NOT_FOUND', request_id: 'synthetic' },
        404,
      ),
    )
  const client = createResourcesClient('synthetic', () => true, transport)
  await client.create(input, 'same-key', signal())
  await expect(client.create(input, 'same-key', signal())).rejects.toMatchObject({
    status: 404,
    errorCode: 'NOT_FOUND',
  })
  expect(
    transport.mock.calls.map((call) => new Headers(call[1]?.headers).get('Idempotency-Key')),
  ).toEqual(['same-key', 'same-key'])
})
