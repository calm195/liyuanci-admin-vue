import { handleSessionAndDashboard } from './browser-session.js'
import console from 'node:console'
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { URL } from 'node:url'

// 合成传输用于浏览器回归；页面、路由、会话与解析器执行实际实现。
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const base = process.env.ADMIN_TEST_URL ?? 'http://127.0.0.1:5173'
assert.equal(new URL(base).hostname, '127.0.0.1', '仅允许测试本机页面')
const output =
  process.env.ADMIN_TEST_OUTPUT ?? (await mkdtemp(path.join(tmpdir(), 'users-browser-')))
await mkdir(output, { recursive: true })
const fixtures = JSON.parse(
  await readFile(new URL('../src/services/users.contract.spec.json', import.meta.url), 'utf8'),
)
const detail = fixtures.fixtures.find((item) => item.name === 'detail-valid').body
const summary = fixtures.fixtures.find((item) => item.name === 'nullable-name').body
const penalty = fixtures.fixtures.find((item) => item.name === 'penalty-valid').body
const nickname = '<img src=x onerror=alert(1)>'
const reportID = penalty.case_link.id
const appealID = penalty.appeal_id
const reviewID = 'ac220000-0000-4000-8000-000000000041'
const reviewPenalty = {
  ...penalty,
  id: 'ac220000-0000-4000-8000-000000000012',
  reason: '合成历史第二页',
  case_link: { kind: 'ordinary_review', id: reviewID },
  appeal_id: null,
}
const report = {
  id: reportID,
  status: 'resolved',
  version: 7,
  kind: 'wish',
  target_kind: 'wish',
  target_id: 'synthetic-wish',
  content_ref: 'synthetic-registry',
  content_version: 3,
  type_code: 'synthetic',
  subject_id: detail.id,
  body: '合成已确认举报正文',
  description: '合成举报说明',
  reason: null,
}
const results = []
const failures = []
const browser = await chromium.launch({
  channel: process.env.ADMIN_TEST_BROWSER_CHANNEL ?? 'chrome',
  headless: true,
})
try {
  for (const role of ['super_admin', 'review_operator', 'crisis_operator']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    let fail = false
    let control = {
      user_id: detail.id,
      account_version: 7,
      banned: false,
      muted: false,
      muted_until: null,
      as_of: detail.as_of,
      allowed_actions: ['ban', 'mute'],
    }
    const queries = []
    const historyQueries = []
    await page.route('**/api/v1/**', async (route) => {
      if (await handleSessionAndDashboard(route)) return
      const request = route.request()
      const url = new URL(request.url())
      let data
      if (url.pathname === '/api/v1/admin/sessions')
        data = {
          token: 'synthetic',
          account: {
            id: 'synthetic',
            login_name: '合成账号',
            version: 1,
            active: true,
            roles: [role],
          },
        }
      else if (request.method() === 'DELETE' && url.pathname === '/api/v1/admin/session') {
        await route.fulfill({ status: 204 })
        return
      } else {
        assert.equal(request.headers()['authorization'], 'Bearer synthetic')
        if (url.pathname === '/api/v1/admin/users') {
          queries.push(Object.fromEntries(url.searchParams))
          if (fail) {
            await route.fulfill({
              status: 503,
              json: {
                code: 503,
                message: '合成失败',
                error_code: 'DEPENDENCY_UNAVAILABLE',
                request_id: 'synthetic',
              },
            })
            return
          }
          data = {
            items: [
              {
                ...summary,
                id: detail.id,
                display_name: nickname,
                restriction: control.banned ? 'banned' : control.muted ? 'muted' : 'normal',
                muted_until: control.banned ? null : control.muted_until,
              },
              { ...summary, display_name: '同名小鲤', restriction: 'normal', muted_until: null },
            ],
            next_cursor: url.searchParams.has('cursor') ? null : 'synthetic-next',
          }
        } else if (url.pathname === `/api/v1/admin/users/${detail.id}`) {
          data = {
            ...detail,
            display_name: nickname,
            account_version: control.account_version,
            restriction: control.banned ? 'banned' : control.muted ? 'muted' : 'normal',
            muted_until: control.banned ? null : control.muted_until,
            active_penalties: control.muted ? detail.active_penalties : [],
          }
        } else if (url.pathname === `/api/v1/admin/users/${detail.id}/penalties`) {
          assert.equal(request.method(), 'GET')
          historyQueries.push(url.searchParams.get('cursor'))
          const secondPage = url.searchParams.get('cursor') === 'history-next'
          data = {
            items: [secondPage ? reviewPenalty : penalty],
            next_cursor: secondPage ? null : 'history-next',
          }
        } else if (url.pathname.startsWith(`/api/v1/admin/users/${detail.id}/restrictions`)) {
          assert.equal(role, 'super_admin')
          if (request.method() === 'POST') {
            const action = url.pathname.split('/').at(-1)
            const input = request.postDataJSON()
            assert.equal(input.expected_version, control.account_version)
            assert.ok(input.reason)
            assert.ok(request.headers()['idempotency-key'])
            if (action === 'ban') control.banned = true
            if (action === 'unban') control.banned = false
            if (action === 'mute') {
              control.muted = true
              control.muted_until = '2026-11-05T04:00:00Z'
            }
            if (action === 'unmute') {
              control.muted = false
              control.muted_until = null
            }
            control.account_version++
            control.allowed_actions = [
              control.banned ? 'unban' : 'ban',
              control.muted ? 'unmute' : 'mute',
            ]
          }
          data = control
        } else if (url.pathname === '/api/v1/admin/reports') {
          data = { items: [report], next_cursor: null }
        } else if (url.pathname === `/api/v1/admin/reports/${reportID}`) data = report
        else if (url.pathname === '/api/v1/admin/appeals') {
          data = { items: [], next_cursor: null }
        } else if (url.pathname === `/api/v1/admin/appeals/${appealID}`) {
          data = {
            id: appealID,
            version: 4,
            status: 'pending',
            penalty_id: penalty.id,
            body: '合成关联申诉正文',
            penalty_reason: '合成原处罚理由',
            reason: null,
          }
        } else if (url.pathname === '/api/v1/admin/moderation-tasks') {
          data = { items: [], next_cursor: null }
        } else if (url.pathname === `/api/v1/admin/moderation-tasks/${reviewID}`) {
          assert.notEqual(role, 'crisis_operator')
          data = {
            id: reviewID,
            status: 'rejected',
            version: 1,
            content_version: 3,
            body: '合成关联内容审核正文',
          }
        } else {
          failures.push(`未定义请求：${request.method()} ${url.pathname}`)
          await route.abort()
          return
        }
      }
      await route.fulfill({
        status: 200,
        headers: { 'Cache-Control': 'no-store', 'X-Request-ID': 'synthetic' },
        json: { code: 0, message: '成功', request_id: 'synthetic', data },
      })
    })
    await page.goto(`${base}/login`)
    await page.getByLabel('后台账号', { exact: true }).fill('synthetic')
    await page.getByLabel('口令', { exact: true }).fill('synthetic-only')
    await page.getByRole('button', { name: '登录后台', exact: true }).click()
    await page.waitForURL(`${base}/`)
    await page.getByRole('button', { name: '用户管理', exact: true }).click()
    await page.getByRole('link', { name: '平台用户', exact: true }).click()
    await page.locator('tbody tr').first().waitFor()
    assert.equal(await page.locator('tbody img').count(), 0)
    for (const [theme, label] of [
      ['light', '浅色'],
      ['dark', '深色'],
    ]) {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.getByText(label, { exact: true }).click()
      assert.equal(await page.locator(`input[value="${theme}"]`).isChecked(), true)
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.screenshot({
          path: path.join(output, `${role}-${theme}-${width}-list.png`),
          fullPage: true,
          animations: 'disabled',
        })
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    assert.equal(await page.getByLabel('用户 ID', { exact: true }).count(), 0)
    const target = page.getByRole('row').filter({ hasText: nickname })
    const userDrawer = page.getByRole('dialog', { name: nickname, exact: true })
    const historyList = userDrawer.getByRole('region', { name: '处罚历史', exact: true })
    const openUser = async () => {
      await target.getByRole('button', { name: /查看.*资料/ }).click()
      await historyList.getByText(penalty.reason, { exact: true }).waitFor()
    }
    await openUser()
    if (role === 'super_admin') {
      for (const [label, kind, active] of [
        ['封禁', '封禁', true],
        ['禁言', '禁言', true],
        ['解封', '封禁', false],
        ['取消禁言', '禁言', false],
      ]) {
        const toggle = userDrawer.getByRole('switch', { name: new RegExp(`的${kind}$`) })
        await toggle.click()
        const dialog = page.getByRole('dialog', { name: label, exact: true })
        assert.equal(await dialog.getByText(detail.id, { exact: true }).count(), 0)
        await dialog.getByLabel('操作理由（必填）', { exact: true }).fill('合成用户操作理由')
        await dialog.getByRole('button', { name: '核对用户操作', exact: true }).click()
        await dialog.getByRole('button', { name: `确认${label}`, exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await userDrawer
          .locator(`[role="switch"][aria-label$="的${kind}"][aria-checked="${active}"]`)
          .waitFor()
      }
      assert.equal(control.account_version, 11)
      assert.equal(control.banned, false)
      assert.equal(control.muted, false)
      await userDrawer.getByRole('switch', { name: /的封禁$/ }).click()
      await page.getByRole('dialog', { name: '封禁', exact: true }).waitFor()
      await page.screenshot({
        path: path.join(output, 'direct-actions.png'),
        animations: 'disabled',
        fullPage: true,
      })
      await page.getByRole('button', { name: '取消操作', exact: true }).click()
      await page.getByRole('dialog', { name: '封禁', exact: true }).waitFor({ state: 'hidden' })
    } else {
      assert.equal(await userDrawer.getByRole('switch').count(), 0)
    }
    await historyList.getByRole('link', { name: '查看举报', exact: true }).click()
    await page.waitForURL(`${base}/safety/reports?report=${reportID}`)
    await page.getByText(report.body, { exact: true }).waitFor()
    await page.getByRole('button', { name: '给予账号处罚', exact: true }).waitFor()
    await page.goBack()
    await openUser()
    await historyList.getByRole('link', { name: '查看申诉', exact: true }).click()
    await page.waitForURL(`${base}/safety/appeals?appeal=${appealID}`)
    await page.getByText('合成关联申诉正文', { exact: true }).waitFor()
    await page.goBack()
    await openUser()
    await historyList.getByRole('button', { name: '下一页', exact: true }).click()
    await historyList.getByText(reviewPenalty.reason, { exact: true }).waitFor()
    assert.equal(historyQueries.at(-1), 'history-next')
    if (role === 'crisis_operator') {
      assert.equal(
        await historyList.getByRole('link', { name: '查看审核', exact: true }).count(),
        0,
      )
      await historyList.getByRole('button', { name: '上一页', exact: true }).click()
      await historyList.getByText(penalty.reason, { exact: true }).waitFor()
      assert.equal(historyQueries.at(-1), null)
      await userDrawer.getByRole('button', { name: '关闭', exact: true }).click()
    } else {
      await historyList.getByRole('link', { name: '查看审核', exact: true }).click()
      await page.waitForURL(`${base}/moderation?case=${reviewID}`)
      await page.getByText('合成关联内容审核正文', { exact: true }).waitFor()
      await page.goBack()
    }
    await userDrawer.waitFor({ state: 'hidden' })
    await Promise.all([
      page.waitForRequest((request) => new URL(request.url()).searchParams.has('nickname')),
      page.getByLabel('昵称关键词', { exact: true }).fill("小鲤%_'\\"),
    ])
    await target.waitFor()
    assert.equal(queries.at(-1).nickname, "小鲤%_'\\")
    assert.equal('user_id' in queries.at(-1), false)
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    await target.waitFor()
    assert.equal(queries.at(-1).cursor, 'synthetic-next')
    assert.equal(new URL(page.url()).search, '')
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify({ ...globalThis.localStorage, ...globalThis.sessionStorage }).includes(
          '小鲤',
        ),
      ),
      false,
    )
    fail = true
    await page.getByRole('button', { name: '刷新', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '服务暂不可用' }).waitFor()
    assert.equal(await page.locator('tbody').count(), 0)
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await page.waitForURL(`${base}/login`)
    assert.equal(await page.locator('tbody').count(), 0)
    assert.deepEqual(errors, [])
    results.push({
      role,
      themes: 2,
      widths: [1440, 390],
      screenshots: role === 'super_admin' ? 5 : 4,
      directActions: role === 'super_admin' ? ['ban', 'mute', 'unban', 'unmute'] : [],
      result: '通过',
    })
    await context.close()
  }
  assert.deepEqual(failures, [])
  await writeFile(
    path.join(output, 'result.json'),
    JSON.stringify({ boundary: '仅合成传输浏览器回归，不代表真实后端联调', results }, null, 2),
  )
  console.log('用户管理浏览器回归通过，证据目录：', output)
} finally {
  await browser.close()
}
