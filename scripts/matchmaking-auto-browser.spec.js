import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { URL } from 'node:url'
import { handleSessionAndDashboard } from './browser-session.js'
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const base = process.env.ADMIN_TEST_URL ?? 'http://127.0.0.1:5173'
assert.equal(new URL(base).hostname, '127.0.0.1', '只允许本机合成回归')
const fixture = JSON.parse(
  await readFile(
    new URL('../src/services/matchmaking.contract.spec.json', import.meta.url),
    'utf8',
  ),
)
const jobFixture = JSON.parse(
  await readFile(
    new URL('../src/services/matchmaking-auto.contract.spec.json', import.meta.url),
    'utf8',
  ),
)
const workspace = fixture.workspace.data,
  activity = workspace.activity
Object.assign(activity, { version: 8, status: 'published', phase: 'matching' })
workspace.enrollments[0].profile.personal_traits = ['温柔']
workspace.enrollments[0].profile.ideal_traits = ['真诚']
const make = (n) => ({
  enrollment_id: `cc330000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  name: `合成参与者${n}`,
})
const pairs = Array.from({ length: 498 }, (_, i) => ({
  first: make(i * 2 + 1),
  second: make(i * 2 + 2),
  score: 120 + (i % 3) * 2.5,
  score_details: {
    ...jobFixture.pairs[0].score_details,
    preferred_campus: (i % 3) * 2.5,
    preferred_mbti: 0,
  },
}))
const job = {
  ...jobFixture,
  status: 'running',
  participant_count: 1000,
  eligible_count: 998,
  paired_count: 498,
  unmatched_count: 2,
  excluded_count: 2,
  total_score: pairs.reduce((sum, pair) => sum + pair.score, 0),
  pairs,
  unmatched: [
    { ...make(997), reason: 'competition' },
    { ...make(998), reason: 'no_candidate' },
  ],
  excluded: [
    { ...make(999), reason: 'occupied' },
    { ...make(1000), reason: 'not_approved' },
  ],
}
const output = await mkdtemp(path.join(tmpdir(), 'auto-pairing-browser-'))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let created = false,
  readCount = 0,
  failApply = true,
  failJobRead = true,
  readFailures = 0
const writes = [],
  errors = [],
  unexpected = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      endpoint = `/api/v1/admin/matchmaking/activities/${activity.id}`
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
              login_name: '合成自动分配审核员',
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
    let data
    if (url.pathname === '/api/v1/admin/matchmaking/activities')
      data = { items: [activity], total: 1 }
    else if (url.pathname === endpoint) data = workspace
    else if (url.pathname === `${endpoint}/auto-pairing-jobs` && request.method() === 'POST') {
      writes.push({
        path: url.pathname,
        key: request.headers()['idempotency-key'],
        body: request.postDataJSON(),
      })
      created = true
      data = { id: job.id }
    } else if (
      url.pathname === `${endpoint}/auto-pairing-jobs/latest` ||
      url.pathname === `${endpoint}/auto-pairing-jobs/${job.id}`
    ) {
      if (!created) {
        await route.fulfill({ status: 404, json: { code: 404 } })
        return
      }
      if (failJobRead) {
        failJobRead = false
        readFailures++
        await route.abort('failed')
        return
      }
      readCount++
      if (readCount > 1 && job.status === 'running') job.status = 'ready'
      data = job
    } else if (url.pathname === `${endpoint}/auto-pairing-jobs/${job.id}/apply`) {
      writes.push({
        path: url.pathname,
        key: request.headers()['idempotency-key'],
        body: request.postDataJSON(),
      })
      if (failApply) {
        failApply = false
        await route.abort('failed')
        return
      }
      job.status = 'applied'
      job.version++
      activity.version++
      workspace.pair_total = 499
      workspace.pairs.push({
        id: 'dd440000-0000-4000-8000-000000000001',
        version: 1,
        status: 'draft',
        score: 120,
        score_details: pairs[0].score_details,
        algorithm: job.algorithm,
        enrollments: [pairs[0].first.enrollment_id, pairs[0].second.enrollment_id],
        member_names: [pairs[0].first.name, pairs[0].second.name],
        accessible: false,
        reason: '',
      })
      data = { id: job.id }
    } else {
      unexpected.push(url.pathname)
      await route.fulfill({ status: 404, json: {} })
      return
    }
    await route.fulfill({ json: { code: 0, message: '合成响应', request_id: 'synthetic', data } })
  })
  await page.goto(`${base}/matchmaking`)
  await page.getByRole('button', { name: /冬日相遇/ }).click()
  await page.getByRole('button', { name: '报名与配对', exact: true }).click()
  await page.getByRole('button', { name: '查看与审核', exact: true }).first().click()
  assert.ok((await page.locator('.match-profile').textContent()).includes('个人特质温柔'))
  await page.getByRole('button', { name: '配对记录', exact: true }).click()
  const launcher = page.getByRole('region', { name: '全员自动分配', exact: true })
  await launcher.getByRole('button', { name: '自动分配', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '全员自动分配', exact: true })
  await panel.getByRole('progressbar', { name: '后台分配计算进度', exact: true }).waitFor()
  await panel.locator('.el-dialog__headerbtn').click()
  await launcher.getByRole('button', { name: '查看最近方案', exact: true }).click()
  await panel.getByRole('button', { name: '确认应用为待发布配对', exact: true }).waitFor()
  assert.equal(readFailures, 1, '创建成功后的首次读取断网仍可恢复任务')
  assert.equal(writes[0].body.expected_version, 8)
  assert.equal(writes.length, 1)
  await panel.getByRole('button', { name: '查看匹配方案', exact: true }).click()
  const details = page.getByRole('dialog', { name: '匹配方案列表', exact: true })
  assert.equal(await details.locator('.auto-pair').count(), 20)
  assert.equal(await panel.locator('.auto-stats dd').first().textContent(), '1000')
  assert.ok((await details.locator('.auto-pair').first().textContent()).includes('合成参与者5'))
  await details.getByLabel('匹配方案排序').selectOption('asc')
  assert.ok((await details.locator('.auto-pair').first().textContent()).includes('合成参与者1'))
  await details.getByLabel('匹配方案排序').selectOption('original')
  assert.ok(
    (await details.locator('.auto-pair').first().textContent()).includes('基础 100 + 标签 20'),
  )
  await details.getByRole('button', { name: '下一页预览', exact: true }).click()
  assert.ok((await details.locator('.auto-pair').first().textContent()).includes('合成参与者41'))
  while (await page.getByRole('button', { name: '关闭提示', exact: true }).count())
    await page.getByRole('button', { name: '关闭提示', exact: true }).first().click()
  await page.screenshot({
    path: path.join(output, 'desktop-preview.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await details.locator('.el-dialog__headerbtn').click()
  await page.screenshot({ path: path.join(output, 'desktop-summary.png'), animations: 'disabled' })
  await panel.getByRole('button', { name: '查看匹配方案', exact: true }).click()
  await details.getByRole('button', { name: '未匹配原因（2）', exact: true }).click()
  assert.ok((await details.textContent()).includes('没有满足条件的候选'))
  await details.getByRole('button', { name: '未参与原因（2）', exact: true }).click()
  assert.ok((await details.textContent()).includes('保持原配对'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: path.join(output, 'mobile-reasons.png'),
    fullPage: true,
    animations: 'disabled',
  })
  assert.equal(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
    true,
  )
  await details.locator('.el-dialog__headerbtn').click()
  await panel.locator('.el-dialog__headerbtn').click()
  await launcher.getByRole('button', { name: '查看最近方案', exact: true }).click()
  await panel.getByRole('button', { name: '重新生成', exact: true }).waitFor()
  assert.equal(writes.length, 1, '只读查看不创建任务')
  await panel.locator('.el-dialog__headerbtn').click()
  await launcher.getByRole('button', { name: '自动分配', exact: true }).click()
  await panel.getByRole('button', { name: '确认应用为待发布配对', exact: true }).waitFor()
  assert.equal(writes.length, 2, '再次自动分配创建新任务')
  assert.notEqual(writes[0].key, writes[1].key)
  await panel.getByRole('button', { name: '确认应用为待发布配对', exact: true }).click()
  await panel.getByRole('button', { name: '确认应用 498 组', exact: true }).click()
  await panel.getByRole('button', { name: '原样重试自动分配', exact: true }).waitFor()
  await panel.getByRole('button', { name: '原样重试自动分配', exact: true }).click()
  await panel.getByText('已应用为待发布配对', { exact: true }).waitFor()
  assert.deepEqual(writes[2], writes[3])
  assert.equal(writes[2].body.expected_version, 3)
  assert.equal(writes[2].body.activity_version, 8)
  assert.ok(
    (await page.getByRole('region', { name: '配对记录', exact: true }).textContent()).includes(
      '合成参与者1',
    ),
  )
  assert.deepEqual(errors, [])
  assert.deepEqual(unexpected, [])
  process.stdout.write(
    `全员自动分配合成1000人预览、后台轮询、本地分页、双向标签、原因、确认与原键重试通过：${output}\n`,
  )
} finally {
  await browser.close()
}
