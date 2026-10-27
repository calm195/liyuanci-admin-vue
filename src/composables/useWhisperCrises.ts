import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/services/admin'
import { createWhispersClient } from '@/services/whispers'
import { parseReasonCommand, parseCrisisCommand } from '@/services/whispers/parsers'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import { useAdminStore } from '@/stores/admin'
import { crisisActions } from '@/types/crisis'
import type { CrisisCommand, CrisisDetail, CrisisSummary, ReasonCommand } from '@/types/whispers'

type Attempt =
  | { kind: 'action'; id: string; key: string; body: CrisisCommand }
  | { kind: 'false_positive'; id: string; key: string; body: ReasonCommand }
export const whisperCrisisStatuses: Record<CrisisSummary['status'], string> = {
  open: '待接手',
  in_progress: '跟进中',
  resolved: '已结案',
  false_positive: '已标记误报',
}
export const whisperCrisisActions: Record<CrisisCommand['action'] | 'false_positive', string> = {
  take_over: '接手危机',
  follow_up: '记录跟进',
  resolve: '危机结案',
  retry_notification: '重试有效通知',
  false_positive: '标记误报',
}
export const whisperDeliveryLabels: Record<CrisisDetail['care_delivery'], string> = {
  pending: '待投递',
  delivered: '已投递',
  cancelled: '已取消',
}

export function useWhisperCrises() {
  const admin = useAdminStore()
  const items = ref<CrisisSummary[]>([])
  const nextCursor = ref<string | null>(null)
  const listBusy = ref(false)
  const listError = ref('')
  const listNotice = ref('')
  const selectedId = ref('')
  const detail = ref<CrisisDetail | null>(null)
  const loading = ref(false)
  const error = ref('')
  const notice = ref('')
  const outcome = ref<CrisisSummary | null>(null)
  const editorOpen = ref(false)
  const task = ref<CrisisCommand['action'] | 'false_positive'>('take_over')
  const reason = ref('')
  const confirming = ref(false)
  const writing = ref(false)
  const uncertain = ref(false)
  const usedCursors = new Set<string | null>()
  let attempt: Attempt | null = null
  const workspace = useAdminWorkspace(clearAll, 'crisis_operator')
  const client = createWhispersClient(
    admin.session?.token ?? '',
    (scope) => workspace.allowed() && scope === 'admin-crisis',
  )
  const options = computed(() => {
    const current = detail.value
    if (!current || !workspace.allowed()) return []
    const result: (CrisisCommand['action'] | 'false_positive')[] = []
    if (current.allowed_actions.includes('whisperAdminCrisisAct')) result.push(...crisisActions)
    if (current.allowed_actions.includes('whisperAdminCrisisFalsePositive'))
      result.push('false_positive')
    return result
  })
  const valid = computed(() => {
    const current = detail.value
    if (!current || !options.value.includes(task.value)) return false
    try {
      const body = { expected_version: current.version, reason: reason.value }
      if (task.value === 'false_positive') parseReasonCommand(body)
      else parseCrisisCommand({ ...body, action: task.value })
      return true
    } catch {
      return false
    }
  })
  function resetForm() {
    editorOpen.value = false
    task.value = 'take_over'
    reason.value = ''
    confirming.value = false
    uncertain.value = false
    writing.value = false
    attempt = null
  }
  function clearDetail() {
    detail.value = null
    selectedId.value = ''
    loading.value = false
    error.value = ''
    resetForm()
  }
  function clearAll() {
    clearDetail()
    items.value = []
    nextCursor.value = null
    usedCursors.clear()
    listBusy.value = false
    listError.value = ''
    listNotice.value = ''
    notice.value = ''
    outcome.value = null
  }
  function cancelReads() {
    workspace.cancel()
    loading.value = false
    listBusy.value = false
  }
  async function loadList(cursor: string | null) {
    listBusy.value = true
    listError.value = ''
    await workspace.run(
      (signal) => client.whisperAdminCrisesList(cursor, signal),
      (page) => {
        usedCursors.add(cursor)
        const merged = new Map(items.value.map((item) => [item.id, item]))
        for (const item of page.items) {
          if (
            detail.value?.id === item.id &&
            (detail.value.version !== item.version ||
              detail.value.source.content_version !== item.source.content_version ||
              detail.value.source.id !== item.source.id ||
              detail.value.source.kind !== item.source.kind ||
              detail.value.status !== item.status)
          ) {
            clearDetail()
            notice.value = '案件版本或状态已变化，已清除旧正文，请重新选择案件。'
          }
          merged.set(item.id, item)
        }
        items.value = [...merged.values()]
        if (page.next_cursor !== null && usedCursors.has(page.next_cursor)) {
          nextCursor.value = null
          listNotice.value = '分页游标重复，已停止加载，请刷新列表。'
        } else nextCursor.value = page.next_cursor
      },
      (cause) => {
        if (cause instanceof ApiError && cause.status === 409) {
          clearDetail()
          items.value = []
          nextCursor.value = null
          usedCursors.clear()
        }
        listError.value = reviewErrorMessage(cause)
      },
      () => {
        listBusy.value = false
      },
    )
  }
  async function refresh() {
    if (writing.value || editorOpen.value) return
    cancelReads()
    clearAll()
    await loadList(null)
  }
  async function more() {
    if (listBusy.value || editorOpen.value || nextCursor.value === null) return
    await loadList(nextCursor.value)
  }
  async function openCase(id: string) {
    if (writing.value || editorOpen.value) return
    cancelReads()
    clearDetail()
    notice.value = ''
    outcome.value = null
    selectedId.value = id
    loading.value = true
    await workspace.run(
      (signal) => client.whisperAdminCrisisGet(id, signal),
      (value) => {
        detail.value = value
      },
      (cause) => {
        error.value = reviewErrorMessage(cause)
      },
      () => {
        loading.value = false
      },
    )
  }
  function close() {
    if (writing.value || editorOpen.value) return
    cancelReads()
    clearDetail()
  }
  function startProcessing(kind: CrisisCommand['action'] | 'false_positive') {
    if (writing.value || editorOpen.value || !options.value.includes(kind)) return
    cancelReads()
    resetForm()
    error.value = ''
    task.value = kind
    editorOpen.value = true
  }
  function cancelProcessing() {
    if (writing.value || uncertain.value) return
    resetForm()
    error.value = ''
  }
  function closeProcessing(done: () => void) {
    if (writing.value || uncertain.value) return
    cancelProcessing()
    done()
  }
  function check() {
    if (!editorOpen.value || writing.value || uncertain.value || !valid.value) return
    confirming.value = true
  }
  function back() {
    if (!writing.value && !uncertain.value) confirming.value = false
  }
  async function submit() {
    const current = detail.value
    if (!current || !editorOpen.value || !confirming.value || writing.value || !valid.value) return
    if (!options.value.includes(task.value)) return
    if (!attempt)
      attempt =
        task.value === 'false_positive'
          ? {
              kind: 'false_positive',
              id: current.id,
              key: crypto.randomUUID(),
              body: parseReasonCommand({ expected_version: current.version, reason: reason.value }),
            }
          : {
              kind: 'action',
              id: current.id,
              key: crypto.randomUUID(),
              body: parseCrisisCommand({
                expected_version: current.version,
                action: task.value,
                reason: reason.value,
              }),
            }
    const pending = attempt
    writing.value = true
    error.value = ''
    await workspace.run(
      async (signal) =>
        pending.kind === 'action'
          ? client.whisperAdminCrisisAct(pending.id, pending.body, pending.key, signal)
          : client.whisperAdminCrisisFalsePositive(pending.id, pending.body, pending.key, signal),
      (result) => {
        clearDetail()
        const receipt: CrisisSummary = {
          id: result.id,
          version: result.version,
          source: result.source,
          status: result.status,
          handoff_at: result.handoff_at,
          allowed_actions: [],
        }
        outcome.value = receipt
        items.value = items.value.map((item) => (item.id === receipt.id ? receipt : item))
        notice.value =
          pending.kind === 'false_positive'
            ? '误报处理已返回，转普通复核不等于公开；取消、注销或换版的内容不会重建，胶囊仍须符合到期条件。'
            : pending.body.action === 'resolve'
              ? '结案处理已返回，危机隔离不会因此解除。'
              : '危机处理已返回，请重新读取案件核对最新时间线和投递状态；重试只作用于仍有效的通知待办。'
      },
      (cause) => {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 409)) {
          clearDetail()
          selectedId.value = pending.id
          items.value = items.value.filter((item) => item.id !== pending.id)
          error.value =
            cause.status === 404
              ? '案件已不可访问，已清除正文和处理表单。'
              : '案件版本或状态已变化，已清除旧正文和表单，请重新读取后核对。'
        } else if (cause instanceof ApiError && [400, 429, 503].includes(cause.status)) {
          attempt = null
          confirming.value = false
          uncertain.value = false
          error.value = reviewErrorMessage(cause)
        } else {
          uncertain.value = true
          error.value = '写入结果尚未确认，请恢复连接后使用原请求重试。'
        }
      },
      () => {
        writing.value = false
      },
    )
  }
  onMounted(refresh)
  return {
    items,
    nextCursor,
    listBusy,
    listError,
    listNotice,
    selectedId,
    detail,
    loading,
    error,
    notice,
    outcome,
    editorOpen,
    task,
    reason,
    confirming,
    writing,
    uncertain,
    workspace,
    options,
    admin,
    valid,
    refresh,
    more,
    openCase,
    close,
    startProcessing,
    cancelProcessing,
    closeProcessing,
    check,
    back,
    submit,
  }
}
