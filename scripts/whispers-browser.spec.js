import { handleSessionAndDashboard } from './browser-session.js'
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { URL } from 'node:url'

// 只在浏览器测试中拦截传输，产品页面、路由和解析器均使用实际实现。
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const base = process.env.ADMIN_TEST_URL ?? 'http://127.0.0.1:5173'
assert.equal(new URL(base).hostname, '127.0.0.1', '仅允许测试本机页面')
const output =
  process.env.ADMIN_TEST_OUTPUT ?? (await mkdtemp(path.join(tmpdir(), 'whispers-browser-')))
await mkdir(output, { recursive: true })
const fixtures = JSON.parse(
  await readFile(new URL('../src/services/whispers/contract.spec.json', import.meta.url), 'utf8'),
)
function example(name) {
  const entry = fixtures.exchanges.find(
    (item) => item.operation_id === name && item.direction === 'response',
  )
  assert.ok(entry, `缺少样例：${name}`)
  return globalThis.structuredClone(entry.body.data)
}
const id = '6c500000-0000-4000-8000-000000000001'
const source = { kind: 'whisper_capsule', id, content_version: 7 }
const review = {
  ...example('whisperAdminReviewGet'),
  version: 4,
  source,
  body: '合成私密胶囊正文，仅用于本地浏览器回归。'.repeat(12),
  allowed_actions: ['whisperAdminReviewDecide', 'whisperAdminReviewEscalate'],
}
const report = {
  ...example('whisperAdminReportGet'),
  version: 6,
  source: { ...source, kind: 'whisper_post' },
  body: '合成举报正文，仅用于本地浏览器回归。',
  allowed_actions: ['whisperAdminReportDecide', 'whisperAdminReportEscalate'],
}
const crisis = {
  ...example('whisperAdminCrisisGet'),
  version: 8,
  source,
  evidence_scope_id: id,
  body: '合成限定证据正文，仅用于本地浏览器回归。',
  student_number: null,
  identity_status: 'not_verified',
  timeline: [
    {
      at: '2026-10-28T04:00:00Z',
      action: 'follow_up',
      operator_label: '合成危机岗位',
      reason: '合成跟进记录',
    },
  ],
  allowed_actions: ['whisperAdminCrisisAct', 'whisperAdminCrisisFalsePositive'],
}
const control = {
  ...example('whisperAdminContentGet'),
  version: 31,
  source: report.source,
  allowed_actions: ['whisperAdminRestrictionSet', 'whisperAdminPenaltyCreate'],
}
const evidence = {
  ...example('whisperAdminEvidenceGet'),
  version: 51,
  allowed_actions: ['whisperAdminEvidenceDelete'],
}
const metadata = (data) => {
  const {
    body,
    student_number,
    identity_status,
    evidence_scope_id,
    timeline,
    care_delivery,
    staff_delivery,
    school_related,
    privacy_recheck,
    type_code,
    description,
    ...rest
  } = data
  void body
  void student_number
  void identity_status
  void evidence_scope_id
  void timeline
  void care_delivery
  void staff_delivery
  void school_related
  void privacy_recheck
  void type_code
  void description
  return { ...rest, allowed_actions: [] }
}
const routes = [
  { path: '/whispers/reviews', group: '内容治理', title: '树洞审核', button: '处理树洞审核' },
  { path: '/whispers/reports', group: '安全治理', title: '树洞举报', button: '判定举报' },
  { path: '/whispers/crises', group: '安全治理', title: '树洞危机', button: '接手危机' },
  { path: '/whispers/evidence', group: '隐私管理', title: '树洞证据', button: '处理证据删除' },
]
const results = []
const failures = []
const browser = await chromium.launch({
  headless: true,
  channel: process.env.ADMIN_TEST_BROWSER_CHANNEL ?? 'chrome',
})
try {
  for (const role of ['super_admin', 'review_operator', 'crisis_operator']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
    const page = await context.newPage()
    const requests = []
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    let completed = false
    await page.route('**/api/v1/**', async (route) => {
      if (await handleSessionAndDashboard(route)) return
      const request = route.request()
      const url = new URL(request.url())
      const api = url.pathname.replace('/api/v1/admin', '')
      const method = request.method()
      let data
      let status = 200
      if (api === '/sessions' && method === 'POST') {
        data = {
          token: 'synthetic-browser-token',
          account: {
            id: 'synthetic',
            login_name: '合成回归账号',
            version: 1,
            active: true,
            roles: [role],
          },
        }
      } else if (api === '/session' && method === 'DELETE') {
        await route.fulfill({ status: 204 })
        return
      } else {
        assert.equal(request.headers()['authorization'], 'Bearer synthetic-browser-token')
        if (api === '/whispers/reviews') data = { items: [metadata(review)], next_cursor: null }
        else if (api === `/whispers/reviews/${id}`) data = review
        else if (api === `/whispers/reviews/${id}/decision`) {
          assert.equal(request.postDataJSON().expected_version, 4)
          assert.equal(request.postDataJSON().expected_content_version, 7)
          data = { ...example('whisperAdminReviewDecide'), business_outcome: 'capsule_locked' }
        } else if (api === '/whispers/reports')
          data = { items: [metadata(report)], next_cursor: null }
        else if (api === `/whispers/reports/${id}`) data = report
        else if (api === `/whispers/contents/whisper_post/${id}`) data = control
        else if (api === `/whispers/reports/${id}/decision`) {
          assert.equal(request.postDataJSON().expected_version, 6)
          data = { ...metadata(report), status: 'confirmed' }
        } else if (api === '/whispers/crises')
          data = { items: [metadata(crisis)], next_cursor: null }
        else if (api === `/whispers/crises/${id}`) data = crisis
        else if (api === `/whispers/crises/${id}/actions`) {
          assert.equal(request.postDataJSON().expected_version, 8)
          data = { ...crisis, status: 'in_progress', version: 9 }
        } else if (api === `/whispers/evidence/${id}`) data = evidence
        else if (api === `/whispers/evidence/${id}/deletion-requests`) {
          assert.deepEqual(request.postDataJSON(), {
            expected_version: 51,
            confirmation: 'DELETE_EVIDENCE_SCOPE',
            reason: '合成证据删除理由',
          })
          data = example('whisperAdminEvidenceDelete')
          status = 202
        } else if (api === `/whispers/deletions/${id}`) {
          data = {
            ...example('whisperAdminDeletionGet'),
            status: completed ? 'completed' : 'processing',
          }
        } else {
          failures.push(`未定义测试请求：${method} ${api}`)
          await route.abort()
          return
        }
      }
      requests.push({ method, path: api, status })
      await route.fulfill({
        status,
        json: { code: 0, message: '合成响应', request_id: 'synthetic-browser', data },
      })
    })
    await page.goto(`${base}/login`)
    await page.getByLabel('后台账号', { exact: true }).fill('synthetic-browser')
    await page.getByLabel('口令', { exact: true }).fill('synthetic-test-only')
    await page.getByRole('button', { name: '登录后台', exact: true }).click()
    await page.waitForURL(`${base}/`)
    const nav = page.getByRole('navigation', { name: '管理菜单' })
    const openMenuPage = async (item) => {
      const group = nav.getByRole('button', { name: item.group, exact: true })
      if ((await group.getAttribute('aria-expanded')) === 'false') await group.click()
      await nav.getByRole('link', { name: item.title, exact: true }).click()
      await page.getByRole('main', { name: item.title, exact: true }).waitFor()
    }
    for (const item of routes) {
      const allowed =
        item.path === '/whispers/reports' ||
        role === 'super_admin' ||
        (item.path === '/whispers/reviews' && role === 'review_operator') ||
        (item.path === '/whispers/crises' && role === 'crisis_operator')
      assert.equal(await nav.locator(`a[href='${item.path}']`).count(), allowed ? 1 : 0)
    }
    if (role !== 'super_admin') {
      // 通过应用导航访问已授权页面，不刷新内存会话。
      const item = routes.find(
        ({ title }) => title === (role === 'review_operator' ? '树洞审核' : '树洞危机'),
      )
      assert.ok(item)
      await openMenuPage(item)
      await page.locator('.business-table tbody button').first().click()
      await page.locator('blockquote').waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'detached' })
      await page.getByRole('button', { name: '退出登录', exact: true }).click()
      await page.waitForURL(`${base}/login`)
      assert.equal(await page.locator('blockquote').count(), 0)
      results.push({ role, menu: '通过', logout_cleanup: '通过' })
      assert.deepEqual(errors, [])
      await context.close()
      continue
    }
    for (const theme of ['light', 'dark']) {
      await page.locator(`input[value="${theme}"]`).check({ force: true })
      for (const item of routes) {
        const name = item.path.split('/').at(-1)
        await page.setViewportSize({ width: 1440, height: 1100 })
        await openMenuPage(item)
        if (name === 'evidence') {
          await page.getByLabel('证据范围标识', { exact: true }).fill(id)
          await page.getByRole('button', { name: '读取证据范围', exact: true }).click()
          await page.getByRole('button', { name: item.button, exact: true }).waitFor()
        } else {
          await page.locator('.business-table tbody button').first().click()
          await page.locator('blockquote').waitFor()
        }
        assert.equal(
          await page.locator('html').evaluate((element) => element.classList.contains('dark')),
          theme === 'dark',
        )
        assert.equal(await page.title(), `${item.title} · 鲤源池`)
        await page.screenshot({
          path: path.join(output, `${name}-${theme}-desktop.png`),
          fullPage: true,
        })
        await page.getByRole('button', { name: item.button, exact: true }).click()
        const dialog = page.locator('.el-dialog').filter({ has: page.locator('form') })
        await dialog.waitFor()
        if (name === 'reviews') await dialog.locator('input[value="rejected"]').check()
        if (name === 'evidence') {
          await dialog.locator('textarea').fill('合成证据删除理由')
          await dialog
            .getByLabel('请输入 DELETE_EVIDENCE_SCOPE 确认删除整个范围')
            .fill('DELETE_EVIDENCE_SCOPE')
        } else await dialog.locator('textarea').first().fill('合成处理理由')
        if (name === 'reviews') await dialog.locator('textarea').nth(1).fill('合成修改建议')
        await dialog
          .getByRole('button', {
            name: name === 'evidence' ? '核对删除范围' : '核对操作',
            exact: true,
          })
          .click()
        await page.screenshot({
          path: path.join(output, `${name}-${theme}-dialog.png`),
          fullPage: true,
        })
        if (theme === 'light') {
          const count = requests.length
          await dialog
            .getByRole('button', {
              name: name === 'evidence' ? '确认删除证据范围' : '确认提交',
              exact: true,
            })
            .click()
          await dialog.waitFor({ state: 'detached' })
          assert.ok(requests.length > count)
          assert.equal(await page.locator('blockquote').count(), 0)
          if (name === 'evidence') {
            await page.getByRole('button', { name: '查询刚受理的任务', exact: true }).click()
            await page
              .getByText('证据范围正在清理，尚未全部完成；请稍后手动查询。', { exact: true })
              .waitFor()
            completed = true
            await page.getByRole('button', { name: '查询刚受理的任务', exact: true }).click()
            await page.getByText('证据范围清理已完成（后端确认）。', { exact: true }).waitFor()
          }
        } else {
          await dialog.getByRole('button', { name: '取消处理', exact: true }).click()
          await dialog.waitFor({ state: 'detached' })
        }
        await page.setViewportSize({ width: 390, height: 844 })
        assert.equal(
          await page.evaluate(
            () => globalThis.document.documentElement.scrollWidth <= globalThis.window.innerWidth,
          ),
          true,
          `${name}/${theme} 窄屏不应横向溢出`,
        )
        await page.screenshot({
          path: path.join(output, `${name}-${theme}-mobile.png`),
          fullPage: true,
        })
        results.push({
          page: name,
          theme,
          desktop: '1440×1100',
          mobile: '390×844',
          actual_transport_adapter: true,
        })
        // 窄屏菜单折叠，恢复桌面再切换下一页。
        await page.setViewportSize({ width: 1440, height: 1100 })
        if (await page.getByRole('dialog').count()) {
          await page.getByRole('dialog').getByRole('button', { name: '关闭此对话框' }).click()
          await page.getByRole('dialog').waitFor({ state: 'detached' })
        }
      }
    }
    const crisisRoute = routes.find(({ title }) => title === '树洞危机')
    assert.ok(crisisRoute)
    await openMenuPage(crisisRoute)
    await page.getByRole('button', { name: '查看第 1 条危机', exact: true }).click()
    const evidenceLink = page.getByRole('button', {
      name: '前往树洞证据删除与进度查询',
      exact: true,
    })
    await evidenceLink.waitFor()
    assert.ok(!(await page.getByRole('dialog').innerText()).includes(id))
    await evidenceLink.click()
    await page.waitForURL(`${base}/whispers/evidence`)
    await page.getByRole('button', { name: '处理证据删除', exact: true }).waitFor()
    assert.ok(!(await page.locator('main').innerText()).includes(id))
    const stored = await page.evaluate(() => ({
      local: { ...globalThis.localStorage },
      session: { ...globalThis.sessionStorage },
    }))
    assert.deepEqual(stored.session, {})
    assert.deepEqual(Object.keys(stored.local), ['liyuanci-theme'])
    assert.deepEqual(errors, [])
    await page.reload()
    await page.waitForURL(`${base}/login`)
    assert.equal(await page.locator('blockquote').count(), 0)
    results.push({
      reload_session_cleanup: '通过',
      storage_theme_only: '通过',
      page_errors: errors.length,
      requests,
    })
    await context.close()
  }
  assert.deepEqual(failures, [])
  await writeFile(
    path.join(output, 'browser-results.json'),
    JSON.stringify(
      {
        boundary: '本地页面与真实服务适配器，全部业务响应仅由浏览器测试拦截合成；不连接真实后端',
        browser_version: browser.version(),
        results,
        failures,
      },
      null,
      2,
    ) + '\n',
  )
  process.stdout.write(
    `浏览器回归通过：4页面×2主题，桌面/窄屏与弹窗，三角色菜单、实际适配器提交、退出/刷新清理及仅主题持久化。证据目录：${output}\n`,
  )
} finally {
  await browser.close()
}
