import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { URL } from 'node:url'
import { handleSessionAndDashboard } from './browser-session.js'
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const base = process.env.ADMIN_TEST_URL ?? 'http://127.0.0.1:5178'
assert.equal(new URL(base).hostname, '127.0.0.1', '只允许本机合成回归')
const output = await mkdtemp(path.join(tmpdir(), 'traits-admin-browser-'))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const samples = [
  '温柔',
  '有耐心',
  '喜欢运动',
  '爱看电影',
  '真诚',
  '情绪稳定',
  '善良',
  '有责任心',
  '幽默',
  '独立',
  '热爱生活',
  '尊重他人',
  '开朗',
  '喜欢旅行',
  '乐观',
  '细心',
  '自律',
  '善于沟通',
  '爱读书',
  '喜欢音乐',
  '有好奇心',
  '行动力强',
  '认真',
  '体贴',
]
const items = samples.map((name, i) => ({
  id: `aa110000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  name,
  heat: 100 - i * 3,
  status: 'approved',
  version: 1,
  male_count: 40,
  female_count: 30,
  undisclosed_count: 0,
  created_at: '2026-11-11T00:00:00Z',
  reason: '',
}))
const reviewItem = { ...items[0], status: 'pending' }
const queries = [],
  writes = [],
  errors = [],
  unexpected = []
let failOnce = true
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/v1/**', async (route) => {
    if (await handleSessionAndDashboard(route)) return
    const request = route.request(),
      url = new URL(request.url())
    let data
    if (url.pathname === '/api/v1/admin/content/hot') data = { items: [] }
    else if (url.pathname === '/api/v1/admin/sessions')
      data = {
        token: 'synthetic-traits',
        account: {
          id: 'synthetic',
          login_name: '合成管理员',
          version: 1,
          active: true,
          roles: ['review_operator'],
        },
      }
    else if (request.method() === 'POST' && url.pathname.endsWith('/review')) {
      writes.push({ body: request.postDataJSON(), key: request.headers()['idempotency-key'] })
      if (failOnce) {
        failOnce = false
        await route.abort('failed')
        return
      }
      reviewItem.status = request.postDataJSON().decision
      reviewItem.version++
      data = { id: reviewItem.id }
    } else if (url.pathname === `/api/v1/admin/matchmaking/traits/${reviewItem.id}`)
      data = {
        ...reviewItem,
        evidence: {
          matches: [
            { word: '温柔', source: 'custom', kind: 'hint', disposition: 'hint', start: 0, end: 2 },
          ],
          routes: ['hint'],
        },
      }
    else if (
      url.pathname === '/api/v1/admin/matchmaking/traits' ||
      url.pathname.endsWith('/traits/cloud')
    ) {
      queries.push(url.searchParams)
      const filtered =
        url.searchParams.get('status') === 'pending'
          ? reviewItem.status === 'pending'
            ? [reviewItem]
            : []
          : items
      data = {
        items: url.pathname.endsWith('/cloud') ? filtered : filtered.slice(0, 20),
        total: filtered.length,
      }
    } else {
      unexpected.push(url.pathname)
      await route.fulfill({ status: 404, json: {} })
      return
    }
    await route.fulfill({
      json: { code: 0, message: '合成响应', request_id: 'synthetic-traits', data },
    })
  })
  await page.goto(`${base}/login`)
  await page.getByLabel('后台账号').fill('synthetic')
  await page.getByLabel('口令', { exact: true }).fill('synthetic-password')
  await page.getByRole('button', { name: '登录后台', exact: true }).click()
  await page.waitForURL(`${base}/`)
  // 使用站内路由导航，保留当前内存会话。
  await page.getByRole('button', { name: /包分配/ }).click()
  await page.getByRole('link', { name: '特质标签', exact: true }).click()
  await page.getByRole('heading', { name: '共 24 个词条' }).waitFor()
  await page.getByRole('button', { name: '热度词云' }).click()
  await page.locator('svg[aria-label^="特质标签"] text').first().waitFor()
  assert.equal(await page.locator('svg[aria-label^="特质标签"] text').count(), 24)
  const bounds = await page.locator('svg[aria-label^="特质标签"] text').evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBBox()
      return { x: box.x, y: box.y, width: box.width, height: box.height }
    }),
  )
  for (let i = 0; i < bounds.length; i++) {
    const a = bounds[i]
    assert.ok(a.x >= 0 && a.x + a.width <= 1000 && a.y >= 0 && a.y + a.height <= 600)
    for (let j = i + 1; j < bounds.length; j++) {
      const b = bounds[j]
      assert.ok(
        !(
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y
        ),
        '词云文本不可重叠',
      )
    }
  }
  await page.screenshot({ path: path.join(output, 'desktop-cloud.png'), fullPage: true })
  await page.getByLabel('选用者性别').selectOption('female')
  await page.getByLabel('标签用途').selectOption('personal')
  await page.getByLabel('最低热度').fill('5')
  const filteredResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/traits/cloud?') && response.url().includes('gender=female'),
  )
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await filteredResponse
  assert.ok(
    queries
      .slice(-2)
      .every(
        (query) =>
          query.get('gender') === 'female' &&
          query.get('min_heat') === '5' &&
          query.get('purpose') === 'personal',
      ),
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(output, 'mobile-cloud.png'), fullPage: true })
  assert.equal(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
    true,
    '窄屏页面不应横向溢出',
  )
  await page.getByLabel('审核状态').selectOption('pending')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await page.getByRole('heading', { name: '共 1 个词条', exact: true }).waitFor()
  await page.getByRole('button', { name: '标签列表' }).click()
  await page.getByRole('button', { name: '查看与审核', exact: true }).click()
  await page.getByRole('heading', { name: '词库命中依据' }).waitFor()
  await page.getByRole('button', { name: '驳回词条', exact: true }).click()
  assert.equal(writes.length, 0)
  await page.getByLabel('审核说明（驳回必填）').fill('词条不符合规则')
  await page.getByRole('button', { name: '驳回词条', exact: true }).click()
  await page.getByRole('button', { name: '原样重试', exact: true }).waitFor()
  await page.screenshot({ path: path.join(output, 'mobile-review.png'), fullPage: true })
  await page.getByRole('button', { name: '原样重试', exact: true }).click()
  await page.getByRole('heading', { name: '共 0 个词条', exact: true }).waitFor()
  assert.deepEqual(writes[0], writes[1])
  assert.equal(writes.length, 2)
  assert.deepEqual(errors, [])
  assert.deepEqual(unexpected, [])
  process.stdout.write(`特质筛选、词云无重叠、窄屏和审核原样重试通过：${output}\n`)
} finally {
  await browser.close()
}
