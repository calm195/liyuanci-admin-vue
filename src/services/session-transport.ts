import { ApiError } from './admin'

/** 统一后台 Bearer 的传输边界；具体状态码、响应头和正文仍由所属协议校验。 */
export function createSessionTransport(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch,
) {
  function guard(signal: AbortSignal) {
    signal.throwIfAborted()
    if (!token.trim()) throw new ApiError(401)
    if (!allowed()) throw new ApiError(403)
  }
  async function request(url: string, signal: AbortSignal, init: RequestInit = {}) {
    guard(signal)
    // 拒绝浏览器会裁剪的原始空白和控制符；游标等查询参数须编码，且不参与路径检查。
    const path = url.split('?')[0] ?? ''
    if (
      !path.startsWith('/api/v1/admin/') ||
      /[\\#\s\p{Cc}]/u.test(url) ||
      path.split('/').some((part) => {
        const decoded = decodeURIComponent(part)
        return decoded === '.' || decoded === '..'
      })
    )
      throw new Error('非法后台路径')
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const response = await transport(url, {
      ...init,
      headers,
      signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    })
    guard(signal)
    return response
  }
  // 调用方读取 json、text 或 blob 后仍须 guard，覆盖读取正文期间的撤权和取消。
  return { guard, request }
}
