import console from 'node:console'
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { URL } from 'node:url'

// 页面和传输解析执行真实代码，接口响应为正式契约的合成样本。
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const base = process.env.ADMIN_TEST_URL ?? 'http://127.0.0.1:5173'
assert.equal(new URL(base).hostname, '127.0.0.1', '仅访问隔离本机页面')
const output =
  process.env.ADMIN_TEST_OUTPUT ?? (await mkdtemp(path.join(tmpdir(), 'resources-browser-')))
await mkdir(output, { recursive: true })
const fixtures = JSON.parse(
  await readFile(new URL('../src/services/resources.contract.spec.json', import.meta.url), 'utf8'),
)
const sample = (name) =>
  globalThis.structuredClone(
    fixtures.exchanges.find((item) => item.operation_id === name).body.data,
  )
const browser = await chromium.launch({
  channel: process.env.ADMIN_TEST_BROWSER_CHANNEL ?? 'chrome',
  headless: true,
})
const results = [],
  screenshots = [],
  failures = []
try {
  for (const role of ['review_operator', 'super_admin', 'crisis_operator']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    page.on('dialog', (dialog) => dialog.accept())
    const errors = [],
      writes = [],
      reads = []
    page.on('pageerror', (error) => errors.push(error.message))
    let resource = sample('adminResourceDetail')
    resource.title = '<img src=x onerror=alert(1)>'
    const category = sample('adminResourceCategoryDetail')
    let failList = false
    await page.route('**/api/v1/**', async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        method = req.method()
      let data,
        status = 200,
        errorCode
      if (url.pathname === '/api/v1/admin/sessions')
        data = {
          token: 'synthetic',
          account: {
            id: 'synthetic',
            login_name: '合成运营',
            version: 1,
            active: true,
            roles: [role],
          },
        }
      else {
        assert.equal(req.headers()['authorization'], 'Bearer synthetic')
        assert.notEqual(role, 'crisis_operator', '危机角色不应读取资料')
        reads.push(`${method} ${url.pathname}`)
        if (method !== 'GET') {
          assert.ok(req.headers()['idempotency-key'])
          writes.push({ method, path: url.pathname, input: req.postDataJSON() })
        }
        if (url.pathname === '/api/v1/admin/resource-categories') {
          if (method === 'POST') {
            Object.assign(category, req.postDataJSON())
            status = 201
            data = category
          } else data = { items: [category], next_cursor: null }
        } else if (url.pathname === `/api/v1/admin/resource-categories/${category.id}`) {
          if (method === 'PUT' && req.postDataJSON().enabled === false) {
            status = 409
            errorCode = 'CATEGORY_IN_USE'
          } else data = category
        } else if (url.pathname === '/api/v1/admin/resources') {
          if (method === 'POST') {
            const body = req.postDataJSON()
            resource = {
              ...resource,
              ...body,
              category: resource.category,
              status: 'draft',
              version: 1,
              content_version: 1,
              published_at: null,
              allowed_actions: ['update', 'publish'],
              feedback_summary: {
                content_version: 1,
                valid: 0,
                link_invalid: 0,
                outdated: 0,
                incomplete: 0,
                total: 0,
              },
            }
            delete resource.category_id
            status = 201
            data = resource
          } else if (failList) {
            status = 503
            errorCode = 'DEPENDENCY_UNAVAILABLE'
          } else {
            const { description, download_url, extraction_code, ...summary } = resource
            assert.ok(download_url)
            assert.ok(extraction_code === null || typeof extraction_code === 'string')
            data = {
              items: [{ ...summary, description_excerpt: [...description].slice(0, 120).join('') }],
              next_cursor: null,
            }
          }
        } else if (url.pathname === `/api/v1/admin/resources/${resource.id}`) data = resource
        else if (url.pathname === `/api/v1/admin/resources/${resource.id}/offline`) {
          assert.equal(req.postDataJSON().expected_version, resource.version)
          assert.ok(req.postDataJSON().reason)
          resource = {
            ...resource,
            status: 'offline',
            version: resource.version + 1,
            allowed_actions: ['update', 'publish'],
          }
          data = resource
        } else if (url.pathname === `/api/v1/admin/resources/${resource.id}/content`) {
          const body = req.postDataJSON()
          assert.equal(body.expected_version, resource.version)
          assert.equal(resource.status, 'offline')
          resource = {
            ...resource,
            title: body.title,
            description: body.description,
            download_url: body.download_url,
            extraction_code: body.extraction_code,
            version: resource.version + 1,
            content_version: resource.content_version + 1,
            feedback_summary: {
              content_version: resource.content_version + 1,
              valid: 0,
              link_invalid: 0,
              outdated: 0,
              incomplete: 0,
              total: 0,
            },
          }
          data = resource
        } else if (url.pathname === `/api/v1/admin/resources/${resource.id}/publish`) {
          assert.equal(req.postDataJSON().expected_version, resource.version)
          resource = {
            ...resource,
            status: 'published',
            published_at: resource.updated_at,
            version: resource.version + 1,
            allowed_actions: ['offline'],
          }
          data = resource
        } else {
          failures.push(`${method} ${url.pathname}`)
          await route.abort()
          return
        }
      }
      await route.fulfill({
        status,
        headers: { 'Cache-Control': 'no-store', 'X-Request-ID': 'synthetic' },
        json: errorCode
          ? { code: status, message: '合成失败', error_code: errorCode, request_id: 'synthetic' }
          : { code: 0, message: '成功', data, request_id: 'synthetic' },
      })
    })
    await page.goto(`${base}/login`)
    await page.getByLabel('后台账号', { exact: true }).fill('synthetic')
    await page.getByLabel('口令', { exact: true }).fill('synthetic')
    await page.getByRole('button', { name: '登录后台', exact: true }).click()
    await page.waitForURL(`${base}/`)
    if (role === 'crisis_operator') {
      assert.equal(await page.getByRole('link', { name: '资料管理', exact: true }).count(), 0)
      await page.evaluate(() => {
        globalThis.history.pushState({}, '', '/resources')
        globalThis.dispatchEvent(new globalThis.PopStateEvent('popstate'))
      })
      await page.waitForURL(`${base}/403`)
      assert.equal(reads.length, 0)
      results.push({ role, guard: true, requests: 0 })
      await context.close()
      continue
    }
    await page.getByRole('link', { name: '资料管理', exact: true }).click()
    await page.locator('tbody tr').waitFor()
    assert.equal(await page.locator('tbody img').count(), 0)
    for (const theme of ['light', 'dark']) {
      await page.locator(`input[value="${theme}"]`).check({ force: true })
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        const name = `${role}-${theme}-${width}-list.png`
        await page.screenshot({
          path: path.join(output, name),
          fullPage: true,
          animations: 'disabled',
        })
        screenshots.push(name)
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole('button', { name: `查看资料 ${resource.id}`, exact: true }).click()
    await page.getByRole('button', { name: '下架后编辑', exact: true }).click()
    await page.getByLabel('下架理由（1–500字）').fill('更新合成资料')
    await page.getByRole('button', { name: '确认下架', exact: true }).click()
    await page.getByRole('button', { name: '确认保存', exact: true }).waitFor()
    await page.getByLabel('标题（1–100字）').fill('已更新的合成资料')
    await page.getByRole('button', { name: '确认保存', exact: true }).click()
    await page.getByRole('button', { name: '上架', exact: true }).waitFor()
    assert.equal(resource.status, 'offline')
    await page.getByRole('button', { name: '上架', exact: true }).click()
    await page.getByRole('button', { name: '下架后编辑', exact: true }).waitFor()
    assert.deepEqual(
      writes.slice(0, 3).map((item) => item.path.split('/').at(-1)),
      ['offline', 'content', 'publish'],
    )
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    failList = true
    await page.getByRole('button', { name: '查询 / 从首页刷新', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '服务暂不可用' }).waitFor()
    assert.equal(await page.getByText('暂无符合条件的资料', { exact: true }).count(), 0)
    await page.getByRole('link', { name: '资料分类', exact: true }).click()
    await page.getByRole('button', { name: `编辑分类 ${category.id}`, exact: true }).click()
    await page.getByLabel('启用此分类').uncheck()
    await page.getByRole('button', { name: '确认保存', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '分类仍被资料引用' }).waitFor()
    assert.equal(await page.getByLabel('启用此分类').isChecked(), false)
    const name = `${role}-category-conflict.png`
    await page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled' })
    screenshots.push(name)
    assert.deepEqual(errors, [])
    results.push({ role, operations: reads, writes: writes.length, pageErrors: errors })
    await context.close()
  }
  assert.deepEqual(failures, [])
} finally {
  await browser.close()
  await writeFile(
    path.join(output, 'result.json'),
    JSON.stringify(
      { synthetic: true, realBackend: false, results, screenshots, failures },
      null,
      2,
    ),
  )
}
console.log('资料广场浏览器合成回归通过', {
  output,
  cases: results.length,
  screenshots: screenshots.length,
})
