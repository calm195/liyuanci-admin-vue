import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError } from '@/services/admin'
import { createCrisisClient, validCrisisReason } from '@/services/crisis'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import type {
  CrisisAction,
  CrisisDetail,
  CrisisEvent,
  CrisisEvidence,
  CrisisSummary,
  CrisisWork,
} from '@/types/crisis'

export function useCrisisReview() {
  const editorOpen = ref(false)
  const route = useRoute()
  let mounted = true
  onBeforeUnmount(() => {
    mounted = false
  })
  const items = ref<CrisisSummary[]>([])
  const cursor = ref<string | null>(null)
  const nextCursor = ref<string | null>(null)
  const history = ref<(string | null)[]>([])
  const listBusy = ref(false)
  const listError = ref('')
  const detail = ref<CrisisDetail | null>(null)
  const selected = ref('')
  const loading = ref(false)
  const error = ref('')
  const timeline = ref<CrisisEvent[]>([])
  const timelineBusy = ref(false)
  const timelineError = ref('')
  const work = ref<CrisisWork | null>(null)
  const workBusy = ref(false)
  const workError = ref('')
  const evidence = ref<CrisisEvidence | null>(null)
  const evidenceBusy = ref(false)
  const evidenceError = ref('')
  const showIdentity = ref(false)
  const action = ref<CrisisAction | 'false_positive'>('take_over')
  const reason = ref('')
  const confirming = ref(false)
  const writing = ref(false)
  const notice = ref('')
  const receipt = ref<CrisisSummary | null>(null)
  let attempt: { fingerprint: string; key: string } | null = null
  let generation = 0
  let evidenceGeneration = 0
  const workspace = useAdminWorkspace(clearAll, 'crisis_operator')
  const client = createCrisisClient(useAdminStore().session?.token ?? '', workspace.allowed)
  const evidenceRefs = computed(
    () => detail.value?.timeline.filter((item) => item.kind === 'evidence') ?? [],
  )
  const canAct = computed(
    () => detail.value?.status === 'pending_handling' || detail.value?.status === 'handling',
  )
  const valid = computed(() => canAct.value && validCrisisReason(reason.value.trim()))
  const actionLabels: Record<CrisisAction | 'false_positive', string> = {
    take_over: '接手处置',
    follow_up: '记录跟进',
    resolve: '结束处置',
    retry_notification: '重试人员通知',
    false_positive: '判定误报并转普通复核',
  }
  function status(value: string) {
    const labels: Record<string, string> = {
      pending_handling: '待人工接手',
      handling: '处理中',
      resolved: '处置已结束',
      false_positive: '误报，已转普通复核',
      pending: '等待投递或重试',
      leased: '投递处理中',
      completed: '已完成',
      sent: '已送达',
      delivered: '已送达',
      cancelled: '已取消',
    }
    return labels[value] ?? '未知状态（仅供查看）'
  }
  function eventLabel(value: string) {
    const labels: Record<string, string> = {
      ...actionLabels,
      isolated: '自动隔离',
      detected: '人工判定危机',
      view: '案件授权查看',
      evidence_view: '限定证据查看',
    }
    return labels[value] ?? '其他服务端动作'
  }
  function displayTime(value: string) {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      dateStyle: 'medium',
      timeStyle: 'medium',
      hour12: false,
    }).format(new Date(value))
  }
  function hideEvidence() {
    evidenceGeneration++
    evidence.value = null
    evidenceBusy.value = false
    evidenceError.value = ''
  }
  function resetOperation() {
    reason.value = ''
    action.value = 'take_over'
    confirming.value = false
    attempt = null
  }
  function startProcessing() {
    if (!canAct.value || loading.value || writing.value) return
    resetOperation()
    hideEvidence()
    showIdentity.value = false
    editorOpen.value = true
  }
  function cancelProcessing() {
    if (writing.value) return
    editorOpen.value = false
    resetOperation()
  }
  function closeProcessing(done: () => void) {
    if (writing.value) return
    cancelProcessing()
    done()
  }
  function clearCase() {
    editorOpen.value = false
    generation++
    selected.value = ''
    detail.value = null
    timeline.value = []
    work.value = null
    loading.value = false
    timelineBusy.value = false
    workBusy.value = false
    timelineError.value = ''
    workError.value = ''
    error.value = ''
    showIdentity.value = false
    reason.value = ''
    action.value = 'take_over'
    confirming.value = false
    writing.value = false
    attempt = null
    hideEvidence()
  }
  function clearAll() {
    clearCase()
    items.value = []
    cursor.value = null
    nextCursor.value = null
    history.value = []
    listBusy.value = false
    listError.value = ''
    notice.value = ''
    receipt.value = null
  }
  function failure(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 404)
      return '案件不存在、证据已不可访问或危机接口尚未装配，请联系后端核对'
    return reviewErrorMessage(cause)
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
        listError.value = failure(cause)
      },
      () => {
        listBusy.value = false
      },
    )
  }
  async function refresh(reset = true) {
    if (editorOpen.value) return
    workspace.cancel()
    clearCase()
    notice.value = ''
    receipt.value = null
    if (reset) {
      cursor.value = null
      history.value = []
    }
    await loadList()
  }
  async function page(next: boolean) {
    if (listBusy.value || editorOpen.value) return
    if (next) {
      if (!nextCursor.value) return
      history.value.push(cursor.value)
      cursor.value = nextCursor.value
    } else {
      if (!history.value.length) return
      cursor.value = history.value.pop() ?? null
    }
    await refresh(false)
  }
  async function loadTimeline() {
    const id = detail.value?.id
    if (!id || timelineBusy.value || writing.value) return
    timelineBusy.value = true
    timeline.value = []
    timelineError.value = ''
    await workspace.run(
      (signal) => client.timeline(id, signal),
      (value) => {
        timeline.value = value
      },
      (cause) => {
        timelineError.value = failure(cause)
      },
      () => {
        timelineBusy.value = false
      },
    )
  }
  async function loadWork() {
    const id = detail.value?.id
    if (!id || workBusy.value || writing.value) return
    workBusy.value = true
    work.value = null
    workError.value = ''
    await workspace.run(
      (signal) => client.work(id, signal),
      (value) => {
        work.value = value
      },
      (cause) => {
        workError.value = failure(cause)
      },
      () => {
        workBusy.value = false
      },
    )
  }
  async function open(id: string) {
    if (editorOpen.value) return
    workspace.cancel()
    clearCase()
    listBusy.value = false
    notice.value = ''
    receipt.value = null
    selected.value = id
    loading.value = true
    await workspace.run(
      (signal) => client.detail(id, signal),
      async (value) => {
        detail.value = value
        await Promise.all([loadTimeline(), loadWork()])
      },
      (cause) => {
        error.value = failure(cause)
      },
      () => {
        loading.value = false
      },
    )
  }
  async function readEvidence(id: string) {
    const current = detail.value
    if (
      !current ||
      !evidenceRefs.value.some((ref) => ref.id === id) ||
      evidenceBusy.value ||
      writing.value
    )
      return
    hideEvidence()
    evidenceBusy.value = true
    const currentGeneration = evidenceGeneration
    await workspace.run(
      (signal) => client.evidence(current.id, id, signal),
      (value) => {
        if (currentGeneration === evidenceGeneration) evidence.value = value
      },
      (cause) => {
        if (currentGeneration === evidenceGeneration) evidenceError.value = failure(cause)
      },
      () => {
        if (currentGeneration === evidenceGeneration) evidenceBusy.value = false
      },
    )
  }
  function close() {
    if (editorOpen.value) return
    workspace.cancel()
    clearCase()
  }
  function confirm() {
    if (editorOpen.value && valid.value && !loading.value && !writing.value) confirming.value = true
  }
  async function submit() {
    const current = detail.value
    if (!editorOpen.value || !current || !confirming.value || !valid.value || writing.value) return
    const input = { reason: reason.value.trim(), expected_version: current.version }
    const selectedAction = action.value
    const fingerprint = JSON.stringify([current.id, selectedAction, input])
    if (attempt?.fingerprint !== fingerprint)
      attempt = { fingerprint, key: globalThis.crypto.randomUUID() }
    const key = attempt.key
    writing.value = true
    error.value = ''
    await workspace.run(
      (signal) =>
        selectedAction === 'false_positive'
          ? client.falsePositive(current.id, input, key, signal)
          : client.act(current.id, { ...input, action: selectedAction }, key, signal),
      async (result) => {
        clearCase()
        receipt.value = result
        notice.value =
          selectedAction === 'false_positive'
            ? '误报处理已确认：仅解除本案危机限制，后续须普通复核，不会直接公开或送达'
            : selectedAction === 'retry_notification'
              ? '通知重试请求已确认；不代表通知已送达或已有人员接手'
              : '处置已确认；结束处置不会自动解除危机隔离'
        await loadList()
      },
      async (cause) => {
        if (cause instanceof ApiError && cause.status === 409) {
          editorOpen.value = false
          const expected = generation + 1
          await open(current.id)
          if (generation === expected && workspace.allowed())
            error.value = '案件版本或状态已变化，已重新读取；请重新核对，旧操作不会自动重试'
        } else if (cause instanceof ApiError && cause.status === 404) {
          clearCase()
          error.value = failure(cause)
        } else error.value = failure(cause)
      },
      () => {
        writing.value = false
      },
    )
  }
  watch(
    [action, reason],
    () => {
      confirming.value = false
    },
    { flush: 'sync' },
  )
  watch(
    () => route.query['case'],
    (value) => {
      if (typeof value === 'string' && value.trim()) void open(value)
    },
  )
  onMounted(() => {
    void (async () => {
      await loadList()
      const id = route.query['case']
      if (typeof id === 'string' && id.trim() && mounted && workspace.allowed()) await open(id)
    })()
  })

  return {
    editorOpen,
    startProcessing,
    cancelProcessing,
    closeProcessing,
    items,
    cursor,
    nextCursor,
    history,
    listBusy,
    listError,
    detail,
    selected,
    loading,
    error,
    timeline,
    timelineBusy,
    timelineError,
    work,
    workBusy,
    workError,
    evidence,
    evidenceBusy,
    evidenceError,
    showIdentity,
    action,
    reason,
    confirming,
    writing,
    notice,
    receipt,
    workspace,
    evidenceRefs,
    canAct,
    valid,
    actionLabels,
    status,
    eventLabel,
    displayTime,
    hideEvidence,
    loadList,
    refresh,
    page,
    loadTimeline,
    loadWork,
    open,
    readEvidence,
    close,
    confirm,
    submit,
  }
}
