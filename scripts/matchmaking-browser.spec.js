import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
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
const output = await mkdtemp(path.join(tmpdir(), 'matchmaking-browser-'))
const browser = await chromium.launch({
  channel: process.env.ADMIN_TEST_BROWSER_CHANNEL ?? 'chrome',
  headless: true,
})
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'America/Los_Angeles',
  })
  const page = await context.newPage()
  const errors = []
  const unexpected = []
  const commands = []
  const workspace = globalThis.structuredClone(fixture.workspace.data)
  const activity = workspace.activity
  const endpoint = `/api/v1/admin/matchmaking/activities/${activity.id}`
  let failOnce = true
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => dialog.accept())
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    let data
    if (await handleSessionAndDashboard(route)) return
    if (pathname === '/api/v1/admin/sessions') {
      data = {
        token: 'synthetic-matchmaking-token',
        account: {
          id: 'synthetic',
          login_name: '包分配合成回归',
          version: 1,
          active: true,
          roles: ['review_operator'],
        },
      }
    } else if (request.method() === 'GET' && pathname === endpoint) data = workspace
    else if (request.method() === 'GET' && pathname === '/api/v1/admin/matchmaking/activities')
      data = { items: [activity], total: 1 }
    else if (request.method() === 'PUT' && pathname === endpoint) {
      const body = request.postDataJSON()
      commands.push({ key: request.headers()['idempotency-key'], body })
      if (failOnce) {
        failOnce = false
        await route.abort('failed')
        return
      }
      assert.deepEqual(
        Object.keys(body).sort(),
        [
          'expected_version',
          'title',
          'description',
          'days',
          'registration_opens_at',
          'registration_closes_at',
          'results_at',
          'starts_at',
          'ends_at',
        ].sort(),
      )
      assert.equal(body.expected_version, activity.version)
      Object.assign(activity, body, { version: activity.version + 1 })
      data = { id: activity.id }
    } else if (pathname === `${endpoint}/publish`) {
      assert.equal(request.postDataJSON().expected_version, activity.version)
      Object.assign(activity, {
        status: 'published',
        phase: 'registration',
        version: activity.version + 1,
      })
      data = { id: activity.id }
    } else if (pathname === `${endpoint}/enrollments/${workspace.enrollments[0].id}/review`) {
      const body = request.postDataJSON()
      assert.equal(body.expected_version, workspace.enrollments[0].version)
      assert.equal(body.decision, 'approved')
      Object.assign(workspace.enrollments[0], {
        status: 'approved',
        eligible: true,
        version: body.expected_version + 1,
      })
      data = { id: workspace.enrollments[0].id }
    } else {
      unexpected.push(`${request.method()} ${pathname}`)
      await route.fulfill({ status: 404, json: { code: 404 } })
      return
    }
    await route.fulfill({
      json: { code: 0, message: '合成响应', request_id: 'synthetic-browser', data },
    })
  })
  await page.goto(`${base}/login`)
  await page.getByLabel('后台账号').fill('synthetic')
  await page.getByLabel('口令', { exact: true }).fill('synthetic-password')
  await page.getByRole('button', { name: '登录后台', exact: true }).click()
  await page.waitForURL(`${base}/`)
  await page.getByRole('button', { name: '活动管理', exact: true }).click()
  await page.getByRole('link', { name: '包分配活动', exact: true }).click()
  await page.getByRole('button', { name: /冬日相遇/ }).click()
  assert.equal(await page.getByLabel('首日任务开始（北京时间）').inputValue(), '2026-12-07T09:00')
  await page.getByLabel('活动名称', { exact: true }).fill('一起度过冬天')
  await page.getByRole('button', { name: '保存活动草稿', exact: true }).click()
  await page.getByRole('button', { name: '原样重试', exact: true }).waitFor()
  assert.equal(await page.getByLabel('活动名称', { exact: true }).isDisabled(), true)
  // 路由离开只清展示，返回后继续保留原始命令与输入快照。
  await page
    .getByRole('navigation', { name: '管理菜单' })
    .getByRole('link', { name: '首页', exact: true })
    .click()
  await page.waitForURL(`${base}/`)
  await page.getByRole('button', { name: '活动管理', exact: true }).click()
  await page.getByRole('link', { name: '包分配活动', exact: true }).click()
  await page.getByRole('button', { name: '原样重试', exact: true }).waitFor()
  assert.equal(await page.getByLabel('活动名称', { exact: true }).inputValue(), '一起度过冬天')
  assert.equal(await page.getByRole('button', { name: '新建活动', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '原样重试', exact: true }).click()
  await page.getByRole('heading', { name: '一起度过冬天', exact: true }).waitFor()
  assert.equal(commands.length, 2)
  assert.deepEqual(commands[0], commands[1])
  assert.equal(commands[1].body.starts_at, '2026-12-07T01:00:00.000Z')
  await page.getByRole('button', { name: '发布活动', exact: true }).click()
  await page.getByText('发布活动已成功，当前状态已刷新。', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('活动名称', { exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '报名与配对', exact: true }).click()
  await page.getByRole('button', { name: '查看与审核', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '通过报名', exact: true }).isEnabled(), true)
  await page.getByRole('button', { name: '通过报名', exact: true }).click()
  await page.getByRole('cell', { name: '已通过', exact: true }).waitFor()
  await page.screenshot({ path: path.join(output, 'matchmaking-desktop.png'), fullPage: true })
  // 冻结标记来自全部历史，不依赖当前分页是否包含已发布关系。
  workspace.templates_locked = true
  workspace.pairs = []
  workspace.pair_total = 21
  await page.getByRole('button', { name: '重新读取', exact: true }).click()
  await page.getByText('活动状态已刷新', { exact: true }).waitFor()
  await page.getByRole('button', { name: '每日任务', exact: true }).click()
  await page
    .getByText('已有配对结果发布，任务模板已冻结。历史任务内容保持不变。', { exact: true })
    .waitFor()
  assert.equal(
    await page.getByRole('button', { name: '保存任务模板', exact: true }).isDisabled(),
    true,
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '保存任务模板', exact: true }).scrollIntoViewIfNeeded()
  assert.ok(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
    ),
    '窄屏不出现整页横向溢出',
  )
  await page.screenshot({ path: path.join(output, 'matchmaking-mobile.png'), fullPage: true })
  assert.deepEqual(errors, [])
  assert.deepEqual(unexpected, [])
  await writeFile(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        boundary: '全部业务接口为本地合成拦截，不连接真实后端',
        checks: [
          '审核岗导航',
          '北京时间与异地时区',
          '详情更新字段白名单',
          '未知结果原键重试',
          '离页重入保留原始命令',
          '活动发布冻结',
          '待审核资格语义',
          '跨分页模板冻结',
          '桌面与窄屏',
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  )
  process.stdout.write(`包分配浏览器合成回归通过：${output}\n`)
  await context.close()
} finally {
  await browser.close()
}
