import { onBeforeUnmount, watch } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { Role } from '@/types/admin'
import { ApiError } from '@/services/admin'

export function reviewErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return '资源不存在或已不可访问，请刷新后重试'
    if (error.status === 409) return '资源版本或状态已变化，请刷新并重新核对'
    if (error.status === 429) return '操作过于频繁，请稍后重试'
    if (error.status === 503) return '服务暂不可用，请稍后重试'
  }
  return '操作未完成，请重试；写入结果不明确时请先刷新核对'
}
/** 将工作区请求绑定到进入页面时的会话，退出、换页或取消后拒绝旧响应。 */
export function useAdminWorkspace(
  clear: () => void,
  role: Role | readonly Role[] = 'review_operator',
) {
  const admin = useAdminStore()
  const owner = admin.session
  const hasRole = () =>
    typeof role === 'string' ? admin.can(role) : role.some((value) => admin.can(value))
  const allowed = () => admin.session === owner && hasRole()
  let active = true
  let controller = new AbortController()
  function cancel() {
    controller.abort()
    controller = new AbortController()
  }
  function invalidate() {
    cancel()
    clear()
  }
  async function run<T>(
    task: (signal: AbortSignal) => Promise<T>,
    success: (value: T) => void | Promise<void>,
    failure: (error: unknown) => void | Promise<void>,
    settled: () => void,
  ) {
    if (!allowed()) {
      invalidate()
      return
    }
    const current = controller
    const valid = () => active && controller === current && !current.signal.aborted && allowed()
    try {
      const result = await task(current.signal)
      if (valid()) await success(result)
    } catch (error) {
      if (!valid()) return
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        invalidate()
        if (error.status === 401) admin.clear('会话已失效，请重新登录')
        else admin.forbidden++
      } else await failure(error)
    } finally {
      if (valid()) settled()
    }
  }
  watch(
    () => [admin.session, hasRole()],
    () => {
      if (!allowed()) invalidate()
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(() => {
    active = false
    invalidate()
  })
  return { allowed, cancel, run }
}
