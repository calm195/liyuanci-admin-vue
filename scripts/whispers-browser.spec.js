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
const whisperJob = example('whisperAdminEvidenceDelete')
const ordinaryCase = '6c500000-0000-4000-8000-000000000061'
const ordinaryEvidence = '6c500000-0000-4000-8000-000000000062'
const ordinaryJob = '6c500000-0000-4000-8000-000000000063'
const anonymousReceipt = `6c500000-0000-4000-8000-000000000064.${'a'.repeat(43)}`
const taskMenu = { group: '隐私管理', title: '删除任务与回执' }
const ordinaryCrisis = { group: '安全治理', title: '危机工作台' }
const ordinary = {
  id: ordinaryCase,
  version: 2,
  status: 'handling',
  student_number: '',
  body: '合成普通危机正文。',
  timeline: [{ id: ordinaryEvidence, version: 3, status: 'handling', kind: 'evidence' }],
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
    let ordinarySubmitted = false
    let whisperSubmitted = false
    let anonymousRead = false
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
      } else if (url.pathname === `/api/v1/deletion-receipts/${anonymousReceipt}`) {
        assert.equal(request.headers()['authorization'], undefined)
        anonymousRead = true
        data = { status: 'completed' }
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
        } else if (api === '/crisis-cases') {
          data = { items: [ordinary], next_cursor: null }
        } else if (api === `/crisis-cases/${ordinaryCase}`) data = ordinary
        else if (api === `/crisis-cases/${ordinaryCase}/timeline`) data = []
        else if (api === `/crisis-cases/${ordinaryCase}/work`)
          data = { handoff_at: null, items: [] }
        else if (api === `/evidence/${ordinaryEvidence}` && method === 'GET') {
          data = {
            id: ordinaryEvidence,
            case_id: ordinaryCase,
            version: 3,
            status: 'handling',
            body: '合成普通证据正文。',
            student_number: '',
          }
        } else if (api === `/evidence/${ordinaryEvidence}` && method === 'DELETE') {
          assert.deepEqual(request.postDataJSON(), {
            expected_version: 3,
            reason: '合成普通证据删除理由',
          })
          assert.ok(request.headers()['idempotency-key'])
          ordinarySubmitted = true
          data = { id: ordinaryJob, version: 1, status: 'pending' }
          status = 202
        } else if (api === `/whispers/evidence/${id}`) data = evidence
        else if (api === `/whispers/evidence/${id}/deletion-requests`) {
          assert.deepEqual(request.postDataJSON(), {
            expected_version: 51,
            confirmation: 'DELETE_EVIDENCE_SCOPE',
            reason: '合成证据删除理由',
          })
          assert.ok(request.headers()['idempotency-key'])
          whisperSubmitted = true
          data = whisperJob
          status = 202
        } else if (api === `/whispers/deletions/${whisperJob.id}`) {
          data = {
            ...example('whisperAdminDeletionGet'),
            status: completed ? 'completed' : 'processing',
          }
        } else if (api === `/evidence-deletion-jobs/${ordinaryJob}`) {
          data = { status: completed ? 'completed' : 'processing' }
        } else if (api === '/evidence-deletion-jobs') {
          assert.equal(role, 'super_admin')
          const pageNo = Number(url.searchParams.get('page'))
          const pageSize = Number(url.searchParams.get('limit'))
          const visible = [
            ...(whisperSubmitted ? [{ id: whisperJob.id, source_module: 'whispers' }] : []),
            ...(ordinarySubmitted ? [{ id: ordinaryJob, source_module: 'legacy' }] : []),
            ...Array.from({ length: 10 }, (_, i) => ({
              id: `4c500000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
              source_module: 'legacy',
            })),
          ].map((row, i) => ({
            ...row,
            status: completed ? 'completed' : 'processing',
            created_at: `2026-11-${String(27 - i).padStart(2, '0')}T08:00:00Z`,
          }))
          data = {
            items: visible.slice((pageNo - 1) * pageSize, pageNo * pageSize),
            total: visible.length,
            page: pageNo,
            page_size: pageSize,
            next_cursor: null,
          }
        } else {
          failures.push(`未定义测试请求：${method} ${api}`)
          await route.abort()
          return
        }
      }
      requests.push({
        method,
        path: api.startsWith('/api/v1/deletion-receipts/') ? '匿名回执' : api,
        status,
      })
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
    for (const path of ['/whispers/evidence', '/evidence-deletion'])
      assert.equal(await nav.locator(`a[href='${path}']`).count(), 0)
    assert.equal(
      await nav.locator("a[href='/deletion-receipts']").count(),
      role === 'super_admin' ? 1 : 0,
    )
    if (role !== 'super_admin') {
      // 通过应用导航访问已授权页面，不刷新内存会话。
      const item = routes.find(
        ({ title }) => title === (role === 'review_operator' ? '树洞审核' : '树洞危机'),
      )
      assert.ok(item)
      await openMenuPage(item)
      await page.locator('.business-table tbody button').first().click()
      await page.locator('blockquote').waitFor()
      if (role === 'crisis_operator') {
        assert.equal(await page.getByRole('button', { name: /前往树洞证据删除/ }).count(), 0)
        assert.equal(
          requests.some(({ path }) => path.startsWith('/whispers/evidence')),
          false,
        )
      }
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'detached' })
      if (role === 'crisis_operator') {
        await openMenuPage(ordinaryCrisis)
        await page.getByRole('button', { name: '查看第 1 条案件', exact: true }).click()
        await page.getByRole('button', { name: '查看证据 1', exact: true }).click()
        await page.getByText('合成普通证据正文。', { exact: true }).waitFor()
        assert.equal(
          await page.getByRole('button', { name: '管理当前证据范围', exact: true }).count(),
          0,
        )
      }
      await page.getByRole('button', { name: '退出登录', exact: true }).click()
      await page.waitForURL(`${base}/login`)
      assert.equal(await page.locator('blockquote').count(), 0)
      results.push({ role, menu: '通过', logout_cleanup: '通过' })
      assert.deepEqual(errors, [])
      await context.close()
      continue
    }
    for (const [theme, themeLabel] of [
      ['light', '浅色'],
      ['dark', '深色'],
    ]) {
      await page.getByText(themeLabel, { exact: true }).click()
      for (const item of routes) {
        const name = item.path.split('/').at(-1)
        await page.setViewportSize({ width: 1440, height: 1100 })
        await openMenuPage(item)
        await page.locator('.business-table tbody button').first().click()
        await page.locator('blockquote').waitFor()
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
        await dialog.locator('textarea').first().fill('合成处理理由')
        if (name === 'reviews') await dialog.locator('textarea').nth(1).fill('合成修改建议')
        await dialog.getByRole('button', { name: '核对操作', exact: true }).click()
        await page.screenshot({
          path: path.join(output, `${name}-${theme}-dialog.png`),
          fullPage: true,
        })
        if (theme === 'light') {
          const count = requests.length
          await dialog.getByRole('button', { name: '确认提交', exact: true }).click()
          await dialog.waitFor({ state: 'detached' })
          assert.ok(requests.length > count)
          assert.equal(await page.locator('blockquote').count(), 0)
        } else {
          await dialog.getByRole('button', { name: '取消处理', exact: true }).click()
          const discard = page.getByRole('dialog', { name: '未保存的修改', exact: true })
          await discard.getByRole('button', { name: '放弃修改', exact: true }).click()
          await dialog.waitFor({ state: 'detached' })
          await discard.waitFor({ state: 'hidden' })
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
        const details = page.locator('.el-drawer')
        if (await details.count()) {
          await details.getByRole('button', { name: '关闭此对话框' }).click()
          await details.waitFor({ state: 'detached' })
        }
      }
    }
    const crisisRoute = routes.find(({ title }) => title === '树洞危机')
    assert.ok(crisisRoute)
    await nav.getByRole('link', { name: '首页', exact: true }).click()
    await openMenuPage(crisisRoute)
    await page.locator('.business-table tbody button').first().click()
    const evidenceLink = page.getByRole('button', {
      name: '前往树洞证据删除与进度查询',
      exact: true,
    })
    await evidenceLink.waitFor()
    const crisisDetail = page.getByRole('region', { name: '树洞危机详情' })
    assert.ok(!(await crisisDetail.innerText()).includes(id))
    await evidenceLink.click()
    await page.waitForURL(`${base}/whispers/evidence`)
    await page.getByRole('button', { name: '处理证据删除', exact: true }).waitFor()
    assert.ok(!(await page.locator('main').innerText()).includes(id))
    assert.equal(await page.locator('main input').count(), 0)
    const submitDeletion = async (reason, confirmation) => {
      await page.getByRole('button', { name: '处理证据删除', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await dialog.locator('textarea').fill(reason)
      if (confirmation) await dialog.locator('input').fill(confirmation)
      await dialog.getByRole('button', { name: '核对删除范围', exact: true }).click()
      await dialog.getByRole('button', { name: '确认删除证据范围', exact: true }).click()
      await dialog.waitFor({ state: 'detached' })
      await page.getByRole('button', { name: '查看删除任务', exact: true }).click()
      await page.waitForURL(`${base}/deletion-receipts`)
      await page
        .getByText('正在清理，尚未全部完成；请稍后手动刷新查询。', { exact: true })
        .waitFor()
    }
    await submitDeletion('合成证据删除理由', 'DELETE_EVIDENCE_SCOPE')
    assert.ok(requests.some(({ path }) => path === `/whispers/deletions/${whisperJob.id}`))

    await openMenuPage(ordinaryCrisis)
    await page.getByRole('button', { name: '查看第 1 条案件', exact: true }).click()
    await page.getByRole('button', { name: '查看证据 1', exact: true }).click()
    await page.getByText('合成普通证据正文。', { exact: true }).waitFor()
    await page.getByRole('button', { name: '管理当前证据范围', exact: true }).click()
    await page.waitForURL(`${base}/evidence-deletion`)
    await page.getByRole('button', { name: '处理证据删除', exact: true }).waitFor()
    assert.equal(await page.locator('main input').count(), 0)
    assert.ok(!(await page.locator('main').innerText()).includes(ordinaryEvidence))
    assert.equal(await page.getByText('合成普通证据正文。', { exact: true }).count(), 0)
    await submitDeletion('合成普通证据删除理由')
    const tasks = page.getByRole('region', { name: '证据删除任务列表' })
    await tasks.getByText('共 12 条', { exact: false }).waitFor()
    assert.ok(requests.some(({ path }) => path === `/evidence-deletion-jobs/${ordinaryJob}`))
    await nav.getByRole('link', { name: '首页', exact: true }).click()
    await openMenuPage(taskMenu)

    await tasks.getByRole('button', { name: '下一页', exact: true }).click()
    await tasks.getByText('第 2 / 2 页', { exact: false }).waitFor()
    assert.equal(await tasks.locator('tbody tr').count(), 2)
    await tasks.getByRole('button', { name: '上一页', exact: true }).click()
    await tasks.getByText('第 1 / 2 页', { exact: false }).waitFor()
    const whisperRow = tasks.getByRole('row').filter({ hasText: '树洞证据' })
    await whisperRow.getByRole('button', { name: '查看进度', exact: true }).click()
    await page.getByText('正在清理，尚未全部完成；请稍后手动刷新查询。', { exact: true }).waitFor()
    completed = true
    await page.getByRole('button', { name: '刷新任务进度', exact: true }).click()
    await page.getByText('清理已完成（后端确认）。', { exact: true }).waitFor()
    const receipt = page.getByLabel('本人主动提供的完整删除回执', { exact: true })
    await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname.startsWith('/api/v1/deletion-receipts/'),
      ),
      receipt.fill(anonymousReceipt),
    ])
    await page.getByText('清理已完成（后端确认）。', { exact: true }).waitFor()
    await page.getByRole('button', { name: '清空查询', exact: true }).click()
    assert.equal(await receipt.inputValue(), '')
    assert.equal(anonymousRead, true)
    assert.equal(new URL(page.url()).search, '')
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.window.innerWidth,
      ),
      true,
    )

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
    `浏览器回归通过：树洞治理、普通和树洞证据点选、分页任务及匿名回执，三类岗位和窄屏。证据目录：${output}\n`,
  )
} finally {
  await browser.close()
}
