import { URL } from 'node:url'
/** 为既有业务浏览器回归提供未登录恢复及首页聚合样本，不绕过业务接口断言。 */
export async function handleSessionAndDashboard(route) {
  const request = route.request()
  const url = new URL(request.url())
  if (url.pathname === '/api/v1/dictionaries') {
    const dictionaries = {
      verification_status: {
        unverified: '未认证',
        pending: '待审核',
        verified: '已认证',
        rejected: '已驳回',
      },
      restriction_status: { normal: '正常', muted: '禁言', banned: '封禁' },
      resource_status: { draft: '草稿', published: '已上架', offline: '已下架' },
      resource_feedback: {
        valid: '有用',
        link_invalid: '链接失效',
        outdated: '年代久远',
        incomplete: '不全',
      },
      whisper_review_status: {
        pending: '待审核',
        approved: '内容已通过',
        rejected: '内容已驳回',
        cancelled: '案件已取消',
      },
      whisper_report_status: {
        pending: '待处理',
        confirmed: '举报已确认',
        dismissed: '举报已驳回',
      },
      whisper_crisis_status: {
        open: '待接手',
        in_progress: '跟进中',
        resolved: '已结案',
        false_positive: '已标记误报',
      },
      whisper_delivery_status: { pending: '待投递', delivered: '已投递', cancelled: '已取消' },
    }
    await route.fulfill({
      json: {
        code: 0,
        data: {
          version: 1,
          items: Object.entries(dictionaries).flatMap(([type, labels]) =>
            Object.entries(labels).map(([code, label], sort_order) => ({
              type,
              code,
              label,
              sort_order,
              enabled: true,
            })),
          ),
        },
      },
    })
    return true
  }
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
