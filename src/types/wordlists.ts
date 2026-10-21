import type { CursorPage } from './moderation'
export const wordlistKinds = ['crisis', 'school', 'ordinary_violation'] as const
export type WordlistKind = (typeof wordlistKinds)[number]
export interface Wordlist {
  id: string
  version: number
  kind: WordlistKind
  status: string
}
export interface WordlistInput {
  kind: WordlistKind
  entries: string[]
  expected_version?: number
}
export interface WordlistClient {
  list(cursor: string | null, signal: AbortSignal): Promise<CursorPage<Wordlist>>
  create(input: WordlistInput, key: string, signal: AbortSignal): Promise<Wordlist>
  publish(id: string, expectedVersion: number, key: string, signal: AbortSignal): Promise<Wordlist>
}
