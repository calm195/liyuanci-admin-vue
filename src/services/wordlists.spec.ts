import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWordlistClient, parseWordlist, parseWordlistPage } from './wordlists'
let factory = createWordlistClient
const signal = () => new AbortController().signal
beforeEach(async () => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('VITE_ADMIN_MOCK', 'true')
  vi.resetModules()
  factory = (await import('./wordlists')).createWordlistClient
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
describe('T017 REQ-015/019 词库版本服务', () => {
  it('新分类无前置版本，已有分类要求当前版本；创建不会自动发布', async () => {
    const client = factory(() => true)
    const created = await client.create(
      { kind: 'crisis', entries: ['合成危机词'] },
      'new',
      signal(),
    )
    expect(created).toMatchObject({ kind: 'crisis', version: 1, status: 'draft' })
    await expect(
      client.create({ kind: 'school', entries: ['合成涉校词'] }, 'missing-version', signal()),
    ).rejects.toMatchObject({ status: 409 })
    const draft = await client.create(
      { kind: 'school', entries: ['合成涉校词'], expected_version: 1 },
      'school',
      signal(),
    )
    expect(draft).toMatchObject({ status: 'draft', version: 2 })
    expect(
      (await client.list(null, signal())).items.find((item) => item.kind === 'school')?.status,
    ).toBe('published')
  })
  it('显式发布只接受当前草稿版本，旧发布归档，不重新发布旧版本', async () => {
    const client = factory(() => true)
    const draft = await client.create(
      { kind: 'school', entries: [], expected_version: 1 },
      'create',
      signal(),
    )
    await expect(client.publish(draft.id, 1, 'old', signal())).rejects.toMatchObject({
      status: 409,
    })
    const published = await client.publish(draft.id, draft.version, 'publish', signal())
    expect(published).toMatchObject({ status: 'published', version: 3 })
    expect(
      (await client.list(null, signal())).items.find((item) => item.kind === 'school')?.status,
    ).toBe('archived')
    await expect(
      client.publish(draft.id, published.version, 'again', signal()),
    ).rejects.toMatchObject({ status: 409 })
  })
  it('较新版本存在时旧草稿不可发布，同键同内容可重试，异内容冲突', async () => {
    const client = factory(() => true)
    const input = { kind: 'school' as const, entries: ['合成词'], expected_version: 1 }
    const first = await client.create(input, 'key', signal())
    expect(await client.create(input, 'key', signal())).toEqual(first)
    await expect(client.create({ ...input, entries: [] }, 'key', signal())).rejects.toMatchObject({
      status: 409,
    })
    await client.create({ ...input, expected_version: 2 }, 'newer', signal())
    await expect(
      client.publish(first.id, first.version, 'publish', signal()),
    ).rejects.toMatchObject({ status: 409 })
  })
  it('边界拒绝未知分类、异常分页与空白词条，空数组按契约允许', async () => {
    expect(() => parseWordlist({ id: 'x', kind: 'unknown', version: 1, status: 'draft' })).toThrow()
    expect(() => parseWordlistPage({ items: [], next_cursor: false })).toThrow()
    await expect(
      factory(() => true).create({ kind: 'crisis', entries: [' '] }, 'blank', signal()),
    ).rejects.toThrow()
    expect(
      await factory(() => true).create({ kind: 'crisis', entries: [] }, 'empty', signal()),
    ).toMatchObject({ status: 'draft' })
  })
  it('权限收回禁止列表、创建及已确认回执回放，取消请求失败', async () => {
    let allowed = true
    const client = factory(() => allowed)
    const input = { kind: 'crisis' as const, entries: ['合成词'] }
    const draft = await client.create(input, 'key', signal())
    allowed = false
    for (const pending of [
      client.list(null, signal()),
      client.create(input, 'key', signal()),
      client.publish(draft.id, 1, 'publish', signal()),
    ])
      await expect(pending).rejects.toMatchObject({ status: 403 })
    allowed = true
    const controller = new AbortController()
    const pending = client.list(null, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('合成字面匹配仅使用发布词条，创建不生效、发布后旧词归档', async () => {
    const client = factory(() => true)
    const body = '合成涉校词和替代词'
    const before = await client.demoScan(body, signal())
    expect(before.find((item) => item.kind === 'school')?.matches).toEqual(['合成涉校词'])
    const draft = await client.create(
      { kind: 'school', entries: ['替代词'], expected_version: 1 },
      'create',
      signal(),
    )
    expect(await client.demoScan(body, signal())).toEqual(before)
    await client.publish(draft.id, draft.version, 'publish', signal())
    expect((await client.demoScan(body, signal())).find((item) => item.kind === 'school')).toEqual({
      kind: 'school',
      version: 3,
      matches: ['替代词'],
    })
  })
  it('模拟不发送网络请求，生产环境即使设置Mock也不可用', async () => {
    const transport = vi.fn()
    vi.stubGlobal('fetch', transport)
    await factory(() => true).list(null, signal())
    expect(transport).not.toHaveBeenCalled()
    vi.stubEnv('DEV', false)
    vi.resetModules()
    const module = await import('./wordlists')
    await expect(
      module.createWordlistClient(() => true).list(null, signal()),
    ).rejects.toMatchObject({ status: 503 })
  })
})
