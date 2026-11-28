import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useRouter } from 'vue-router'
import type { CursorPage } from '@/types/moderation'
import type { CrisisSummary } from '@/types/crisis'
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '@/services/admin'
import { createUsersClient } from '@/services/users'
import { useUserNavigation } from '@/stores/userNavigation'
import { createSafetyClient } from '@/services/safety'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import { safetyRoles } from '@/types/safety'
import type {
  AppealDecisionInput,
  AppealDetail,
  AppealSummary,
  AppealContentKind,
  ContentKind,
  PenaltyInput,
  PenaltyLevel,
  ReportDecisionInput,
  ReportDetail,
  RestrictionAction,
  RestrictionInput,
  SafetySummary,
} from '@/types/safety'

export type SafetyMode = 'reports' | 'appeals'
type EditorTask = 'case' | 'penalty' | 'crisis'
type Operation =
  'confirmed' | 'dismissed' | 'penalty' | 'offline' | 'release-restriction' | 'uphold' | 'revoke'
type Confirmation =
  | { type: 'report'; id: string; input: ReportDecisionInput }
  | { type: 'appeal'; id: string; input: AppealDecisionInput }
  | { type: 'penalty'; id: string; input: PenaltyInput }
  | {
      type: 'restriction'
      id: string
      kind: ContentKind
      action: RestrictionAction
      input: RestrictionInput
    }
/** 路由分别持有查询与处理状态，离页清除正文、确认及回执。 */
export function useSafety(mode: SafetyMode, initialCase?: string, initialResolved = false) {
  const resolvedOnly = ref(initialResolved)
  const pageSize = ref(10)
  const currentPage = ref(1)
  const total = ref<number | null>(null)
  const editorOpen = ref(false)
  const editorTask = ref<EditorTask>('case')
  const escalating = ref(false)
  const items = ref<(SafetySummary | AppealSummary)[]>([])
  const cursor = ref<string | null>(null)
  const nextCursor = ref<string | null>(null)
  const history = ref<(string | null)[]>([])
  const busy = ref(false)
  const loading = ref(false)
  const writing = ref(false)
  const uncertain = ref(false)
  const listError = ref('')
  const error = ref('')
  const notice = ref('')
  const selected = ref('')
  const report = ref<ReportDetail | null>(null)
  const appeal = ref<AppealDetail | null>(null)
  const receipt = ref<SafetySummary | AppealSummary | null>(null)
  const operation = ref<Operation>('confirmed')
  const reason = ref('')
  const level = ref<PenaltyLevel>('minor')
  const accountVersion = ref('')
  const confirmation = ref<Confirmation | null>(null)
  let attempt: { fingerprint: string; key: string } | null = null
  let generation = 0
  let preparation = 0
  const router = useRouter()
  async function crisisEscalated(value: CrisisSummary) {
    close()
    try {
      await router.push({ path: '/crisis', query: { case: value.id } })
    } catch {
      error.value = '危机升级已确认，但页面跳转未完成，请进入危机工作台查看'
    }
  }
  const workspace = useAdminWorkspace(clearAll, safetyRoles)
  const client = createSafetyClient(
    useAdminStore().session?.token ?? '',
    workspace.allowed,
    fetch,
    () => pageSize.value,
  )
  const users = createUsersClient(useAdminStore().session?.token ?? '', workspace.allowed)
  const navigation = useUserNavigation()
  const target = navigation.target
  const detail = computed(() => report.value ?? appeal.value)
  const canPenalize = computed(() => report.value?.status === 'resolved')
  const operationLabels: Record<Operation, string> = {
    confirmed: '确认举报',
    dismissed: '驳回举报',
    penalty: '给予账号处罚',
    offline: '下线违规内容',
    'release-restriction': '解除普通内容限制',
    uphold: '维持处罚',
    revoke: '撤销本项处罚',
  }
  const levelLabels: Record<PenaltyLevel, string> = {
    minor: '轻微：警告并移除违规内容',
    general: '一般：禁言 7 天',
    severe: '严重：永久封禁',
  }
  const kindLabels: Record<AppealContentKind, string> = {
    whisper_post: '树洞帖子',
    whisper_comment: '树洞暖评',
    whisper_nickname: '树洞昵称',
    whisper_capsule: '私密胶囊',
    wish: '心愿',
    wish_comment: '心愿评论',
    application: '应愿留言',
    message: '私聊消息',
    story: '还愿故事',
  }
  const options = computed<Operation[]>(() => {
    if (editorTask.value === 'penalty') return canPenalize.value ? ['penalty'] : []
    if (appeal.value) return appeal.value.status === 'pending' ? ['uphold', 'revoke'] : []
    const current = report.value
    if (!current || !['pending', 'processing', 'resolved', 'rejected'].includes(current.status))
      return []
    const result: Operation[] = ['offline', 'release-restriction']
    if (current.status === 'pending' || current.status === 'processing')
      result.unshift('confirmed', 'dismissed')
    return result
  })
  function status(value: string) {
    const labels: Record<string, string> = {
      pending: '待处理',
      processing: '处理中',
      resolved: '举报已确认',
      rejected: '未予支持',
      accepted: '申诉已通过',
      active: '处罚生效中',
      revoked: '处罚已撤销',
      expired: '处罚已到期',
      restricted: '内容仍有限制',
      released: '内容限制已解除',
    }
    return labels[value] ?? '未知状态（仅供查看）'
  }
  const valid = computed(
    () => Boolean(reason.value.trim()) && options.value.includes(operation.value),
  )
  function resetProcessing() {
    uncertain.value = false
    preparation++
    editorOpen.value = false
    editorTask.value = 'case'
    reason.value = ''
    accountVersion.value = ''
    level.value = 'minor'
    confirmation.value = null
    attempt = null
  }
  function startProcessing(task: EditorTask = 'case') {
    if (uncertain.value) return
    if (
      !workspace.allowed() ||
      busy.value ||
      loading.value ||
      writing.value ||
      escalating.value ||
      !detail.value
    )
      return
    if (task === 'case' && !options.value.length) return
    if (task === 'penalty' && !canPenalize.value) return
    if (
      task === 'crisis' &&
      (mode !== 'reports' || !report.value || !useAdminStore().can('crisis_operator'))
    )
      return
    resetProcessing()
    editorTask.value = task
    operation.value = options.value[0] ?? 'confirmed'
    error.value = ''
    editorOpen.value = true
  }
  function closeProcessing(done: () => void) {
    if (uncertain.value) return
    if (writing.value || escalating.value) return
    resetProcessing()
    loading.value = false
    done()
  }
  function cancelProcessing() {
    if (uncertain.value) return
    if (writing.value || escalating.value) return
    resetProcessing()
    loading.value = false
  }
  function clearEditor() {
    resetProcessing()
    escalating.value = false
    generation++
    selected.value = ''
    report.value = null
    appeal.value = null
    loading.value = false
    writing.value = false
    error.value = ''
  }
  function clearAll() {
    clearEditor()
    items.value = []
    cursor.value = null
    nextCursor.value = null
    history.value = []
    currentPage.value = 1
    total.value = null
    busy.value = false
    listError.value = ''
    notice.value = ''
    receipt.value = null
  }
  async function loadList() {
    busy.value = true
    items.value = []
    nextCursor.value = null
    listError.value = ''
    await workspace.run<CursorPage<SafetySummary | AppealSummary>>(
      (signal) =>
        mode === 'reports'
          ? client.reports(cursor.value, signal, currentPage.value, resolvedOnly.value)
          : client.appeals(cursor.value, signal, currentPage.value),
      (result) => {
        items.value = result.items
        nextCursor.value = result.next_cursor
        currentPage.value = result.page ?? 1
        total.value = result.total ?? null
      },
      (cause) => {
        listError.value = reviewErrorMessage(cause)
      },
      () => {
        busy.value = false
      },
    )
  }
  async function refresh(reset = true) {
    if (busy.value || editorOpen.value || writing.value || escalating.value) return
    workspace.cancel()
    clearEditor()
    notice.value = ''
    receipt.value = null
    if (reset) {
      cursor.value = null
      history.value = []
      currentPage.value = 1
    }
    await loadList()
  }
  async function filterReports(resolved: boolean) {
    if (mode !== 'reports' || resolved === resolvedOnly.value) return
    if (busy.value || editorOpen.value || writing.value || escalating.value) return
    resolvedOnly.value = resolved
    await refresh()
  }
  async function changePage(target: number) {
    if (busy.value || editorOpen.value || writing.value || escalating.value) return
    currentPage.value = target
    await refresh(false)
  }
  async function resizePage(size: number) {
    pageSize.value = size
    await refresh()
  }
  async function page(next: boolean) {
    if (busy.value || editorOpen.value || writing.value || escalating.value) return
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
  async function open(id: string) {
    if (busy.value || editorOpen.value || writing.value || escalating.value) return
    await readDetail(id)
  }
  async function openPenaltyFromReceipt() {
    const current = receipt.value
    if (mode !== 'reports' || current?.status !== 'resolved' || busy.value || loading.value) return
    const expected = generation + 1
    await open(current.id)
    if (generation === expected && report.value?.id === current.id) startProcessing('penalty')
  }
  async function readDetail(id: string) {
    workspace.cancel()
    clearEditor()
    busy.value = false
    selected.value = id
    loading.value = true
    notice.value = ''
    receipt.value = null
    await workspace.run(
      async (signal) =>
        mode !== 'appeals'
          ? { type: 'report' as const, value: await client.report(id, signal) }
          : { type: 'appeal' as const, value: await client.appeal(id, signal) },
      (result) => {
        if (result.type === 'report') {
          if (target && result.value.subject_id !== target) {
            error.value = '案件作者与所选用户不一致，不能从此入口处置'
            return
          }
          report.value = result.value
        } else appeal.value = result.value
        operation.value = options.value[0] ?? 'confirmed'
      },
      (cause) => {
        error.value = reviewErrorMessage(cause)
      },
      () => {
        loading.value = false
      },
    )
  }
  async function reloadSelected() {
    const id = selected.value
    close()
    if (id) await open(id)
  }
  function close() {
    if (writing.value || escalating.value) return
    workspace.cancel()
    clearEditor()
  }
  async function prepareRestriction(
    current: ReportDetail,
    action: RestrictionAction,
    message: string,
  ) {
    const currentPreparation = ++preparation
    loading.value = true
    confirmation.value = null
    error.value = ''
    await workspace.run(
      async (signal) => {
        const control = await client.reportContentControl(current.id, signal)
        if (
          control.report_id !== current.id ||
          control.report_version !== current.version ||
          control.report_status !== current.status ||
          control.target_id !== current.target_id ||
          control.target_kind !== current.target_kind ||
          control.content_ref !== current.content_ref ||
          control.content_version !== current.content_version
        )
          throw new ApiError(409)
        return control
      },
      (control) => {
        if (
          currentPreparation !== preparation ||
          !editorOpen.value ||
          selected.value !== current.id ||
          operation.value !== action ||
          reason.value.trim() !== message
        )
          return
        confirmation.value = {
          type: 'restriction',
          id: control.target_id,
          kind: control.target_kind,
          action,
          input: {
            reason: message,
            expected_version: control.version,
            report_id: control.report_id,
            report_version: control.report_version,
          },
        }
      },
      async (cause) => {
        if (currentPreparation !== preparation) return
        if (cause instanceof ApiError && cause.status === 409) {
          const expected = generation + 1
          await readDetail(current.id)
          if (generation === expected && report.value?.id === current.id && workspace.allowed())
            error.value = '案件或关联内容已变化，已重新读取，请核对案件后再发起处置'
        } else if (cause instanceof ApiError && cause.status === 404) {
          clearEditor()
          error.value = reviewErrorMessage(cause)
        } else error.value = reviewErrorMessage(cause)
      },
      () => {
        if (currentPreparation === preparation) loading.value = false
      },
    )
  }
  async function prepare() {
    if (
      !editorOpen.value ||
      editorTask.value === 'crisis' ||
      !valid.value ||
      writing.value ||
      loading.value
    )
      return
    const message = reason.value.trim()
    const current = report.value
    if (current) {
      if (operation.value === 'confirmed' || operation.value === 'dismissed') {
        confirmation.value = {
          type: 'report',
          id: current.id,
          input: { decision: operation.value, reason: message, expected_version: current.version },
        }
      } else if (operation.value === 'penalty') {
        const selectedLevel = level.value
        const currentPreparation = ++preparation
        loading.value = true
        confirmation.value = null
        error.value = ''
        await workspace.run(
          async (signal) => {
            const fresh = await client.report(current.id, signal)
            if (
              fresh.status !== 'resolved' ||
              fresh.subject_id !== current.subject_id ||
              (target && fresh.subject_id !== target) ||
              fresh.content_ref !== current.content_ref ||
              fresh.content_version !== current.content_version ||
              fresh.version !== current.version
            )
              throw new ApiError(409)
            const user = await users.user(fresh.subject_id, signal)
            return { fresh, user }
          },
          ({ fresh, user }) => {
            if (
              currentPreparation !== preparation ||
              !editorOpen.value ||
              selected.value !== fresh.id ||
              operation.value !== 'penalty' ||
              reason.value.trim() !== message ||
              level.value !== selectedLevel
            )
              return
            report.value = fresh
            accountVersion.value = String(user.account_version)
            confirmation.value = {
              type: 'penalty',
              id: fresh.subject_id,
              input: {
                violation_ref: fresh.id,
                content_ref: fresh.content_ref,
                content_version: fresh.content_version,
                level: selectedLevel,
                reason: message,
                expected_version: user.account_version,
              },
            }
          },
          async (cause) => {
            if (currentPreparation !== preparation) return
            if (cause instanceof ApiError && cause.status === 409) {
              await readDetail(current.id)
              error.value = '案件已变化，已重新读取，请再次核对后处理'
            } else if (cause instanceof ApiError && cause.status === 404) {
              clearEditor()
              error.value = reviewErrorMessage(cause)
            } else error.value = reviewErrorMessage(cause)
          },
          () => {
            if (currentPreparation === preparation) loading.value = false
          },
        )
      } else if (operation.value === 'offline' || operation.value === 'release-restriction') {
        await prepareRestriction(current, operation.value, message)
      }
    } else if (appeal.value && (operation.value === 'uphold' || operation.value === 'revoke')) {
      confirmation.value = {
        type: 'appeal',
        id: appeal.value.id,
        input: {
          decision: operation.value,
          reason: message,
          expected_version: appeal.value.version,
        },
      }
    }
  }
  async function submit() {
    const current = confirmation.value
    if (
      !current ||
      !editorOpen.value ||
      editorTask.value === 'crisis' ||
      writing.value ||
      !workspace.allowed()
    )
      return
    const fingerprint = JSON.stringify(current)
    if (attempt?.fingerprint !== fingerprint)
      attempt = { fingerprint, key: globalThis.crypto.randomUUID() }
    const key = attempt.key
    const caseId = selected.value
    writing.value = true
    error.value = ''
    await workspace.run<SafetySummary | AppealSummary>(
      (signal) => {
        switch (current.type) {
          case 'report':
            return client.decideReport(current.id, current.input, key, signal)
          case 'appeal':
            return client.decideAppeal(current.id, current.input, key, signal)
          case 'penalty':
            return client.penalize(current.id, current.input, key, signal)
          case 'restriction':
            return client.restrict(
              current.kind,
              current.id,
              current.action,
              current.input,
              key,
              signal,
            )
        }
      },
      async (result) => {
        clearEditor()
        receipt.value = result
        notice.value =
          current.type === 'penalty'
            ? '处罚已受理，以服务端当前状态为准'
            : '处理已确认；解除处罚或普通内容限制不会自动恢复旧申请、匹配、内容公开或消息'
        await loadList()
      },
      async (cause) => {
        uncertain.value = !(
          cause instanceof ApiError &&
          cause.status < 500 &&
          ![408, 429].includes(cause.status)
        )
        if (cause instanceof ApiError && cause.status === 409) {
          const expected = generation + 1
          await readDetail(caseId)
          if (
            generation === expected &&
            current.type === 'penalty' &&
            canPenalize.value &&
            workspace.allowed()
          ) {
            await workspace.run(
              (signal) => users.user(current.id, signal),
              (user) => {
                accountVersion.value = String(user.account_version)
              },
              (cause) => {
                error.value = reviewErrorMessage(cause)
              },
              () => {},
            )
          }
          if (generation === expected && workspace.allowed()) {
            editorTask.value = current.type === 'penalty' ? 'penalty' : 'case'
            operation.value =
              current.type === 'restriction' && options.value.includes(current.action)
                ? current.action
                : (options.value[0] ?? 'confirmed')
            editorOpen.value = options.value.length > 0
            if (!editorOpen.value) editorTask.value = 'case'
            error.value =
              current.type === 'restriction'
                ? '内容对象版本或状态已变化，已重读案件；再次核对处理时会重新读取内容对象版本'
                : current.type === 'penalty'
                  ? '目标版本或状态已变化，已重读案件并清空版本与确认；请再次核对处理，系统将重新读取账号版本，不会自动重提'
                  : '案件版本或状态已变化，已重新读取；请重新核对，旧决定不会自动重提'
          }
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
  watch(
    [operation, reason, level, accountVersion],
    () => {
      confirmation.value = null
    },
    { flush: 'sync' },
  )
  const visibleItems = computed(() =>
    resolvedOnly.value ? items.value.filter((item) => item.status === 'resolved') : items.value,
  )
  onMounted(async () => {
    const expected = generation
    await loadList()
    if (generation === expected && initialCase && workspace.allowed()) await open(initialCase)
  })
  const canLeave = () => !writing.value && !escalating.value && !uncertain.value
  onBeforeRouteLeave(canLeave)
  onBeforeRouteUpdate(canLeave)

  return {
    uncertain,
    pageSize,
    currentPage,
    total,
    changePage,
    resizePage,
    editorOpen,
    editorTask,
    escalating,
    items: visibleItems,
    cursor,
    nextCursor,
    history,
    busy,
    loading,
    writing,
    listError,
    error,
    notice,
    selected,
    report,
    appeal,
    detail,
    receipt,
    canPenalize,
    operation,
    reason,
    level,
    accountVersion,
    confirmation,
    workspace,
    options,
    valid,
    operationLabels,
    levelLabels,
    kindLabels,
    status,
    refresh,
    resolvedOnly,
    filterReports,
    loadList,
    page,
    open,
    openPenaltyFromReceipt,
    close,
    reloadSelected,
    startProcessing,
    closeProcessing,
    cancelProcessing,
    prepare,
    submit,
    crisisEscalated,
  }
}
