import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { URL } from 'node:url'
import { handleSessionAndDashboard } from './browser-session.js'
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const base = process.env.ADMIN_TEST_URL ?? 'http://127.0.0.1:5173'
assert.equal(new URL(base).hostname, '127.0.0.1', '只允许本机合成回归')
const output = await mkdtemp(path.join(tmpdir(), 'dictionary-browser-'))
const browser = await chromium.launch({
  channel: process.env.ADMIN_TEST_BROWSER_CHANNEL ?? 'chrome',
  headless: true,
})
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  const commands = []
  let version = 1
  let failOnce = true
  let dictionary = {
    type: 'resource_feedback',
    code: 'valid',
    label: '有用',
    sort_order: 0,
    enabled: true,
  }
  const reportTypes = [{ code: 'spam', label: '广告', published: true }]
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    let data
    if (pathname === '/api/v1/dictionaries') data = { version, items: [dictionary] }
    else if (await handleSessionAndDashboard(route)) return
    else if (pathname === '/api/v1/admin/sessions')
      data = {
        token: 'synthetic-browser-token',
        account: {
          id: 'synthetic',
          login_name: '合成回归账号',
          version: 1,
          active: true,
          roles: ['super_admin'],
        },
      }
    else if (pathname === '/api/v1/admin/dictionaries') data = { version, items: [dictionary] }
    else if (pathname === '/api/v1/admin/dictionaries/resource_feedback/valid') {
      const body = request.postDataJSON()
      commands.push({ key: request.headers()['idempotency-key'], body })
      if (failOnce) {
        failOnce = false
        await route.abort('failed')
        return
      }
      assert.equal(body.expected_version, version)
      dictionary = {
        ...dictionary,
        label: body.label,
        sort_order: body.sort_order,
        enabled: body.enabled,
      }
      data = { version: ++version, items: [dictionary] }
    } else if (pathname === '/api/v1/admin/report-types') data = { version, items: reportTypes }
    else if (pathname.startsWith('/api/v1/admin/report-types/')) {
      const code = pathname.split('/').at(-1)
      const body = request.postDataJSON()
      assert.equal(body.expected_version, version)
      const old = reportTypes.find((item) => item.code === code)
      if (old) Object.assign(old, { label: body.label, published: body.published })
      else reportTypes.push({ code, label: body.label, published: body.published })
      data = { version: ++version, items: reportTypes }
    } else {
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
  await page.getByRole('button', { name: '系统管理', exact: true }).click()
  await page.getByRole('link', { name: '展示字典', exact: true }).click()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByLabel('名称', { exact: true }).fill('确有帮助')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('button', { name: '原样重试', exact: true }).waitFor()
  assert.equal(await page.getByLabel('名称', { exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '原样重试', exact: true }).click()
  await page.getByRole('cell', { name: '确有帮助', exact: true }).waitFor()
  assert.equal(commands.length, 2)
  assert.deepEqual(commands[0], commands[1])
  await page.getByRole('button', { name: '刷新字典', exact: true }).click()
  const refreshed = page.locator('.floating-notice').filter({ hasText: '字典已刷新' })
  await refreshed.waitFor()
  await refreshed.getByRole('button', { name: '关闭提示' }).click()
  await page.getByRole('button', { name: '刷新字典', exact: true }).click()
  await refreshed.waitFor()
  await page.screenshot({ path: path.join(output, 'dictionaries-desktop.png'), fullPage: true })
  await page.getByRole('link', { name: '管理举报类型', exact: true }).click()
  await page.getByRole('button', { name: '新增类型', exact: true }).click()
  await page.getByLabel('代码', { exact: true }).fill('new_report')
  await page.getByLabel('名称', { exact: true }).fill('合成举报类型')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: 'new_report' })
  await row.waitFor()
  assert.match(await row.innerText(), /未发布/)
  await row.getByRole('button', { name: '编辑' }).click()
  assert.equal(await page.getByLabel('代码', { exact: true }).isDisabled(), true)
  await page.getByLabel('发布供用户选择').check()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.waitForFunction(() =>
    Array.from(globalThis.document.querySelectorAll('tbody tr')).some(
      (row) => row.textContent.includes('new_report') && row.textContent.includes('已发布'),
    ),
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(output, 'report-types-mobile.png'), fullPage: true })
  await row.getByRole('button', { name: '编辑', exact: true }).scrollIntoViewIfNeeded()
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  assert.equal(await page.getByLabel('代码', { exact: true }).isDisabled(), true)
  const scrollLeft = await page
    .locator('.dictionary-table')
    .evaluate((element) => element.scrollLeft)
  assert.ok(scrollLeft > 0, '窄屏横向滚动后可以触达编辑按钮')
  assert.deepEqual(errors, [])
  await writeFile(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        boundary: '全部业务接口为本地合成拦截，不连接真实后端',
        checks: [
          '未知结果原样重试',
          '刷新通知关闭后再次出现',
          '举报类型新增默认停用',
          '历史代码不可修改',
          '举报类型发布',
          '桌面与窄屏截图',
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  )
  process.stdout.write(`字典与通知浏览器合成回归通过：${output}\n`)
  await context.close()
} finally {
  await browser.close()
}
