import { ApiError } from './admin'
import {
  createReviewBoundary,
  mockPage,
  reviewPage,
  reviewRecord,
  reviewText,
  reviewVersion,
} from './review-boundary'
import { wordlistKinds, wordlistStatuses } from '@/types/wordlists'
import type {
  Wordlist,
  WordlistClient,
  WordlistDetail,
  WordlistHead,
  WordlistPage,
} from '@/types/wordlists'

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

export function createWordlistClient(allowed: () => boolean): WordlistClient {
  const boundary = createReviewBoundary(allowed)
  const lists: WordlistDetail[] = [
    {
      id: 'synthetic-wordlist-school',
      kind: 'school',
      version: 2,
      status: 'published',
      base_effective_id: null,
      entries: ['合成涉校词'],
    },
    {
      id: 'synthetic-wordlist-ordinary',
      kind: 'ordinary_violation',
      version: 2,
      status: 'published',
      base_effective_id: null,
      entries: ['合成违规词'],
    },
  ]
  const heads: WordlistHead[] = wordlistKinds.map((kind) => {
    const effective = lists.find((item) => item.kind === kind)
    return { kind, version: effective ? 3 : 1, effective_id: effective?.id ?? null }
  })
  function headFor(kind: unknown) {
    const head = heads.find((item) => item.kind === kind)
    if (!head) throw new ApiError(400)
    return head
  }
  function commandVersion(value: unknown) {
    try {
      return reviewVersion(value)
    } catch {
      throw new ApiError(400)
    }
  }
  let sequence = 0
  return {
    async demoScan(body, signal) {
      await boundary.authorize(signal)
      reviewText(body)
      return lists
        .filter((item) => item.status === 'published')
        .map((item) => ({
          kind: item.kind,
          id: item.id,
          version: item.version,
          matches: item.entries.filter((entry) => body.includes(entry)),
        }))
    },
    async list(cursor, signal) {
      await boundary.authorize(signal)
      return parseWordlistPage({ ...mockPage(lists, cursor), heads })
    },
    async detail(id, signal) {
      await boundary.authorize(signal)
      const item = lists.find((item) => item.id === id)
      if (!item) throw new ApiError(404)
      return parseWordlistDetail(item)
    },
    create(input, key, signal) {
      return boundary.command('wordlists/versions', input, key, signal, parseWordlist, () => {
        const head = headFor(input.kind)
        const expected = commandVersion(input.expected_version)
        if (!Array.isArray(input.entries)) throw new ApiError(400)
        const entries = input.entries.map((entry) => reviewText(entry).trim())
        if (expected !== head.version) throw new ApiError(409)
        const item: WordlistDetail = {
          id: `synthetic-wordlist-draft-${++sequence}`,
          kind: head.kind,
          version: 1,
          status: 'draft',
          base_effective_id: head.effective_id,
          entries,
        }
        lists.push(item)
        head.version++
        return item
      })
    },
    publish(id, input, key, signal) {
      return boundary.command(`wordlists/${id}/publish`, input, key, signal, parseWordlist, () => {
        const expected = commandVersion(input.expected_version)
        const expectedHead = commandVersion(input.expected_head_version)
        const item = lists.find((entry) => entry.id === id)
        if (!item) throw new ApiError(404)
        const head = headFor(item.kind)
        if (
          item.version !== expected ||
          head.version !== expectedHead ||
          item.status !== 'draft' ||
          item.base_effective_id !== head.effective_id
        )
          throw new ApiError(409)
        const previous = lists.find((entry) => entry.id === head.effective_id)
        if (previous) {
          previous.status = 'archived'
          previous.version++
        }
        item.status = 'published'
        item.version++
        head.effective_id = item.id
        head.version++
        return item
      })
    },
  }
}
