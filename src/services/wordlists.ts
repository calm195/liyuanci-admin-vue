import { reviewPage, reviewRecord, reviewText, reviewVersion } from './review-boundary'
import { wordlistKinds, wordlistStatuses } from '@/types/wordlists'
import type {
  BuiltinEntries,
  MatchDisposition,
  WordlistMatch,
  WordlistPreview,
  WordlistEvidence,
  Wordlist,
  WordlistDetail,
  WordlistHead,
  WordlistPage,
} from '@/types/wordlists'

function parseKind(value: unknown) {
  if (value === 'builtin') return value
  const kind = wordlistKinds.find((item) => item === value)
  if (!kind) throw new Error('词库分类格式异常')
  return kind
}
function nullableId(value: unknown) {
  return value === null ? null : reviewText(value)
}
export function parseWordlist(value: unknown): Wordlist {
  const data = reviewRecord(value)
  const status = wordlistStatuses.find((item) => item === data['status'])
  if (!status) throw new Error('词库状态格式异常')
  return {
    id: reviewText(data['id']),
    version: reviewVersion(data['version']),
    kind: parseKind(data['kind']),
    status,
    base_effective_id: nullableId(data['base_effective_id']),
    ...(data['upstream_version'] === undefined
      ? {}
      : { upstream_version: reviewText(data['upstream_version']) }),
    ...(data['upstream_digest'] === undefined
      ? {}
      : { upstream_digest: reviewText(data['upstream_digest']) }),
  }
}
export function parseDisabledEntries(value: unknown, entries: readonly string[]): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('停用词条格式异常')
  const disabled = value.map(reviewText)
  const words = new Set(entries)
  if (new Set(disabled).size !== disabled.length || disabled.some((entry) => !words.has(entry)))
    throw new Error('停用词条必须是完整快照内不重复的词条')
  return disabled
}
export function parseWordlistDetail(value: unknown): WordlistDetail {
  const data = reviewRecord(value)
  if (!Array.isArray(data['entries'])) throw new Error('词条快照格式异常')
  const entries = data['entries'].map(reviewText)
  const disabled = parseDisabledEntries(data['disabled_entries'], entries)
  return {
    ...parseWordlist(value),
    entries,
    ...(disabled.length ? { disabled_entries: disabled } : {}),
  }
}
export function parseWordlistPage(value: unknown): WordlistPage {
  const data = reviewRecord(value)
  if (!Array.isArray(data['heads'])) throw new Error('词库基准格式异常')
  const heads = data['heads'].map((value): WordlistHead => {
    const head = reviewRecord(value)
    return {
      kind: parseKind(head['kind']),
      version: reviewVersion(head['version']),
      effective_id: nullableId(head['effective_id']),
    }
  })
  const kinds = new Set(heads.map((head) => head.kind))
  if (kinds.size !== heads.length || wordlistKinds.some((kind) => !kinds.has(kind)))
    throw new Error('词库基准分类重复或缺失')
  return { ...reviewPage(value, parseWordlist), heads }
}

function parseDisposition(value: unknown): MatchDisposition {
  if (value !== 'review' && value !== 'hint') throw new Error('词条处置格式异常')
  return value
}

function count(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('计数或位置格式异常')
  return value
}

export function parseMatches(value: unknown): WordlistMatch[] {
  if (!Array.isArray(value)) throw new Error('词库命中结果格式异常')
  return value.map((item) => {
    const data = reviewRecord(item)
    const source = data['source']
    const kind = parseKind(data['kind'])
    const field = data['field']
    if (field !== undefined && field !== 'body' && field !== 'title' && field !== 'reward_text')
      throw new Error('命中字段格式异常')
    const start = count(data['start'])
    const end = count(data['end'])
    if (source !== 'builtin' && source !== 'custom') throw new Error('词库来源格式异常')
    if (end <= start || (source === 'builtin') !== (kind === 'builtin'))
      throw new Error('词库命中区间或分类格式异常')
    return {
      source,
      kind,
      start,
      end,
      ...(field ? { field } : {}),
      word: reviewText(data['word']),
      disposition: parseDisposition(data['disposition']),
      ...(data['label'] ? { label: reviewText(data['label']) } : {}),
    }
  })
}
export function parseWordlistEvidence(value: unknown): WordlistEvidence {
  const data = reviewRecord(value)
  const truncated = data['truncated']
  if (truncated !== undefined && typeof truncated !== 'boolean')
    throw new Error('命中详情完整性格式异常')
  return {
    engine_version: reviewText(data['engine_version']),
    crisis_version: reviewText(data['crisis_version']),
    school_version: reviewText(data['school_version']),
    ordinary_version: reviewText(data['ordinary_version']),
    matches: parseMatches(data['matches']),
    ...(data['builtin_version'] ? { builtin_version: reviewText(data['builtin_version']) } : {}),
    ...(truncated !== undefined ? { truncated } : {}),
  }
}

export function parseWordlistPreview(value: unknown): WordlistPreview {
  const data = reviewRecord(value)
  function result(value: unknown) {
    const data = reviewRecord(value)
    const truncated = data['truncated']
    if (
      !Array.isArray(data['routes']) ||
      (truncated !== undefined && typeof truncated !== 'boolean')
    )
      throw new Error('试跑流转格式异常')
    return {
      matches: parseMatches(data['matches']),
      routes: data['routes'].map(reviewText),
      ...(truncated !== undefined ? { truncated } : {}),
    }
  }
  return { effective: result(data['effective']), draft: result(data['draft']) }
}

export function parseBuiltinEntries(value: unknown): BuiltinEntries {
  const data = reviewRecord(value)
  if (!Array.isArray(data['items']) || !Array.isArray(data['labels']))
    throw new Error('内置词库分页格式异常')
  return {
    total: count(data['total']),
    upstream_version: reviewText(data['upstream_version']),
    labels: data['labels'].map(reviewText),
    items: data['items'].map((item) => {
      const data = reviewRecord(item)
      const enabled = data['enabled']
      if (typeof enabled !== 'boolean') throw new Error('词条启停状态格式异常')
      return {
        id: reviewText(data['id']),
        word: reviewText(data['word']),
        label: reviewText(data['label']),
        enabled,
        disposition: parseDisposition(data['disposition']),
      }
    }),
  }
}
