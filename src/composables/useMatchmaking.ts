import { computed, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { useMatchmakingCommands } from '@/stores/matchmaking'
import { useAutoPairingCommands } from '@/stores/matchmaking-auto'
import { useAdminWorkspace } from './useAdminWorkspace'
import {
  createMatchmakingClient,
  MatchmakingError,
  matchmakingErrorMessage,
} from '@/services/matchmaking'
import { matchmakingRoles } from '@/types/matchmaking'
import type {
  Activity,
  ActivityInput,
  Candidate,
  CommandBody,
  Enrollment,
  LibraryTask,
  LibraryTaskInput,
  Pair,
  TaskTemplate,
  Workspace,
} from '@/types/matchmaking'

export const activityDateFields = [
  { key: 'registration_opens_at', label: '开始报名' },
  { key: 'registration_closes_at', label: '截止报名' },
  { key: 'results_at', label: '最早发布结果' },
  { key: 'starts_at', label: '首日任务开始' },
  { key: 'ends_at', label: '活动结束' },
] as const
const emptyForm = (): ActivityInput => ({
  expected_version: 0,
  title: '',
  description: '',
  days: 7,
  registration_opens_at: '',
  registration_closes_at: '',
  results_at: '',
  starts_at: '',
  ends_at: '',
})

/** 日期输入始终表示北京时间，避免运营电脑时区改变实际活动时刻。 */
export function beijingInput(value: string): string {
  const millis = Date.parse(value)
  return Number.isFinite(millis) ? new Date(millis + 8 * 3600000).toISOString().slice(0, 16) : ''
}
export function beijingISO(value: string): string {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/u.test(value)) throw new Error('请填写全部活动时间')
  const millis = Date.parse(`${value}:00+08:00`)
  if (!Number.isFinite(millis) || beijingInput(new Date(millis).toISOString()) !== value)
    throw new Error('活动日期无效，请重新选择')
  return new Date(millis).toISOString()
}

const libraryPath = '/admin/matchmaking/task-library'
const emptyLibraryTask = (): LibraryTaskInput => ({
  expected_version: 0,
  kind: 'online',
  body: '',
  min_day: 0,
  enabled: true,
})

export function useMatchmaking(libraryOnly = false) {
  const libraryOpen = ref(libraryOnly),
    choosingFirst = ref(false),
    libraryTasks = ref<LibraryTask[]>([]),
    libraryPage = ref(1),
    libraryTotal = ref(0),
    libraryEditID = ref(''),
    libraryForm = reactive(emptyLibraryTask())
  const activities = ref<Activity[]>([]),
    total = ref(0),
    listPage = ref(1),
    detailPage = ref(1)
  const selected = ref(''),
    detail = ref<Workspace | null>(null),
    candidates = ref<Candidate[]>([])
  const source = ref<Enrollment | null>(null),
    review = ref<Enrollment | null>(null),
    ending = ref<Pair | null>(null)
  const form = reactive(emptyForm()),
    templates = ref<TaskTemplate[]>([]),
    reason = ref('')
  const busy = ref(false),
    writing = ref(false)
  const commands = useMatchmakingCommands()
  const autoCommands = useAutoPairingCommands()
  const autoWriting = ref(false)
  const autoPending = computed(() => autoCommands.pending)
  const pending = computed(() => commands.pending)
  const pendingOnOtherPage = computed(() =>
    pending.value && pending.value.path.startsWith(libraryPath) !== libraryOnly
      ? libraryOnly
        ? '/matchmaking'
        : '/matchmaking/task-library'
      : '',
  )
  const error = ref(''),
    notice = ref(''),
    conflict = ref(false)
  const tab = ref<'activity' | 'enrollments' | 'pairs' | 'tasks'>('activity')
  const workspace = useAdminWorkspace(clear, matchmakingRoles)
  const client = createMatchmakingClient(useAdminStore().session?.token ?? '', workspace.allowed)
  const locked = computed(
    () =>
      busy.value || writing.value || !!pending.value || autoWriting.value || !!autoPending.value,
  )
  const canNext = computed(
    () => detailPage.value * 20 < Math.max(detail.value?.total ?? 0, detail.value?.pair_total ?? 0),
  )
  const canReview = computed(
    () => detail.value?.activity.status === 'published' && detail.value.activity.phase !== 'ended',
  )
  const canPair = computed(
    () => canReview.value && ['matching', 'active'].includes(detail.value?.activity.phase ?? ''),
  )
  const canEditTemplates = computed(
    () =>
      !!detail.value &&
      !detail.value.templates_locked &&
      detail.value.activity.status !== 'cancelled' &&
      detail.value.activity.phase !== 'ended',
  )

  function clearDetail() {
    detail.value = null
    selected.value = ''
    candidates.value = []
    source.value = null
    review.value = null
    ending.value = null
    templates.value = []
    reason.value = ''
    Object.assign(form, emptyForm())
  }
  function clear() {
    clearDetail()
    libraryOpen.value = libraryOnly
    choosingFirst.value = false
    libraryTasks.value = []
    libraryTotal.value = 0
    libraryEditID.value = ''
    Object.assign(libraryForm, emptyLibraryTask())
    activities.value = []
    total.value = 0
    busy.value = false
    writing.value = false
    error.value = ''
    notice.value = ''
  }
  function accept(value: Workspace) {
    detail.value = value
    Object.assign(form, {
      expected_version: value.activity.version,
      title: value.activity.title,
      description: value.activity.description,
      days: value.activity.days,
    })
    for (const field of activityDateFields)
      form[field.key] = beijingInput(value.activity[field.key])
    templates.value = value.templates.map((item) => ({ ...item }))
    candidates.value = []
    source.value = null
    review.value = null
    ending.value = null
    reason.value = ''
    conflict.value = false
  }
  async function loadActivities() {
    busy.value = true
    error.value = ''
    await workspace.run(
      (signal) => client.activities(listPage.value, signal),
      (value) => {
        activities.value = value.items
        total.value = value.total
      },
      (cause) => {
        error.value = matchmakingErrorMessage(cause)
      },
      () => {
        busy.value = false
      },
    )
  }
  async function loadDetail() {
    const id = selected.value
    if (!id || id === 'new') return
    busy.value = true
    error.value = ''
    await workspace.run(
      (signal) => client.workspace(id, detailPage.value, signal),
      accept,
      (cause) => {
        error.value = matchmakingErrorMessage(cause)
        detail.value = null
      },
      () => {
        busy.value = false
      },
    )
  }
  async function loadLibrary() {
    busy.value = true
    error.value = ''
    await workspace.run(
      (signal) => client.library(libraryPage.value, signal),
      (value) => {
        libraryTasks.value = value.items
        libraryTotal.value = value.total
        conflict.value = false
      },
      (cause) => {
        error.value = matchmakingErrorMessage(cause)
      },
      () => {
        busy.value = false
      },
    )
  }
  async function showFirstTaskPicker() {
    if (locked.value) return
    choosingFirst.value = true
    libraryOpen.value = true
    libraryPage.value = 1
    editLibraryTask()
    await loadLibrary()
  }
  async function libraryTurn(direction: number) {
    if (locked.value || libraryPage.value + direction < 1) return
    if (direction > 0 && libraryPage.value * 20 >= libraryTotal.value) return
    libraryPage.value += direction
    await loadLibrary()
  }
  async function hideLibrary() {
    if (locked.value) return
    libraryOpen.value = false
    choosingFirst.value = false
    conflict.value = false
    await loadDetail()
  }
  function editLibraryTask(item?: LibraryTask) {
    if (locked.value) return
    libraryEditID.value = item?.id ?? ''
    Object.assign(
      libraryForm,
      item
        ? {
            expected_version: item.version,
            kind: item.kind,
            body: item.body,
            min_day: item.min_day,
            enabled: item.enabled,
          }
        : emptyLibraryTask(),
    )
  }
  async function saveLibraryTask() {
    if (locked.value || conflict.value) return
    if (
      !libraryForm.body.trim() ||
      [...libraryForm.body].length > 1000 ||
      !Number.isInteger(libraryForm.min_day) ||
      libraryForm.min_day < 0 ||
      libraryForm.min_day > 30
    ) {
      error.value = '请填写任务正文并设置 0–30 的最早可分配日。'
      return
    }
    const id = libraryEditID.value
    if (
      commands.save({
        path: id ? `${libraryPath}/${id}` : libraryPath,
        method: id ? 'PUT' : 'POST',
        body: { ...libraryForm },
        key: crypto.randomUUID(),
        title: '保存任务库条目',
        activityID: '',
      })
    )
      await runPending()
  }
  async function chooseFirstTask(item: LibraryTask) {
    const activity = detail.value?.activity
    if (
      !choosingFirst.value ||
      !activity ||
      !canEditTemplates.value ||
      !item.enabled ||
      item.min_day > 1
    )
      return
    await submit(
      '/task-plan',
      'PUT',
      { expected_version: activity.version, first_task_id: item.id },
      '设置首日任务',
    )
  }
  async function autoApplied() {
    await loadDetail()
    if (workspace.allowed()) await loadActivities()
  }
  async function refresh() {
    if (locked.value) return
    if (libraryOpen.value) {
      if (choosingFirst.value) {
        await loadDetail()
        if (error.value || !workspace.allowed()) return
      }
      await loadLibrary()
      return
    }
    await loadActivities()
    if (workspace.allowed() && selected.value && selected.value !== 'new') await loadDetail()
  }
  async function open(id: string) {
    if (locked.value || selected.value === id) return
    libraryOpen.value = false
    choosingFirst.value = false
    clearDetail()
    selected.value = id
    detailPage.value = 1
    tab.value = 'activity'
    await loadDetail()
  }
  function create() {
    if (locked.value) return
    clearDetail()
    libraryOpen.value = false
    choosingFirst.value = false
    selected.value = 'new'
    tab.value = 'activity'
    conflict.value = false
    error.value = ''
  }
  async function listTurn(direction: number) {
    if (locked.value) return
    const next = listPage.value + direction
    if (next < 1 || (direction > 0 && listPage.value * 20 >= total.value)) return
    listPage.value = next
    await loadActivities()
  }
  async function detailTurn(direction: number) {
    if (
      locked.value ||
      (direction < 0 && detailPage.value <= 1) ||
      (direction > 0 && !canNext.value)
    )
      return
    detailPage.value += direction
    await loadDetail()
  }
  async function runPending() {
    const command = pending.value
    if (!command || pendingOnOtherPage.value || writing.value || busy.value) return
    writing.value = true
    error.value = ''
    notice.value = ''
    await workspace.run(
      (signal) => client.execute(command, signal),
      async (receipt) => {
        commands.clear()
        if (command.path.startsWith(libraryPath)) {
          libraryEditID.value = ''
          Object.assign(libraryForm, emptyLibraryTask())
          await loadLibrary()
          if (!workspace.allowed()) return
          notice.value = error.value ? '任务已保存，刷新失败，请重新读取核对。' : '任务已保存。'
          return
        }
        if (command.path.endsWith('/task-plan')) {
          libraryOpen.value = false
          choosingFirst.value = false
          tab.value = 'tasks'
        }
        selected.value = command.activityID || receipt.id
        await loadDetail()
        const detailFailed = !!error.value
        if (!workspace.allowed()) return
        await loadActivities()
        if (!workspace.allowed()) return
        notice.value =
          detailFailed || error.value
            ? `${command.title}已成功，刷新失败，请重新读取核对，无需重复提交。`
            : `${command.title}已成功，当前状态已刷新。`
      },
      (cause) => {
        error.value = matchmakingErrorMessage(cause)
        if (
          cause instanceof MatchmakingError &&
          cause.status < 500 &&
          cause.status !== 408 &&
          cause.status !== 429
        ) {
          commands.clear()
          conflict.value = cause.status === 409
        } else {
          error.value = '操作结果尚未确认，已保留原请求，请原样重试。'
        }
      },
      () => {
        writing.value = false
      },
    )
  }
  async function submit(suffix: string, method: 'POST' | 'PUT', body: CommandBody, title: string) {
    if (locked.value || conflict.value) return
    const id = selected.value === 'new' ? '' : selected.value
    if (
      !commands.save({
        path: `/admin/matchmaking/activities${id ? `/${id}` : ''}${suffix}`,
        method,
        body,
        key: crypto.randomUUID(),
        title,
        activityID: id,
      })
    )
      return
    await runPending()
  }
  async function saveActivity() {
    if (selected.value !== 'new' && detail.value?.activity.status !== 'draft') return
    try {
      if (
        !form.title.trim() ||
        [...form.title].length > 80 ||
        !form.description.trim() ||
        [...form.description].length > 2000 ||
        !Number.isInteger(form.days) ||
        form.days < 1 ||
        form.days > 30
      )
        throw new Error('请填写名称、说明和 1–30 天的活动天数。')
      const input: ActivityInput = {
        expected_version: detail.value?.activity.version ?? 0,
        title: form.title,
        description: form.description,
        days: form.days,
        registration_opens_at: '',
        registration_closes_at: '',
        results_at: '',
        starts_at: '',
        ends_at: '',
      }
      for (const field of activityDateFields) input[field.key] = beijingISO(form[field.key])
      const times = activityDateFields.map((field) => Date.parse(input[field.key]))
      if (
        times.some((value, index) => index > 0 && value < (times[index - 1] ?? value)) ||
        input.registration_opens_at === input.registration_closes_at ||
        input.starts_at === input.ends_at
      )
        throw new Error('请按报名开始、截止、结果发布、任务开始、活动结束的顺序设置时间。')
      const firstDay = Date.parse(`${beijingInput(input.starts_at).slice(0, 10)}T00:00:00+08:00`)
      const lastUnlock =
        input.days === 1 ? Date.parse(input.starts_at) : firstDay + (input.days - 1) * 86400000
      if (lastUnlock >= Date.parse(input.ends_at))
        throw new Error('活动结束时间必须晚于最后一天任务的解锁时间（北京时间零点）。')
      await submit('', selected.value === 'new' ? 'POST' : 'PUT', input, '保存活动')
    } catch (cause) {
      error.value = matchmakingErrorMessage(cause)
    }
  }
  async function activityAction(action: 'publish' | 'cancel' | 'results/publish') {
    const activity = detail.value?.activity
    if (!activity) return
    if (
      (action === 'publish' && activity.status !== 'draft') ||
      (action === 'cancel' && activity.status === 'cancelled') ||
      (action === 'results/publish' && !canPair.value)
    )
      return
    const titles = { publish: '发布活动', cancel: '取消活动', 'results/publish': '发布配对结果' }
    if (action === 'cancel' && !reason.value.trim()) {
      error.value = '请填写取消原因。'
      return
    }
    const prompts = {
      publish: '发布后活动时间与说明将冻结。确认发布？',
      cancel: '取消将撤销所有参与者对活动配对资料和任务的访问。确认取消？',
      'results/publish': '将发布本活动全部待发布配对，并固定每日任务。确认发布？',
    }
    if (action === 'results/publish') {
      const plan = detail.value?.task_plan
      if (!plan && !detail.value?.templates.length) {
        error.value = '请先在每日任务中设置固定首日任务。'
        return
      }
      if (plan?.missing_day) {
        error.value = `任务库第 ${plan.missing_day} 天无法分配，请检查首日任务和最早可分配日。`
        return
      }
    }
    if (!window.confirm(prompts[action])) return
    await submit(
      `/${action}`,
      'POST',
      { expected_version: activity.version, reason: reason.value.trim() },
      titles[action],
    )
  }
  function inspect(enrollment: Enrollment) {
    if (locked.value) return
    review.value = enrollment
    reason.value = ''
    source.value = null
    candidates.value = []
  }
  async function decide(decision: 'approved' | 'rejected') {
    const row = review.value
    if (!row || !canReview.value || row.status !== 'pending') return
    if (decision === 'rejected' && !reason.value.trim()) {
      error.value = '请填写驳回原因。'
      return
    }
    await submit(
      `/enrollments/${row.id}/review`,
      'POST',
      { expected_version: row.version, decision, reason: reason.value.trim() },
      decision === 'approved' ? '通过报名' : '驳回报名',
    )
  }
  async function recommend(row: Enrollment) {
    if (locked.value || !canPair.value || row.status !== 'approved' || !row.eligible) return
    busy.value = true
    candidates.value = []
    source.value = row
    review.value = null
    error.value = ''
    await workspace.run(
      (signal) => client.candidates(selected.value, row.id, signal),
      (value) => {
        candidates.value = value
      },
      (cause) => {
        error.value = matchmakingErrorMessage(cause)
      },
      () => {
        busy.value = false
      },
    )
  }
  async function pair(candidate: Candidate) {
    const first = source.value,
      activity = detail.value?.activity
    if (!first || !activity || !canPair.value || !candidate.enrollment.eligible) return
    if (
      !window.confirm(
        `为 ${first.profile?.name ?? '所选报名者'} 与 ${candidate.enrollment.profile?.name ?? '候选人'} 建立待发布配对？`,
      )
    )
      return
    await submit(
      '/pairs',
      'POST',
      { expected_version: activity.version, first: first.id, second: candidate.enrollment.id },
      '建立配对',
    )
  }
  function prepareEnd(row: Pair) {
    if (locked.value) return
    ending.value = row
    reason.value = ''
  }
  async function endPair() {
    const row = ending.value
    if (!row) return
    if (!reason.value.trim()) {
      error.value = '请填写解除原因。'
      return
    }
    await submit(
      `/pairs/${row.id}/end`,
      'POST',
      { expected_version: row.version, reason: reason.value.trim() },
      '解除配对',
    )
  }
  function addTemplate() {
    if (!locked.value && canEditTemplates.value && templates.value.length < 30)
      templates.value.push({ kind: 'online', body: '', fixed_day: 0 })
  }
  async function saveTemplates() {
    const activity = detail.value?.activity
    if (!activity || !canEditTemplates.value) return
    const seen = new Set<number>()
    for (const row of templates.value) {
      if (
        !row.body.trim() ||
        [...row.body].length > 1000 ||
        !Number.isInteger(row.fixed_day) ||
        row.fixed_day < 0 ||
        row.fixed_day > activity.days
      ) {
        error.value = '请填写任务正文，并设置有效的固定天数。'
        return
      }
      if (row.fixed_day > 0 && seen.has(row.fixed_day)) {
        error.value = '同一天只能设置一项固定任务。'
        return
      }
      if (row.fixed_day > 0) seen.add(row.fixed_day)
    }
    await submit(
      '/templates',
      'PUT',
      { expected_version: activity.version, items: templates.value.map((row) => ({ ...row })) },
      '保存任务模板',
    )
  }
  onBeforeRouteLeave(
    () =>
      !writing.value &&
      !autoWriting.value &&
      (!pending.value ||
        window.confirm(
          '操作结果尚未确认。原请求将保留在当前会话内存，返回后可原样重试。确认离开？',
        )),
  )
  onMounted(async () => {
    if (libraryOnly) {
      const command = pending.value
      if (command && !pendingOnOtherPage.value && 'min_day' in command.body) {
        libraryEditID.value =
          command.method === 'PUT' ? command.path.slice(libraryPath.length + 1) : ''
        Object.assign(libraryForm, command.body)
      }
      await loadLibrary()
      return
    }
    await loadActivities()
    if (workspace.allowed() && autoPending.value) {
      selected.value = autoPending.value.activityID
      tab.value = 'pairs'
      await loadDetail()
      return
    }
    if (!workspace.allowed() || !pending.value || pendingOnOtherPage.value) return
    const command = pending.value
    selected.value = command.activityID || 'new'
    if (command.activityID) await loadDetail()
    if (!workspace.allowed() || pending.value !== command) return
    if ('title' in command.body) {
      Object.assign(form, command.body)
      for (const field of activityDateFields)
        form[field.key] = beijingInput(command.body[field.key])
    }
  })
  return {
    autoWriting,
    autoPending,
    autoApplied,
    activities,
    total,
    listPage,
    detailPage,
    selected,
    detail,
    candidates,
    source,
    review,
    ending,
    form,
    templates,
    reason,
    busy,
    writing,
    pending,
    error,
    notice,
    conflict,
    tab,
    workspace,
    locked,
    canNext,
    canReview,
    canPair,
    canEditTemplates,
    refresh,
    open,
    create,
    listTurn,
    detailTurn,
    runPending,
    saveActivity,
    activityAction,
    inspect,
    decide,
    recommend,
    pair,
    prepareEnd,
    endPair,
    libraryOpen,
    choosingFirst,
    libraryTasks,
    libraryPage,
    libraryTotal,
    libraryEditID,
    libraryForm,
    showFirstTaskPicker,
    pendingOnOtherPage,
    hideLibrary,
    libraryTurn,
    editLibraryTask,
    saveLibraryTask,
    chooseFirstTask,
    addTemplate,
    saveTemplates,
  }
}
