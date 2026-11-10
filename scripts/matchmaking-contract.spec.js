import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { createServer } from 'vite'

// 显式读取本轮真实HTTP捕获；不存在或格式异常时失败，不用合成夹具替代。
const capturePath = process.argv[2]
assert.ok(capturePath, '请传入本轮包分配 HTTP 捕获文件路径')
const exchanges = JSON.parse(await readFile(capturePath, 'utf8'))
assert.ok(Array.isArray(exchanges), '捕获必须是请求响应数组')
const vite = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})
try {
  const boundary = await vite.ssrLoadModule('/src/services/matchmaking.ts')
  const counts = { lists: 0, workspaces: 0, candidates: 0, receipts: 0 }
  let redacted = false
  let locked = false
  let empty = false
  const states = new Set()
  for (const exchange of exchanges) {
    if (exchange.status !== 200 || !exchange.path.startsWith('/admin/matchmaking/activities'))
      continue
    const path = exchange.path.split('?')[0]
    if (exchange.method !== 'GET') {
      const client = boundary.createMatchmakingClient(
        'synthetic-capture',
        () => true,
        () => Promise.resolve(globalThis.Response.json(exchange.body)),
      )
      const receipt = await client.execute(
        {
          path,
          method: exchange.method,
          body: { expected_version: 1, reason: '' },
          key: 'capture-only',
          title: '协议捕获核对',
          activityID: '',
        },
        new globalThis.AbortController().signal,
      )
      assert.equal(receipt.id, exchange.body.data.id)
      counts.receipts++
    } else if (path === '/admin/matchmaking/activities') {
      boundary.parseActivityPage(exchange.body)
      counts.lists++
    } else if (path.includes('/candidates/')) {
      boundary.parseCandidates(exchange.body)
      counts.candidates++
    } else {
      const value = boundary.parseMatchmakingWorkspace(exchange.body)
      for (const row of value.enrollments) {
        redacted ||= row.profile === undefined
        states.add(row.status)
      }
      for (const row of value.pairs) states.add(row.status)
      locked ||= value.templates_locked
      empty ||= value.enrollments.length === 0 && value.pairs.length === 0
      counts.workspaces++
    }
  }
  for (const count of Object.values(counts)) assert.ok(count > 0, '缺少必须的实际响应类型')
  assert.ok(redacted && locked && empty, '捕获必须覆盖注销遮蔽、模板冻结和空工作台')
  for (const state of ['pending', 'approved', 'withdrawn', 'draft', 'published', 'ended'])
    assert.ok(states.has(state), `捕获缺少必须的业务状态：${state}`)
  globalThis.console.info('包分配实际 HTTP 管理端边界核对通过', { ...counts, states: [...states] })
} finally {
  await vite.close()
}
