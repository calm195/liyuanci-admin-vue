import { ApiError } from './admin'
import {
  createReviewBoundary,
  mockPage,
  reviewPage,
  reviewRecord,
  reviewText,
  reviewVersion,
} from './review-boundary'
import { wordlistKinds } from '@/types/wordlists'
import type { Wordlist, WordlistClient } from '@/types/wordlists'

export function parseWordlist(value: unknown): Wordlist {
  const data = reviewRecord(value)
  const kind = wordlistKinds.find((item) => item === data['kind'])
  if (!kind) throw new Error('词库分类格式异常')
  return {
    id: reviewText(data['id']),
    version: reviewVersion(data['version']),
    kind,
    status: reviewText(data['status']),
  }
}
export const parseWordlistPage = (value: unknown) => reviewPage(value, parseWordlist)

export function createWordlistClient(allowed: () => boolean): WordlistClient {
  const boundary = createReviewBoundary(allowed)
  const lists: Wordlist[] = [
    { id: 'synthetic-wordlist-school', kind: 'school', version: 1, status: 'published' },
    {
      id: 'synthetic-wordlist-ordinary',
      kind: 'ordinary_violation',
      version: 1,
      status: 'published',
    },
  ]
  const entries = new Map<string, string[]>([
    ['synthetic-wordlist-school', ['合成涉校词']],
    ['synthetic-wordlist-ordinary', ['合成违规词']],
  ])
  let sequence = 0
  return {
    async demoScan(body, signal) {
      await boundary.authorize(signal)
      reviewText(body)
      return lists
        .filter((item) => item.status === 'published')
        .map((item) => ({
          kind: item.kind,
          version: item.version,
          matches: (entries.get(item.id) ?? []).filter((entry) => body.includes(entry)),
        }))
    },
    async list(cursor, signal) {
      await boundary.authorize(signal)
      return parseWordlistPage(mockPage(lists, cursor))
    },
    create(input, key, signal) {
      return boundary.command('wordlists/versions', input, key, signal, parseWordlist, () => {
        if (!wordlistKinds.includes(input.kind) || !Array.isArray(input.entries))
          throw new ApiError(400)
        input.entries.forEach(reviewText)
        const latest = lists
          .filter((item) => item.kind === input.kind)
          .reduce<Wordlist | undefined>(
            (previous, item) => (!previous || item.version > previous.version ? item : previous),
            undefined,
          )
        if (
          latest ? input.expected_version !== latest.version : input.expected_version !== undefined
        )
          throw new ApiError(409)
        const item: Wordlist = {
          id: `synthetic-wordlist-draft-${++sequence}`,
          kind: input.kind,
          version: (latest?.version ?? 0) + 1,
          status: 'draft',
        }
        entries.set(
          item.id,
          input.entries.map((entry) => entry.trim()),
        )
        lists.push(item)
        return item
      })
    },
    publish(id, expectedVersion, key, signal) {
      return boundary.command(
        `wordlists/${id}/publish`,
        { expected_version: expectedVersion },
        key,
        signal,
        parseWordlist,
        () => {
          reviewVersion(expectedVersion)
          const item = lists.find((entry) => entry.id === id)
          if (!item) throw new ApiError(404)
          if (
            item.version !== expectedVersion ||
            item.status !== 'draft' ||
            lists.some((entry) => entry.kind === item.kind && entry.version > item.version)
          )
            throw new ApiError(409)
          for (const entry of lists)
            if (entry.kind === item.kind && entry.status === 'published') entry.status = 'archived'
          item.status = 'published'
          item.version++
          return item
        },
      )
    },
  }
}
