import type { CursorPage } from './moderation'
export const wordlistKinds = ['crisis', 'school', 'ordinary_violation'] as const
export type WordlistKind = (typeof wordlistKinds)[number]
export const wordlistStatuses = ['draft', 'published', 'archived'] as const
export interface Wordlist {
  id: string
  version: number
  kind: WordlistKind
  status: (typeof wordlistStatuses)[number]
  base_effective_id: string | null
}
export interface WordlistDetail extends Wordlist {
  entries: string[]
}
export interface WordlistHead {
  kind: WordlistKind
  version: number
  effective_id: string | null
}
export interface WordlistPage extends CursorPage<Wordlist> {
  heads: WordlistHead[]
}
export interface WordlistInput {
  kind: WordlistKind
  entries: string[]
  expected_version: number
}
export interface WordlistPublish {
  expected_version: number
  expected_head_version: number
}
/** 仅验证合成词库的本地字面匹配，不代表真实扫描结果。 */
export interface DemoWordlistMatch {
  kind: WordlistKind
  id: string
  version: number
  matches: string[]
}
export interface WordlistClient {
  demoScan(body: string, signal: AbortSignal): Promise<DemoWordlistMatch[]>
  list(cursor: string | null, signal: AbortSignal): Promise<WordlistPage>
  detail(id: string, signal: AbortSignal): Promise<WordlistDetail>
  create(input: WordlistInput, key: string, signal: AbortSignal): Promise<Wordlist>
  publish(id: string, input: WordlistPublish, key: string, signal: AbortSignal): Promise<Wordlist>
}
