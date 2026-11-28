import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { URL } from 'node:url'
import { handleSessionAndDashboard } from './browser-session.js'
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const base = process.env.ADMIN_TEST_URL ?? 'http://127.0.0.1:5173'
assert.equal(new URL(base).hostname, '127.0.0.1', '只允许本机合成回归')
const output = await mkdtemp(path.join(tmpdir(), 'moderation-browser-'))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const cases = [
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `pending-${String(i + 1).padStart(2, '0')}`,
    status: 'human_required',
    kind: i % 2 === 0 ? 'wish' : 'message',
    version: 1,
    content_version: 1,
  })),
  { id: 'approved-a', status: 'approved', kind: 'wish', version: 2, content_version: 1 },
  { id: 'rejected-a', status: 'rejected', kind: 'story', version: 2, content_version: 1 },
]
const queries = [],
  decisions = [],
  errors = [],
  unexpected = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/v1/admin/session') {
      await route.fulfill({
        json: {
          code: 0,
          message: '合成会话',
          request_id: 'synthetic',
          data: {
            token: 'synthetic',
            account: {
              id: 'synthetic',
              login_name: '合成审核员',
              version: 1,
              active: true,
              roles: ['review_operator'],
            },
          },
        },
      })
      return
    }
    if (await handleSessionAndDashboard(route)) return
    const casePath = '/api/v1/admin/moderation-tasks/pending-01'
    if (url.pathname === casePath) {
      await route.fulfill({
        json: {
          code: 0,
          message: '合成响应',
          request_id: 'synthetic',
          data: { ...cases[0], body: '合成点选案件正文' },
        },
      })
      return
    }
    if (url.pathname === `${casePath}/decision`) {
      const request = route.request()
      assert.equal(request.method(), 'POST')
      assert.ok(request.headers()['idempotency-key'])
      decisions.push(request.postDataJSON())
      await route.fulfill({
        json: {
          code: 0,
          message: '合成审核决定',
          request_id: 'synthetic',
          data: { content_decision: 'approved', business_outcome: 'cancelled', version: 2 },
        },
      })
      return
    }
    if (url.pathname !== '/api/v1/admin/moderation-tasks') {
      unexpected.push(url.pathname)
      await route.fulfill({ status: 404, json: {} })
      return
    }
    const q = url.searchParams
    queries.push(Object.fromEntries(q))
    const status = q.get('status') ?? 'human_required'
    assert.equal(q.has('q'), false)
    const items = cases.filter(
      (item) =>
        (status === 'all' || item.status === status) &&
        (!q.has('kind') || q.get('kind') === item.kind),
    )
    const start = Number(q.get('cursor') ?? 0),
      limit = Number(q.get('limit') ?? 10)
    await route.fulfill({
      json: {
        code: 0,
        message: '合成响应',
        request_id: 'synthetic',
        data: {
          items: items.slice(start, start + limit),
          next_cursor: items.length > start + limit ? String(start + limit) : null,
        },
      },
    })
  })
  await page.goto(`${base}/moderation`)
  await page.getByText('pending-01', { exact: true }).waitFor()
  assert.equal(queries[0].status, 'human_required')
  assert.equal(await page.locator('tbody tr').count(), 10)
  assert.equal(await page.getByRole('form', { name: '审核案件筛选' }).locator('input').count(), 0)
  await Promise.all([
    page.waitForResponse(
      (response) => new URL(response.url()).searchParams.get('status') === 'all',
    ),
    page.getByLabel('审核状态').selectOption('all'),
  ])
  await page.getByText('pending-01', { exact: true }).waitFor()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await page.getByText('approved-a', { exact: true }).waitFor()
  const rows = await page.locator('tbody tr').allTextContents()
  assert.ok(rows[0].includes('pending-11'))
  assert.ok(rows[1].includes('pending-12'))
  assert.ok(rows[2].includes('approved-a'))
  await page.getByLabel('审核状态').selectOption('approved')
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).searchParams.get('kind') === 'wish'),
    page.getByLabel('内容类型').selectOption('wish'),
  ])
  await page.waitForFunction(() => globalThis.document.querySelectorAll('tbody tr').length === 1)
  assert.equal(queries.at(-1).cursor, undefined)
  assert.equal(queries.at(-1).status, 'approved')
  assert.equal(queries.at(-1).kind, 'wish')
  for (const close of await page.getByRole('button', { name: '关闭提示', exact: true }).all())
    await close.click()
  await page.screenshot({
    path: path.join(output, 'desktop-filter.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(async () => {
    await globalThis.document.fonts.ready
    await new Promise((resolve) => globalThis.requestAnimationFrame(resolve))
  })
  await page.screenshot({
    path: path.join(output, 'mobile-filter.png'),
    fullPage: true,
    animations: 'disabled',
  })
  assert.equal(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
    true,
  )
  await page.getByRole('button', { name: '重置筛选', exact: true }).click()
  await page.getByText('pending-01', { exact: true }).waitFor()
  assert.equal(queries.at(-1).status, 'human_required')
  assert.equal(queries.at(-1).q, undefined)
  assert.equal(queries.at(-1).kind, undefined)
  await page.getByRole('button', { name: '查看第 1 条案件', exact: true }).click()
  await page.getByText('合成点选案件正文', { exact: true }).waitFor()
  await page.getByRole('button', { name: '处理内容审核', exact: true }).click()
  await page.getByRole('button', { name: '核对操作', exact: true }).click()
  await page.getByRole('button', { name: '确认提交', exact: true }).click()
  await page.getByRole('heading', { name: '审核回执', exact: true }).waitFor()
  assert.deepEqual(decisions, [{ expected_version: 1, decision: 'approved' }])
  assert.deepEqual(errors, [])
  assert.deepEqual(unexpected, [])
  process.stdout.write(`内容审核类型与状态筛选、列表点选处理、窄屏回归通过：${output}\n`)
} finally {
  await browser.close()
}
