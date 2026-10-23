import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/services/admin'
import { createWordlistTransport } from '@/services/content-transport'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import { wordlistKinds } from '@/types/wordlists'
import type {
  Wordlist,
  WordlistInput,
  WordlistKind,
  WordlistHead,
  WordlistDetail,
  WordlistPublish,
} from '@/types/wordlists'

/** 每个路由独立持有状态；离页取消读取和写入，不跨页保留词条。 */
export function useWordlists(detailId?: string) {
  const items = ref<Wordlist[]>([])
  const heads = ref<WordlistHead[]>([])
  const detail = ref<WordlistDetail | null>(null)
  const detailBusy = ref(false)
  const busy = ref(false)
  const writing = ref(false)
  const loaded = ref(false)
  const error = ref('')
  const notice = ref('')
  const resultId = ref<string | null>(null)
  const kind = ref<WordlistKind>('school')
  const text = ref('')
  const confirmation = ref<WordlistInput | { item: Wordlist; input: WordlistPublish } | null>(null)
  let generation = 0
  let attempt: { fingerprint: string; key: string } | null = null
  const workspace = useAdminWorkspace(clear)
  const client = createWordlistTransport(useAdminStore().session?.token ?? '', workspace.allowed)
  const labels: Record<WordlistKind, string> = {
    crisis: '危机',
    school: '涉校',
    ordinary_violation: '普通违规',
  }
  const base = computed(() => heads.value.find((head) => head.kind === kind.value))
  function status(value: string) {
    return (
      ({ draft: '草稿', published: '已发布', archived: '已归档' } as Record<string, string>)[
        value
      ] ?? '未知状态（只读）'
    )
  }
  function clear() {
    generation++
    items.value = []
    heads.value = []
    detail.value = null
    detailBusy.value = false
    busy.value = false
    writing.value = false
    loaded.value = false
    error.value = ''
    notice.value = ''
    resultId.value = null
    text.value = ''
    confirmation.value = null
    attempt = null
  }
  async function load() {
    workspace.cancel()
    clear()
    busy.value = true
    await workspace.run(
      async (signal) => {
        const all: Wordlist[] = []
        const cursors = new Set<string>()
        let snapshot: WordlistHead[] | null = null
        let cursor: string | null = null
        do {
          const page = await client.list(cursor, signal)
          const ordered = wordlistKinds.map((kind) => page.heads.find((head) => head.kind === kind))
          if (snapshot && JSON.stringify(snapshot) !== JSON.stringify(ordered))
            throw new Error('词库分页基准已变化，请刷新')
          if (ordered.some((head) => !head)) throw new Error('词库基准缺失')
          snapshot = page.heads
            .slice()
            .sort(
              (left, right) => wordlistKinds.indexOf(left.kind) - wordlistKinds.indexOf(right.kind),
            )
          all.push(...page.items)
          cursor = page.next_cursor
          if (cursor) {
            if (cursors.has(cursor)) throw new Error('词库分页游标重复')
            cursors.add(cursor)
          }
        } while (cursor)
        return { items: all, heads: snapshot ?? [] }
      },
      (value) => {
        items.value = value.items
        heads.value = value.heads
        loaded.value = true
      },
      (cause) => {
        error.value = reviewErrorMessage(cause)
      },
      () => {
        busy.value = false
      },
    )
    if (loaded.value && detailId) await openDetail(detailId)
  }
  function prepare() {
    if (!loaded.value || busy.value || writing.value || !base.value) return
    const entries = text.value
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
    confirmation.value = {
      kind: kind.value,
      entries,
      expected_version: base.value.version,
    }
  }
  function publish(item: Wordlist) {
    if (writing.value || busy.value || !loaded.value || item.status !== 'draft') return
    const head = heads.value.find((head) => head.kind === item.kind)
    if (!head || item.base_effective_id !== head.effective_id) return
    confirmation.value = {
      item: { ...item },
      input: { expected_version: item.version, expected_head_version: head.version },
    }
  }
  async function submit() {
    const current = confirmation.value
    if (!current || writing.value || busy.value || !loaded.value) return
    const fingerprint = JSON.stringify(current)
    if (attempt?.fingerprint !== fingerprint)
      attempt = { fingerprint, key: globalThis.crypto.randomUUID() }
    const key = attempt.key
    writing.value = true
    error.value = ''
    await workspace.run(
      (signal) =>
        'entries' in current
          ? client.create(current, key, signal)
          : client.publish(current.item.id, current.input, key, signal),
      async (value) => {
        const expected = generation + 1
        await load()
        if (generation === expected && workspace.allowed()) {
          resultId.value = value.id
          notice.value = `${'entries' in current ? '草稿已创建，尚未发布' : '版本已发布，旧生效版已归档'}：${value.id} · 资源版本 ${value.version}；已有审核任务继续使用原词库快照`
        }
      },
      async (cause) => {
        if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) {
          const expected = generation + 1
          await load()
          if (generation === expected && workspace.allowed())
            error.value = loaded.value
              ? '版本或状态已变化，已重读列表；请重新核对，不会自动重提'
              : '版本或状态已变化，重读失败；请刷新核对，不会自动重提'
        } else error.value = reviewErrorMessage(cause)
      },
      () => {
        writing.value = false
      },
    )
  }
  async function openDetail(id: string) {
    if (busy.value || writing.value) return
    workspace.cancel()
    detail.value = null
    detailBusy.value = true
    error.value = ''
    await workspace.run(
      (signal) => client.detail(id, signal),
      (value) => {
        if (value.id !== id) throw new Error('词库详情响应不匹配')
        detail.value = value
      },
      (cause) => {
        error.value = reviewErrorMessage(cause)
      },
      () => {
        detailBusy.value = false
      },
    )
  }
  function canPublish(item: Wordlist) {
    return (
      item.status === 'draft' &&
      heads.value.some(
        (head) => head.kind === item.kind && head.effective_id === item.base_effective_id,
      )
    )
  }
  onMounted(() => {
    void load()
  })

  return {
    items,
    heads,
    detail,
    detailBusy,
    busy,
    writing,
    loaded,
    error,
    notice,
    resultId,
    kind,
    text,
    confirmation,
    workspace,
    labels,
    base,
    status,
    load,
    prepare,
    publish,
    submit,
    canPublish,
  }
}
