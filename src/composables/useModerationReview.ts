import { useRouter } from 'vue-router'
import type { CrisisSummary } from '@/types/crisis'
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/services/admin'
import { createModerationTransport, validModerationFeedback } from '@/services/content-transport'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import type {
  BusinessOutcome,
  ModerationCase,
  ModerationOutcome,
  ModerationSummary,
  ReviewDecision,
} from '@/types/moderation'

export function useModerationReview() {
  const editorOpen = ref(false)
  const editorTask = ref<'decision' | 'crisis'>('decision')
  const escalating = ref(false)
  const canEscalate = computed(() => useAdminStore().can('crisis_operator'))
  const items = ref<ModerationSummary[]>([])
  const cursor = ref<string | null>(null)
  const nextCursor = ref<string | null>(null)
  const history = ref<(string | null)[]>([])
  const listBusy = ref(false)
  const listError = ref('')
  const error = ref('')
  const detail = ref<ModerationCase | null>(null)
  const selectedId = ref('')
  const loading = ref(false)
  const writing = ref(false)
  const decision = ref<'approved' | 'rejected'>('approved')
  const reason = ref('')
  const suggestion = ref('')
  const confirming = ref(false)
  const outcome = ref<ModerationOutcome | null>(null)
  const notice = ref('')
  let editorGeneration = 0
  let attempt: { fingerprint: string; key: string } | null = null
  const router = useRouter()
  async function crisisEscalated(value: CrisisSummary) {
    close()
    try {
      await router.push({ path: '/crisis', query: { case: value.id } })
    } catch {
      error.value = '危机升级已确认，但页面跳转未完成，请进入危机工作台查看'
    }
  }
  const workspace = useAdminWorkspace(clearAll)
  const client = createModerationTransport(useAdminStore().session?.token ?? '', workspace.allowed)
  const valid = computed(
    () =>
      decision.value === 'approved' ||
      (validModerationFeedback(reason.value.trim()) &&
        validModerationFeedback(suggestion.value.trim())),
  )
  const outcomeLabels: Record<BusinessOutcome, string> = {
    published: '已公开',
    delivered: '已送达',
    cancelled: '业务已取消',
    privacy_review_required: '仍需隐私复核',
    pending_review: '仍待审核',
    ready: '待后续发布',
    expired: '已过期',
    active: '业务已生效',
  }
  function stateLabel(value: string) {
    const labels: Record<string, string> = {
      human_required: '待人工审核',
      approved: '已通过',
      rejected: '已驳回',
    }
    return labels[value] ?? '未知状态（只读）'
  }
  function resetDecision() {
    editorOpen.value = false
    editorTask.value = 'decision'
    escalating.value = false
    confirming.value = false
    decision.value = 'approved'
    reason.value = ''
    suggestion.value = ''
    attempt = null
  }
  function startProcessing(task: 'decision' | 'crisis') {
    if (!workspace.allowed() || !detail.value || writing.value || escalating.value) return
    if (task === 'decision' && detail.value.status !== 'human_required') return
    if (task === 'crisis' && !canEscalate.value) return
    resetDecision()
    editorTask.value = task
    editorOpen.value = true
  }
  function cancelProcessing() {
    if (!writing.value && !escalating.value) resetDecision()
  }
  function closeProcessing(done: () => void) {
    if (writing.value || escalating.value) return
    resetDecision()
    done()
  }
  async function reloadSelected() {
    const id = selectedId.value
    if (id) await openCase(id)
  }
  function clearEditor() {
    resetDecision()
    editorGeneration++
    detail.value = null
    selectedId.value = ''
    loading.value = false
    writing.value = false
    confirming.value = false
    decision.value = 'approved'
    reason.value = ''
    suggestion.value = ''
    error.value = ''
    outcome.value = null
    notice.value = ''
    attempt = null
  }
  function clearAll() {
    clearEditor()
    items.value = []
    cursor.value = null
    nextCursor.value = null
    history.value = []
    listBusy.value = false
    listError.value = ''
  }
  async function loadList() {
    listBusy.value = true
    listError.value = ''
    items.value = []
    nextCursor.value = null
    await workspace.run(
      (signal) => client.list(cursor.value, signal),
      (page) => {
        items.value = page.items
        nextCursor.value = page.next_cursor
      },
      (cause) => {
        listError.value = reviewErrorMessage(cause)
      },
      () => {
        listBusy.value = false
      },
    )
  }
  async function refresh(reset = true) {
    workspace.cancel()
    clearEditor()
    if (reset) {
      cursor.value = null
      history.value = []
    }
    await loadList()
  }
  async function page(direction: 'next' | 'previous') {
    if (listBusy.value || writing.value) return
    if (direction === 'next') {
      if (!nextCursor.value) return
      history.value.push(cursor.value)
      cursor.value = nextCursor.value
    } else {
      if (!history.value.length) return
      cursor.value = history.value.pop() ?? null
    }
    await refresh(false)
  }
  async function openCase(id: string) {
    workspace.cancel()
    clearEditor()
    selectedId.value = id
    loading.value = true
    await workspace.run(
      (signal) => client.detail(id, signal),
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
    workspace.cancel()
    clearEditor()
  }
  function check() {
    if (
      editorOpen.value &&
      editorTask.value === 'decision' &&
      valid.value &&
      detail.value?.status === 'human_required'
    )
      confirming.value = true
  }
  async function submit() {
    const current = detail.value
    if (
      !current ||
      !editorOpen.value ||
      editorTask.value !== 'decision' ||
      !confirming.value ||
      !valid.value ||
      writing.value ||
      current.status !== 'human_required'
    )
      return
    const input: ReviewDecision =
      decision.value === 'approved'
        ? { decision: 'approved', expected_version: current.version }
        : {
            decision: 'rejected',
            expected_version: current.version,
            reason: reason.value.trim(),
            revision_suggestion: suggestion.value.trim(),
          }
    const fingerprint = JSON.stringify([current.id, input])
    if (attempt?.fingerprint !== fingerprint)
      attempt = { fingerprint, key: globalThis.crypto.randomUUID() }
    const key = attempt.key
    writing.value = true
    error.value = ''
    await workspace.run(
      (signal) => client.decide(current.id, input, key, signal),
      async (result) => {
        clearEditor()
        outcome.value = result
        notice.value = '审核决定已确认，请分别核对内容判定与业务结果'
        await loadList()
      },
      async (cause) => {
        if (cause instanceof ApiError && cause.status === 409) {
          const generation = editorGeneration + 1
          await openCase(current.id)
          if (editorGeneration === generation && workspace.allowed())
            error.value = '版本或状态已变化，已重新读取；请重新核对，旧操作不会自动重试'
        } else if (cause instanceof ApiError && cause.status === 404) {
          clearEditor()
          error.value = reviewErrorMessage(cause)
        } else error.value = reviewErrorMessage(cause)
      },
      () => {
        writing.value = false
      },
    )
  }
  onMounted(() => {
    void loadList()
  })

  return {
    editorOpen,
    editorTask,
    escalating,
    canEscalate,
    items,
    nextCursor,
    history,
    listBusy,
    listError,
    error,
    detail,
    selectedId,
    loading,
    writing,
    decision,
    reason,
    suggestion,
    confirming,
    outcome,
    notice,
    workspace,
    valid,
    outcomeLabels,
    stateLabel,
    refresh,
    loadList,
    page,
    openCase,
    close,
    check,
    submit,
    startProcessing,
    cancelProcessing,
    closeProcessing,
    reloadSelected,
    crisisEscalated,
  }
}
