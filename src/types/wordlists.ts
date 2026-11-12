import type { CursorPage } from './moderation'
export const wordlistKinds = ['crisis', 'school', 'ordinary_violation'] as const
export type CustomWordlistKind = (typeof wordlistKinds)[number]
export type WordlistKind = CustomWordlistKind | 'builtin'
export const wordlistStatuses = ['draft', 'published', 'archived'] as const
export interface Wordlist {
  id: string
  version: number
  kind: WordlistKind
  status: (typeof wordlistStatuses)[number]
  base_effective_id: string | null
  upstream_version?: string
  upstream_digest?: string
}
export const wordlistRuleCategories: Record<string, string> = {
  internet_slang: '网络用语',
  insult: '攻击辱骂',
  negative_expression: '消极表达',
  abbreviation: '缩写变体',
}
export interface WordlistRule {
  entry: string
  category: string
  aliases: string[]
  match_mode: 'contains' | 'word'
  action: 'hint' | 'review'
}
export interface WordlistDetail extends Wordlist {
  rules?: WordlistRule[]
  entries: string[]
  disabled_entries?: string[]
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
  rules?: WordlistRule[]
  kind: CustomWordlistKind
  entries: string[]
  disabled_entries?: string[]
  expected_version: number
}
export interface WordlistPublish {
  expected_version: number
  expected_head_version: number
}
export type MatchDisposition = 'review' | 'hint'
export interface WordlistMatch {
  word: string
  source: 'builtin' | 'custom'
  kind: WordlistKind
  label?: string
  field?: 'body' | 'title' | 'reward_text'
  disposition: MatchDisposition
  start: number
  end: number
}
export interface WordlistEvidence {
  engine_version: string
  builtin_version?: string
  crisis_version: string
  school_version: string
  ordinary_version: string
  matches: WordlistMatch[]
  truncated?: boolean
}
export interface WordlistPreviewResult {
  matches: WordlistMatch[]
  routes: string[]
  truncated?: boolean
}
export interface WordlistPreview {
  effective: WordlistPreviewResult
  draft: WordlistPreviewResult
}
export interface BuiltinEntry {
  id: string
  word: string
  label: string
  enabled: boolean
  disposition: MatchDisposition
}
export interface BuiltinEntries {
  items: BuiltinEntry[]
  total: number
  labels: string[]
  upstream_version: string
}
type BuiltinSettings = Partial<Pick<BuiltinEntry, 'enabled' | 'disposition'>>
export interface BuiltinDraftInput {
  expected_version: number
  overrides: (BuiltinSettings & { id: string })[]
}
export type WordlistConfirmation =
  | WordlistInput
  | { item: Wordlist; input: WordlistPublish }
  | { restore: Wordlist; expected_head_version: number }
  | { builtin: BuiltinDraftInput }

export interface WordlistClient {
  builtinEntries(id: string, query: URLSearchParams, signal: AbortSignal): Promise<BuiltinEntries>
  createBuiltin(input: BuiltinDraftInput, key: string, signal: AbortSignal): Promise<Wordlist>
  restore(
    id: string,
    expectedHeadVersion: number,
    key: string,
    signal: AbortSignal,
  ): Promise<Wordlist>
  preview(id: string, text: string, signal: AbortSignal): Promise<WordlistPreview>
  list(cursor: string | null, signal: AbortSignal): Promise<WordlistPage>
  detail(id: string, signal: AbortSignal): Promise<WordlistDetail>
  create(input: WordlistInput, key: string, signal: AbortSignal): Promise<Wordlist>
  publish(id: string, input: WordlistPublish, key: string, signal: AbortSignal): Promise<Wordlist>
}
