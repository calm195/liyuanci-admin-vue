import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createWordlistClient,
  parseWordlist,
  parseWordlistDetail,
  parseWordlistPage,
} from './wordlists'
import type { WordlistClient, WordlistKind } from '@/types/wordlists'
let factory = createWordlistClient
const signal = () => new AbortController().signal
async function head(client: WordlistClient, kind: WordlistKind = 'school') {
  const found = (await client.list(null, signal())).heads.find((item) => item.kind === kind)
  if (!found) throw new Error('缺少基准')
  return found
}
async function create(client: WordlistClient, key = 'create', entries: string[] = ['合成新词']) {
  return client.create(
    { kind: 'school', entries, expected_version: (await head(client)).version },
    key,
    signal(),
  )
}
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
describe('T017 B06/B14 REQ-015/018/019 词库契约0.2.0', () => {
  it('每页含三类heads，空分类首次创建也使用基准；草稿资源版本独立', async () => {
    const client = factory(() => true)
    const initial = await client.list(null, signal())
    expect(initial.heads).toHaveLength(3)
    expect(await head(client, 'crisis')).toEqual({ kind: 'crisis', version: 1, effective_id: null })
    const draft = await client.create(
      { kind: 'crisis', entries: [], expected_version: 1 },
      'new',
      signal(),
    )
    expect(draft).toMatchObject({ version: 1, status: 'draft', base_effective_id: null })
    const page = await client.list(null, signal())
    expect(page.next_cursor).not.toBeNull()
    const next = await client.list(page.next_cursor, signal())
    expect(next.heads).toEqual(page.heads)
    expect(await head(client, 'crisis')).toEqual({ kind: 'crisis', version: 2, effective_id: null })
    expect(await client.detail(draft.id, signal())).toMatchObject({ entries: [] })
    await expect(
      client.create({ kind: 'crisis', entries: [], expected_version: 1 }, 'stale', signal()),
    ).rejects.toMatchObject({ status: 409 })
  })
  it('首次空快照发布也推进head和资源，缺任一请求版本返回400', async () => {
    const client = factory(() => true)
    await expect(
      Reflect.apply(client.create.bind(client), client, [
        { kind: 'crisis', entries: [] },
        'missing-create',
        signal(),
      ]),
    ).rejects.toMatchObject({ status: 400 })
    const draft = await client.create(
      { kind: 'crisis', entries: [], expected_version: 1 },
      'new',
      signal(),
    )
    for (const input of [{ expected_version: 1 }, { expected_head_version: 2 }])
      await expect(
        Reflect.apply(client.publish.bind(client), client, [
          draft.id,
          input,
          JSON.stringify(input),
          signal(),
        ]),
      ).rejects.toMatchObject({ status: 400 })
    await client.publish(
      draft.id,
      { expected_version: 1, expected_head_version: 2 },
      'publish',
      signal(),
    )
    expect(await head(client, 'crisis')).toEqual({
      kind: 'crisis',
      version: 3,
      effective_id: draft.id,
    })
    expect(await client.detail(draft.id, signal())).toMatchObject({
      version: 2,
      status: 'published',
      entries: [],
      base_effective_id: null,
    })
  })
  it('创建推进head不改变生效版，完整快照不追加且详情不泄漏到列表', async () => {
    const client = factory(() => true)
    const previous = await head(client)
    const draft = await create(client)
    expect(draft).toMatchObject({ version: 1, base_effective_id: previous.effective_id })
    expect(await head(client)).toEqual({ ...previous, version: previous.version + 1 })
    expect(await client.detail(draft.id, signal())).toMatchObject({ entries: ['合成新词'] })
    const page = await client.list(null, signal())
    expect(JSON.stringify(page)).not.toContain('entries')
    const detail = await client.detail(draft.id, signal())
    detail.entries.push('外部修改')
    expect((await client.detail(draft.id, signal())).entries).toEqual(['合成新词'])
  })
  it('发布同时拒绝旧资源版本和旧head，无部分归档或生效指针改变', async () => {
    const client = factory(() => true)
    const draft = await create(client)
    const before = await head(client)
    for (const input of [
      { expected_version: 2, expected_head_version: before.version },
      { expected_version: draft.version, expected_head_version: before.version - 1 },
    ]) {
      await expect(
        client.publish(draft.id, input, JSON.stringify(input), signal()),
      ).rejects.toMatchObject({ status: 409 })
      expect(await head(client)).toEqual(before)
      expect((await client.detail(draft.id, signal())).status).toBe('draft')
      if (!before.effective_id) throw new Error('缺少生效版')
      expect((await client.detail(before.effective_id, signal())).status).toBe('published')
    }
  })
  it('发布原子推进双版本、旧版归档可读但不能重发，词条不可变', async () => {
    const client = factory(() => true)
    const draft = await create(client)
    const before = await head(client)
    if (!before.effective_id) throw new Error('缺少旧版')
    const old = await client.detail(before.effective_id, signal())
    const input = { expected_version: draft.version, expected_head_version: before.version }
    const receipt = await client.publish(draft.id, input, 'publish', signal())
    expect(receipt).toMatchObject({ version: 2, status: 'published' })
    expect(await head(client)).toEqual({
      ...before,
      version: before.version + 1,
      effective_id: draft.id,
    })
    const archived = await client.detail(old.id, signal())
    expect(archived).toEqual({ ...old, version: old.version + 1, status: 'archived' })
    await expect(
      client.publish(
        old.id,
        { expected_version: archived.version, expected_head_version: (await head(client)).version },
        'republish',
        signal(),
      ),
    ).rejects.toMatchObject({ status: 409 })
    expect((await client.detail(draft.id, signal())).entries).toEqual(['合成新词'])
    expect(await client.publish(draft.id, input, 'publish', signal())).toEqual(receipt)
  })
  it('旧草案不能用最新head覆盖新生效版；同生效基准下较早草案可发布', async () => {
    const client = factory(() => true)
    const first = await create(client, 'first')
    const second = await create(client, 'second', ['另一快照'])
    // 创建了较晚草案并不改变生效版，较早草案仍可核对最新head发布。
    await client.publish(
      first.id,
      { expected_version: first.version, expected_head_version: (await head(client)).version },
      'first-publish',
      signal(),
    )
    const latest = await head(client)
    await expect(
      client.publish(
        second.id,
        { expected_version: second.version, expected_head_version: latest.version },
        'overwrite',
        signal(),
      ),
    ).rejects.toMatchObject({ status: 409 })
    expect(await head(client)).toEqual(latest)
    expect((await client.detail(second.id, signal())).status).toBe('draft')
  })
  it('并发创建和发布至多一个成功，重读后必须重新核对', async () => {
    const client = factory(() => true)
    const version = (await head(client)).version
    const attempts = await Promise.allSettled(
      ['a', 'b'].map((key) =>
        client.create({ kind: 'school', entries: [], expected_version: version }, key, signal()),
      ),
    )
    expect(attempts.filter((value) => value.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((value) => value.status === 'rejected')).toHaveLength(1)
    const fulfilled = attempts.find((value) => value.status === 'fulfilled')
    if (!fulfilled || fulfilled.status !== 'fulfilled') throw new Error('缺少草稿')
    const input = {
      expected_version: fulfilled.value.version,
      expected_head_version: (await head(client)).version,
    }
    const results = await Promise.allSettled(
      ['p1', 'p2'].map((key) => client.publish(fulfilled.value.id, input, key, signal())),
    )
    expect(results.filter((value) => value.status === 'fulfilled')).toHaveLength(1)
  })
  it('同键重放不推进head，异内容冲突；失败后同键可重新校验', async () => {
    const client = factory(() => true)
    const input = {
      kind: 'school' as const,
      entries: [],
      expected_version: (await head(client)).version,
    }
    const draft = await client.create(input, 'key', signal())
    const current = await head(client)
    expect(await client.create(input, 'key', signal())).toEqual(draft)
    expect(await head(client)).toEqual(current)
    await expect(
      client.create({ ...input, entries: ['新词'] }, 'key', signal()),
    ).rejects.toMatchObject({ status: 409 })
    const publish = { expected_version: draft.version, expected_head_version: current.version }
    await expect(
      client.publish(draft.id, { ...publish, expected_head_version: 1 }, 'retry', signal()),
    ).rejects.toMatchObject({ status: 409 })
    expect(await client.publish(draft.id, publish, 'retry', signal())).toMatchObject({
      status: 'published',
    })
  })
  it('边界拒绝缺失/重复heads、未知状态、缺失base及非法版本或词条', async () => {
    const client = factory(() => true)
    const valid = await client.list(null, signal())
    for (const heads of [
      undefined,
      [],
      Array(3).fill(valid.heads[0]),
      valid.heads.map((item) => ({ ...item, version: 0 })),
      valid.heads.map((item) => ({ ...item, effective_id: false })),
    ])
      expect(() => parseWordlistPage({ ...valid, heads })).toThrow()
    expect(() => parseWordlist({ id: 'x', kind: 'school', version: 1, status: 'draft' })).toThrow()
    expect(() => parseWordlist({ ...valid.items[0], status: 'future' })).toThrow()
    expect(() => parseWordlistDetail({ ...valid.items[0], entries: [' '] })).toThrow()
    await expect(
      client.create({ kind: 'crisis', entries: [' '], expected_version: 1 }, 'blank', signal()),
    ).rejects.toThrow()
    await expect(
      client.create({ kind: 'crisis', entries: [], expected_version: 0 }, 'bad-version', signal()),
    ).rejects.toMatchObject({ status: 400 })
    await expect(client.detail('unknown', signal())).rejects.toMatchObject({ status: 404 })
  })
  it('权限收回禁止详情与回执重放，列表/详情取消后失败', async () => {
    let allowed = true
    const client = factory(() => allowed)
    const input = { kind: 'crisis' as const, entries: [], expected_version: 1 }
    const draft = await client.create(input, 'key', signal())
    const publishInput = { expected_version: 1, expected_head_version: 2 }
    await client.publish(draft.id, publishInput, 'published-key', signal())
    allowed = false
    for (const pending of [
      client.list(null, signal()),
      client.detail(draft.id, signal()),
      client.publish(draft.id, publishInput, 'published-key', signal()),
      client.create(input, 'key', signal()),
      client.publish(draft.id, { expected_version: 1, expected_head_version: 2 }, 'p', signal()),
    ])
      await expect(pending).rejects.toMatchObject({ status: 403 })
    allowed = true
    for (const read of [
      (signal: AbortSignal) => client.list(null, signal),
      (signal: AbortSignal) => client.detail(draft.id, signal),
    ]) {
      const controller = new AbortController()
      const pending = read(controller.signal)
      controller.abort()
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    }
  })
  it('只影响后续合成匹配，保留旧结果实际快照id/version，不全量重扫历史', async () => {
    const client = factory(() => true)
    const body = '合成涉校词和替代词'
    const before = await client.demoScan(body, signal())
    const old = before.find((item) => item.kind === 'school')
    expect(old?.matches).toEqual(['合成涉校词'])
    const draft = await create(client, 'create', ['替代词'])
    expect(await client.demoScan(body, signal())).toEqual(before)
    await client.publish(
      draft.id,
      { expected_version: draft.version, expected_head_version: (await head(client)).version },
      'publish',
      signal(),
    )
    expect((await client.demoScan(body, signal())).find((item) => item.kind === 'school')).toEqual({
      kind: 'school',
      id: draft.id,
      version: 2,
      matches: ['替代词'],
    })
    expect(old).toMatchObject({
      id: 'synthetic-wordlist-school',
      version: 2,
      matches: ['合成涉校词'],
    })
  })
  it('不发送网络；生产环境列表、详情与写入失败关闭', async () => {
    const transport = vi.fn()
    vi.stubGlobal('fetch', transport)
    const client = factory(() => true)
    await client.list(null, signal())
    expect(transport).not.toHaveBeenCalled()
    vi.stubEnv('DEV', false)
    vi.resetModules()
    const disabled = (await import('./wordlists')).createWordlistClient(() => true)
    for (const pending of [
      disabled.list(null, signal()),
      disabled.detail('x', signal()),
      disabled.create({ kind: 'crisis', entries: [], expected_version: 1 }, 'x', signal()),
    ])
      await expect(pending).rejects.toMatchObject({ status: 503 })
  })
})
