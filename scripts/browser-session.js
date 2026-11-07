import { URL } from 'node:url'
/** 为既有业务浏览器回归提供未登录恢复及首页聚合样本，不绕过业务接口断言。 */
export async function handleSessionAndDashboard(route) {
  const request = route.request()
  const url = new URL(request.url())
  if (request.method() === 'GET' && url.pathname === '/api/v1/admin/session') {
    await route.fulfill({ status: 401, json: { code: 401 } })
    return true
  }
  if (url.pathname === '/api/v1/admin/dashboard') {
    const summary = {
      registered_users: 0,
      verified_users: 0,
      new_users: 0,
      resources: 0,
      wishes: 0,
      fulfilled_wishes: 0,
    }
    await route.fulfill({
      json: {
        code: 0,
        data: {
          range: url.searchParams.get('range') ?? 'month',
          timezone: 'Asia/Shanghai',
          generated_at: '2026-11-07T00:00:00Z',
          summary,
          series: [],
          history_note: '合成浏览器统计',
        },
      },
    })
    return true
  }
  return false
}
