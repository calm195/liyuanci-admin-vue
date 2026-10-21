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
/** 仅验证合成词库的本地字面匹配，不代表真实扫描结果。 */
export interface DemoWordlistMatch {
  kind: WordlistKind
  version: number
  matches: string[]
}
export interface WordlistClient {
  demoScan(body: string, signal: AbortSignal): Promise<DemoWordlistMatch[]>
  list(cursor: string | null, signal: AbortSignal): Promise<CursorPage<Wordlist>>
  create(input: WordlistInput, key: string, signal: AbortSignal): Promise<Wordlist>
  publish(id: string, expectedVersion: number, key: string, signal: AbortSignal): Promise<Wordlist>
}
