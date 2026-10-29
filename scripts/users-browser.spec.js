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
    await page.route('**/api/v1/**', async (route) => {
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
              { ...summary, id: detail.id, display_name: '<img src=x onerror=alert(1)>' },
              { ...summary, display_name: '同名小鲤' },
            ],
            next_cursor: url.searchParams.has('cursor') ? null : 'synthetic-next',
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
        } else if (url.pathname === `/api/v1/admin/users/${detail.id}`)
          data =
            role === 'super_admin'
              ? {
                  ...detail,
                  account_version: control.account_version,
                  restriction: control.banned ? 'banned' : control.muted ? 'muted' : 'normal',
                  muted_until: control.banned ? null : control.muted_until,
                  active_penalties: [],
                }
              : detail
        else if (url.pathname === `/api/v1/admin/users/${detail.id}/penalties`)
          data = {
            items: [
              role === 'super_admin'
                ? { ...penalty, status: 'revoked', revoked_at: control.as_of }
                : penalty,
            ],
            next_cursor: null,
          }
        else {
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
    await page.getByRole('link', { name: '平台用户', exact: true }).click()
    await page.locator('tbody tr').first().waitFor()
    assert.equal(await page.locator('tbody img').count(), 0)
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.locator(`input[value="${theme}"]`).check({ force: true })
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.screenshot({
          path: path.join(output, `${role}-${theme}-${width}-list.png`),
          fullPage: true,
          animations: 'disabled',
        })
        await page.getByRole('button', { name: `查看用户 ${detail.id}`, exact: true }).click()
        await page.getByRole('heading', { name: detail.display_name, exact: true }).waitFor()
        await page.getByRole('button', { name: '查看申诉', exact: true }).waitFor()
        await page.screenshot({
          path: path.join(output, `${role}-${theme}-${width}-detail.png`),
          fullPage: true,
          animations: 'disabled',
        })
        await page.getByRole('button', { name: '关闭详情', exact: true }).click()
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
        await page
          .getByRole('heading', { name: detail.display_name, exact: true })
          .waitFor({ state: 'hidden' })
      }
    }
    if (role === 'super_admin') {
      await page.getByRole('button', { name: `查看用户 ${detail.id}`, exact: true }).click()
      for (const label of ['封禁', '禁言', '解封', '取消禁言']) {
        await page.getByRole('button', { name: label, exact: true }).click()
        await page.getByLabel('操作理由（必填）', { exact: true }).fill('合成用户操作理由')
        await page.getByRole('button', { name: '核对用户操作', exact: true }).click()
        await Promise.all([
          page.waitForResponse(
            (response) =>
              response.url().endsWith(`/users/${detail.id}/restrictions`) &&
              response.request().method() === 'GET',
          ),
          page.getByRole('button', { name: `确认${label}`, exact: true }).click(),
        ])
        await page.getByRole('button', { name: '关闭详情', exact: true }).waitFor()
        await page.locator('[aria-label="用户操作"]').waitFor()
      }
      await page.getByRole('dialog').waitFor({ state: 'visible' })
      await page.getByRole('button', { name: '封禁', exact: true }).waitFor()
      assert.equal(control.account_version, 11)
      assert.equal(control.banned, false)
      assert.equal(control.muted, false)
      await page.getByRole('button', { name: '封禁', exact: true }).click()
      await page.getByLabel('操作理由（必填）', { exact: true }).fill('核对抽屉刷新后的操作能力')
      await page.getByRole('button', { name: '核对用户操作', exact: true }).click()
      await page.getByRole('button', { name: '确认封禁', exact: true }).waitFor()
      await page.screenshot({
        path: path.join(output, 'direct-actions.png'),
        animations: 'disabled',
        fullPage: true,
      })
      await page.getByRole('button', { name: '关闭详情', exact: true }).click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
    }
    await page.getByLabel('昵称关键词', { exact: true }).fill("小鲤%_'\\")
    assert.equal(await page.getByRole('button', { name: '下一页', exact: true }).isDisabled(), true)
    await page.getByRole('button', { name: '查询 / 从首页刷新', exact: true }).click()
    await page.locator('tbody tr').first().waitFor()
    assert.equal(queries.at(-1).nickname, "小鲤%_'\\")
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    await page.locator('tbody tr').first().waitFor()
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
    await page.getByRole('button', { name: '查询 / 从首页刷新', exact: true }).click()
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
      screenshots: role === 'super_admin' ? 9 : 8,
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
