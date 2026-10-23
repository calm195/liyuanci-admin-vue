import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import { validIdentityFeedback } from '@/services/identity'
import { createIdentityTransport } from '@/services/identity-transport'
import type {
  IdentityCase,
  IdentityDecision,
  IdentityReceipt,
  IdentitySummary,
} from '@/types/identity'

export function useIdentityReview() {
  const editorOpen = ref(false)
  const admin = useAdminStore()
  const owner = admin.session
  const allowed = () => admin.session === owner && admin.can('review_operator')
  const client = createIdentityTransport(owner?.token ?? '', allowed)
  const items = ref<IdentitySummary[]>([])
  const nextCursor = ref<string | null>(null)
  const currentCursor = ref<string | null>(null)
  const cursors = ref<(string | null)[]>([])
  const listBusy = ref(false)
  const listError = ref('')
  const detail = ref<IdentityCase | null>(null)
  const selected = ref('')
  const caseBusy = ref(false)
  const cardBusy = ref(false)
  const submitting = ref(false)
  const cardUrl = ref('')
  const caseError = ref('')
  const notice = ref('')
  const receipt = ref<IdentityReceipt | null>(null)
  const decision = ref<'approved' | 'rejected'>('approved')
  const reason = ref('')
  const suggestion = ref('')
  const confirming = ref(false)
  const valid = computed(
    () =>
      decision.value === 'approved' ||
      (validIdentityFeedback(reason.value.trim()) &&
        validIdentityFeedback(suggestion.value.trim())),
  )
  let listController: AbortController | null = null
  let caseController: AbortController | null = null
  let listGeneration = 0
  let caseGeneration = 0
  let active = true
  let attempt: { fingerprint: string; key: string } | null = null

  function statusLabel(status: string) {
    return status === 'pending'
      ? '待审核'
      : status === 'approved'
        ? '已通过'
        : status === 'rejected'
          ? '已驳回'
          : '暂不可操作'
  }
  function hideCard() {
    if (cardUrl.value) URL.revokeObjectURL(cardUrl.value)
    cardUrl.value = ''
  }
  function resetDecision() {
    editorOpen.value = false
    confirming.value = false
    reason.value = ''
    suggestion.value = ''
    decision.value = 'approved'
    attempt = null
  }
  function startProcessing() {
    if (!submitting.value && detail.value?.status === 'pending' && allowed()) {
      resetDecision()
      hideCard()
      editorOpen.value = true
    }
  }
  function cancelProcessing() {
    if (!submitting.value) resetDecision()
  }
  function closeProcessing(done: () => void) {
    if (submitting.value) return
    resetDecision()
    done()
  }
  function clearCase() {
    resetDecision()
    caseGeneration++
    caseController?.abort()
    caseController = null
    hideCard()
    detail.value = null
    selected.value = ''
    caseBusy.value = false
    cardBusy.value = false
    submitting.value = false
    confirming.value = false
    reason.value = ''
    suggestion.value = ''
    decision.value = 'approved'
    caseError.value = ''
    receipt.value = null
    attempt = null
  }
  function clearAll() {
    listGeneration++
    listController?.abort()
    listController = null
    items.value = []
    nextCursor.value = null
    currentCursor.value = null
    cursors.value = []
    listError.value = ''
    listBusy.value = false
    notice.value = ''
    clearCase()
  }
  function message(error: unknown) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) {
        clearAll()
        if (error.status === 401) admin.clear('会话已失效，请重新登录')
        else admin.forbidden++
        return '当前身份无权继续操作，请重新确认后台权限'
      }
      if (error.status === 404) return '案件不存在或已不可访问，请刷新列表'
      if (error.status === 409) return '案件版本或状态已变化，请重新核对后提交'
      if (error.status === 429) return '操作过于频繁，请稍后重试'
    }
    return '操作未完成，请重试；提交失败时请先核对案件最新状态'
  }
  async function loadList(cursor: string | null = currentCursor.value) {
    if (!allowed()) return clearAll()
    listController?.abort()
    const controller = new AbortController()
    listController = controller
    const generation = ++listGeneration
    listBusy.value = true
    listError.value = ''
    items.value = []
    nextCursor.value = null
    try {
      const result = await client.list(cursor, controller.signal)
      if (!active || controller.signal.aborted || generation !== listGeneration || !allowed())
        return
      items.value = result.items
      nextCursor.value = result.next_cursor
      currentCursor.value = cursor
    } catch (error) {
      if (!active || controller.signal.aborted || generation !== listGeneration) return
      listError.value = message(error)
    } finally {
      if (generation === listGeneration) listBusy.value = false
    }
  }
  async function refreshList() {
    clearCase()
    cursors.value = []
    currentCursor.value = null
    await loadList(null)
  }
  async function nextPage() {
    if (!nextCursor.value || listBusy.value) return
    cursors.value.push(currentCursor.value)
    clearCase()
    currentCursor.value = nextCursor.value
    await loadList()
  }
  async function previousPage() {
    if (!cursors.value.length || listBusy.value) return
    clearCase()
    currentCursor.value = cursors.value.pop() ?? null
    await loadList()
  }
  async function openCase(id: string) {
    clearCase()
    notice.value = ''
    if (!allowed()) return
    selected.value = id
    const controller = new AbortController()
    caseController = controller
    const generation = caseGeneration
    caseBusy.value = true
    try {
      const result = await client.detail(id, controller.signal)
      if (!active || controller.signal.aborted || generation !== caseGeneration || !allowed())
        return
      if (result.id !== id) throw new Error('案件响应不匹配')
      detail.value = result
    } catch (error) {
      if (!active || controller.signal.aborted || generation !== caseGeneration) return
      caseError.value = message(error)
    } finally {
      if (generation === caseGeneration) caseBusy.value = false
    }
  }
  async function showCard() {
    const current = detail.value
    const controller = caseController
    if (!current || !controller || cardBusy.value || !allowed()) return
    const generation = caseGeneration
    cardBusy.value = true
    caseError.value = ''
    hideCard()
    try {
      const image = await client.card(current.id, controller.signal)
      if (!active || controller.signal.aborted || generation !== caseGeneration || !allowed())
        return
      cardUrl.value = URL.createObjectURL(image)
    } catch (error) {
      if (!active || controller.signal.aborted || generation !== caseGeneration) return
      if (error instanceof ApiError && error.status === 409) {
        await reloadConflictedCase(current.id)
      } else {
        if (error instanceof ApiError && error.status === 404) clearCase()
        caseError.value = message(error)
      }
    } finally {
      if (generation === caseGeneration) cardBusy.value = false
    }
  }
  async function reloadConflictedCase(id: string) {
    const reloadedGeneration = caseGeneration + 1
    await openCase(id)
    if (active && caseGeneration === reloadedGeneration && selected.value === id && allowed())
      caseError.value = '案件版本或状态已变化，已重新读取；请重新核对，旧决定不会自动重试'
  }
  function cardFailed() {
    hideCard()
    caseError.value = '学生卡显示失败，请重新读取'
  }
  function confirmDecision() {
    if (editorOpen.value && valid.value && detail.value?.status === 'pending')
      confirming.value = true
  }
  async function submit() {
    const current = detail.value
    const controller = caseController
    if (
      !current ||
      !controller ||
      !editorOpen.value ||
      !valid.value ||
      !confirming.value ||
      submitting.value ||
      !allowed() ||
      current.status !== 'pending'
    )
      return
    const input: IdentityDecision =
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
    const generation = caseGeneration
    submitting.value = true
    caseError.value = ''
    try {
      const result = await client.decide(current.id, input, attempt.key, controller.signal)
      if (!active || controller.signal.aborted || generation !== caseGeneration || !allowed())
        return
      if (result.request_id !== current.id) throw new Error('案件回执不匹配')
      clearCase()
      receipt.value = result
      notice.value = `审核提交已确认：${statusLabel(result.status)}，版本 ${result.version}`
      await loadList()
    } catch (error) {
      if (!active || controller.signal.aborted || generation !== caseGeneration) return
      if (error instanceof ApiError && error.status === 409) {
        await reloadConflictedCase(current.id)
      } else {
        if (error instanceof ApiError && error.status === 404) clearCase()
        caseError.value = message(error)
      }
    } finally {
      if (generation === caseGeneration) submitting.value = false
    }
  }
  watch(
    () => [admin.session, admin.can('review_operator')],
    () => {
      if (!allowed()) clearAll()
    },
    { flush: 'sync' },
  )
  onMounted(() => {
    void loadList()
  })
  onBeforeUnmount(() => {
    active = false
    clearAll()
  })

  return {
    editorOpen,
    allowed,
    items,
    nextCursor,
    cursors,
    listBusy,
    listError,
    detail,
    selected,
    caseBusy,
    cardBusy,
    submitting,
    cardUrl,
    caseError,
    notice,
    receipt,
    decision,
    reason,
    suggestion,
    confirming,
    valid,
    statusLabel,
    hideCard,
    clearCase,
    loadList,
    refreshList,
    nextPage,
    previousPage,
    openCase,
    showCard,
    cardFailed,
    confirmDecision,
    submit,
    startProcessing,
    cancelProcessing,
    closeProcessing,
  }
}
