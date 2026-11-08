import { adminRequest } from './admin'
export interface DictionaryItem {
  type: string
  code: string
  label: string
  sort_order: number
  enabled: boolean
}
export interface DictionarySnapshot {
  version: number
  items: DictionaryItem[]
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function parseDictionaries(value: unknown): DictionarySnapshot {
  if (!record(value) || value['code'] !== 0 || !record(value['data']))
    throw new Error('字典响应不符合约定')
  const data = value['data']
  if (
    !Number.isSafeInteger(data['version']) ||
    typeof data['version'] !== 'number' ||
    data['version'] < 1 ||
    !Array.isArray(data['items'])
  )
    throw new Error('字典版本不符合约定')
  const items: DictionaryItem[] = []
  const keys = new Set<string>()
  for (const item of data['items']) {
    if (
      !record(item) ||
      typeof item['type'] !== 'string' ||
      typeof item['code'] !== 'string' ||
      typeof item['label'] !== 'string' ||
      !item['label'].trim() ||
      typeof item['sort_order'] !== 'number' ||
      !Number.isSafeInteger(item['sort_order']) ||
      typeof item['enabled'] !== 'boolean'
    )
      throw new Error('字典项目不符合约定')
    const key = `${item['type']}/${item['code']}`
    if (keys.has(key)) throw new Error('字典项目重复')
    keys.add(key)
    items.push({
      type: item['type'],
      code: item['code'],
      label: item['label'],
      sort_order: item['sort_order'],
      enabled: item['enabled'],
    })
  }
  return { version: data['version'], items }
}
export async function readDictionaries(signal?: AbortSignal): Promise<DictionarySnapshot> {
  const response = await fetch('/api/v1/dictionaries', {
    cache: 'no-store',
    credentials: 'omit',
    ...(signal ? { signal } : {}),
  })
  if (!response.ok) throw new Error('展示字典暂不可用，请重试')
  return parseDictionaries(await response.json())
}
export async function saveDictionary(
  token: string,
  item: DictionaryItem,
  version: number,
  key: string,
  signal: AbortSignal,
) {
  return parseDictionaries(
    await adminRequest(
      `/admin/dictionaries/${encodeURIComponent(item.type)}/${encodeURIComponent(item.code)}`,
      token,
      {
        method: 'PUT',
        signal,
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          expected_version: version,
          label: item.label,
          sort_order: item.sort_order,
          enabled: item.enabled,
        }),
      },
    ),
  )
}

export async function readAdminDictionaries(token: string, signal: AbortSignal) {
  return parseDictionaries(await adminRequest('/admin/dictionaries', token, { signal }))
}
