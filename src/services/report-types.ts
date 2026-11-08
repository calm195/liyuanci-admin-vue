import { adminRequest } from './admin'
export interface ReportTypeItem {
  code: string
  label: string
  published: boolean
}
export interface ReportTypesSnapshot {
  version: number
  items: ReportTypeItem[]
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function parseReportTypes(value: unknown): ReportTypesSnapshot {
  if (!record(value) || value['code'] !== 0 || !record(value['data']))
    throw new Error('举报类型响应不符合约定')
  const data = value['data']
  if (
    typeof data['version'] !== 'number' ||
    !Number.isSafeInteger(data['version']) ||
    data['version'] < 1 ||
    !Array.isArray(data['items'])
  )
    throw new Error('举报类型版本不符合约定')
  const items: ReportTypeItem[] = []
  const codes = new Set<string>()
  for (const item of data['items']) {
    if (
      !record(item) ||
      typeof item['code'] !== 'string' ||
      !item['code'] ||
      typeof item['label'] !== 'string' ||
      !item['label'].trim() ||
      typeof item['published'] !== 'boolean' ||
      codes.has(item['code'])
    )
      throw new Error('举报类型项目不符合约定')
    codes.add(item['code'])
    items.push({ code: item['code'], label: item['label'], published: item['published'] })
  }
  return { version: data['version'], items }
}
export async function readReportTypes(token: string, signal: AbortSignal) {
  return parseReportTypes(await adminRequest('/admin/report-types', token, { signal }))
}
export async function saveReportType(
  token: string,
  item: ReportTypeItem,
  version: number,
  key: string,
  signal: AbortSignal,
) {
  return parseReportTypes(
    await adminRequest(`/admin/report-types/${encodeURIComponent(item.code)}`, token, {
      method: 'PUT',
      signal,
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({
        expected_version: version,
        label: item.label,
        published: item.published,
      }),
    }),
  )
}
