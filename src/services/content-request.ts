import { createSessionTransport } from './session-transport'
import { ApiError } from './admin'
import { record } from '@/types/admin'

/** 内容管理和治理请求共用当前后台会话及标准封装，取消或撤权后丢弃响应。 */
export function createContentRequest(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch,
) {
  const { guard, request: send } = createSessionTransport(token, allowed, transport)
  return async (path: string, signal: AbortSignal, init: RequestInit = {}, status = 200) => {
    const response = await send(`/api/v1/admin/${path}`, signal, init)
    if (response.status !== status) throw new ApiError(response.status)
    const value: unknown = await response.json()
    guard(signal)
    if (
      !record(value) ||
      value['code'] !== 0 ||
      typeof value['message'] !== 'string' ||
      typeof value['request_id'] !== 'string' ||
      !('data' in value)
    )
      throw new Error('内容管理响应封装不符合契约')
    return value['data']
  }
}
