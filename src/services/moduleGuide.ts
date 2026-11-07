import { adminRequest } from './admin'
import { record } from '@/types/admin'
import type { GuideModule, ModuleGuide, ModuleGuideInput } from '@/types/moduleGuide'

function modules(value: unknown): GuideModule[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error('模块说明列表格式异常')
  const parsed = value.map((item: unknown) => {
    if (
      !record(item) ||
      typeof item['module'] !== 'string' ||
      !/^[a-z_]{1,40}$/u.test(item['module']) ||
      typeof item['title'] !== 'string' ||
      !item['title'].trim() ||
      [...item['title']].length > 40 ||
      typeof item['body'] !== 'string' ||
      !item['body'].trim() ||
      [...item['body']].length > 2000
    )
      throw new Error('模块说明内容格式异常')
    return { module: item['module'], title: item['title'], body: item['body'] }
  })
  if (new Set(parsed.map((item) => item.module)).size !== parsed.length)
    throw new Error('模块标识不能重复')
  return parsed
}

export function parseModuleGuide(value: unknown): ModuleGuide {
  if (
    !record(value) ||
    value['code'] !== 0 ||
    typeof value['request_id'] !== 'string' ||
    typeof value['message'] !== 'string' ||
    !record(value['data'])
  )
    throw new Error('模块说明响应格式异常')
  const data = value['data']
  const version = data['version']
  const published = data['published_version']
  if (
    typeof version !== 'number' ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    typeof published !== 'number' ||
    !Number.isSafeInteger(published) ||
    published < 0 ||
    published >= version
  )
    throw new Error('模块说明版本格式异常')
  return {
    version,
    published_version: published,
    modules: modules(data['modules']),
    published_modules: modules(data['published_modules']),
  }
}

/** 只向同源后台发送当前会话，响应在页面授权作用域中再次校验。 */
export async function readModuleGuide(token: string, signal: AbortSignal): Promise<ModuleGuide> {
  return parseModuleGuide(await adminRequest('/admin/module-guide', token, { signal }))
}
export async function saveModuleGuide(
  token: string,
  input: ModuleGuideInput,
  key: string,
  signal: AbortSignal,
): Promise<ModuleGuide> {
  if (!input.modules.length) throw new Error('请至少填写一项模块说明')
  modules(input.modules)
  return parseModuleGuide(
    await adminRequest('/admin/module-guide', token, {
      method: 'PUT',
      signal,
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(input),
    }),
  )
}
export async function publishModuleGuide(
  token: string,
  expectedVersion: number,
  key: string,
  signal: AbortSignal,
): Promise<ModuleGuide> {
  return parseModuleGuide(
    await adminRequest('/admin/module-guide/publish', token, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ expected_version: expectedVersion }),
    }),
  )
}
