import { reviewPage, reviewRecord, reviewText, reviewVersion } from './review-boundary'
import { wordlistKinds, wordlistStatuses } from '@/types/wordlists'
import type { Wordlist, WordlistDetail, WordlistHead, WordlistPage } from '@/types/wordlists'

function parseKind(value: unknown) {
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
  }
}
export function parseWordlistDetail(value: unknown): WordlistDetail {
  const data = reviewRecord(value)
  if (!Array.isArray(data['entries'])) throw new Error('词条快照格式异常')
  return { ...parseWordlist(value), entries: data['entries'].map(reviewText) }
}
export function parseWordlistPage(value: unknown): WordlistPage {
  const data = reviewRecord(value)
  if (!Array.isArray(data['heads']) || data['heads'].length !== wordlistKinds.length)
    throw new Error('词库基准格式异常')
  const heads = data['heads'].map((value): WordlistHead => {
    const head = reviewRecord(value)
    return {
      kind: parseKind(head['kind']),
      version: reviewVersion(head['version']),
      effective_id: nullableId(head['effective_id']),
    }
  })
  if (new Set(heads.map((head) => head.kind)).size !== wordlistKinds.length)
    throw new Error('词库基准分类重复或缺失')
  return { ...reviewPage(value, parseWordlist), heads }
}
