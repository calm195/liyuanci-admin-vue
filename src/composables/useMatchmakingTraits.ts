import { computed, onMounted, reactive, ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { useTraitCommands } from '@/stores/matchmaking-traits'
import { useAdminWorkspace } from './useAdminWorkspace'
import { createTraitClient } from '@/services/matchmaking-traits'
import { MatchmakingError, matchmakingErrorMessage } from '@/services/matchmaking'
import { matchmakingRoles } from '@/types/matchmaking'
import type {
  Trait,
  TraitCategory,
  TraitDetail,
  TraitFilters,
  TraitWord,
} from '@/types/matchmaking-traits'

export function useMatchmakingTraits() {
  const filters = reactive<TraitFilters>({
    q: '',
    category: '',
    enabled: '',
    purpose: 'all',
    gender: '',
    status: 'approved',
    min_heat: '',
    max_heat: '',
    sort: 'heat_desc',
  })
  let applied: TraitFilters = { ...filters }
  const rows = ref<Trait[]>([]),
    cloud = ref<TraitWord[]>([]),
    total = ref(0),
    cloudTotal = ref(0),
    page = ref(1)
  const mode = ref<'list' | 'cloud'>('list'),
    detail = ref<TraitDetail | null>(null),
    reason = ref('')
  const editorOpen = ref(false)
  const management = reactive<{
    name: string
    category: TraitCategory
    enabled: boolean
    reason: string
  }>({ name: '', category: 'personality', enabled: true, reason: '' })
  const busy = ref(false),
    writing = ref(false),
    error = ref(''),
    notice = ref('')
  const commands = useTraitCommands()
  const pending = computed(() => commands.pending)
  const workspace = useAdminWorkspace(clear, matchmakingRoles)
  const client = createTraitClient(useAdminStore().session?.token ?? '', workspace.allowed)
  const locked = computed(() => busy.value || writing.value || !!pending.value)
  function clear() {
    rows.value = []
    cloud.value = []
    detail.value = null
    editorOpen.value = false
    total.value = 0
    cloudTotal.value = 0
    busy.value = false
    writing.value = false
    reason.value = ''
    error.value = ''
    notice.value = ''
  }
  async function load() {
    busy.value = true
    error.value = ''
    // 列表和词云共用已应用的筛选快照，编辑筛选表单不会悄悄改变翻页口径。
    const query = { ...applied }
    await workspace.run(
      async (signal) => {
        const results = await Promise.allSettled([
          client.list(query, page.value, signal),
          client.cloud(query, signal),
        ])
        const [listResult, cloudResult] = results
        if (listResult.status === 'rejected') throw listResult.reason
        if (cloudResult.status === 'rejected') throw cloudResult.reason
        return { list: listResult.value, cloud: cloudResult.value }
      },
      (result) => {
        rows.value = result.list.items
        total.value = result.list.total
        cloud.value = result.cloud.items
        cloudTotal.value = result.cloud.total
      },
      (cause) => {
        rows.value = []
        cloud.value = []
        total.value = 0
        cloudTotal.value = 0
        error.value = matchmakingErrorMessage(cause)
      },
      () => {
        busy.value = false
      },
    )
  }
  async function search() {
    if (writing.value || pending.value || editorOpen.value) return
    workspace.cancel()
    page.value = 1
    applied = { ...filters }
    detail.value = null
    notice.value = ''
    await load()
  }
  async function turn(target: number) {
    if (locked.value || target < 1 || target > Math.ceil(total.value / 20)) return
    page.value = target
    await load()
  }
  async function inspect(id: string) {
    if (locked.value) return
    detail.value = null
    reason.value = ''
    busy.value = true
    error.value = ''
    await workspace.run(
      (signal) => client.detail(id, signal),
      (result) => {
        detail.value = result
      },
      (cause) => {
        error.value = matchmakingErrorMessage(cause)
      },
      () => {
        busy.value = false
      },
    )
  }
  async function retry() {
    const command = pending.value
    if (!command || busy.value || writing.value) return
    writing.value = true
    error.value = ''
    notice.value = ''
    await workspace.run(
      (signal) => client.execute(command, signal),
      async () => {
        commands.clear()
        detail.value = null
        editorOpen.value = false
        reason.value = ''
        await load()
        if (workspace.allowed())
          notice.value = error.value
            ? '操作已完成，列表刷新失败，请重新查询核对。'
            : '操作已完成，词条与统计已刷新。'
      },
      (cause) => {
        if (
          cause instanceof MatchmakingError &&
          cause.status < 500 &&
          cause.status !== 408 &&
          cause.status !== 429
        ) {
          commands.clear()
          detail.value = null
          editorOpen.value = false
          error.value = matchmakingErrorMessage(cause)
        } else error.value = '操作结果尚未确认，原请求已保留，请原样重试。'
      },
      () => {
        writing.value = false
      },
    )
  }
  async function decide(decision: 'approved' | 'rejected') {
    if (locked.value || detail.value?.status !== 'pending') return
    const message = reason.value.trim()
    if ((decision === 'rejected' && !message) || [...message].length > 500) {
      error.value = '驳回时请填写原因，审核说明最多 500 字。'
      return
    }
    if (
      commands.save({
        id: detail.value.id,
        key: crypto.randomUUID(),
        body: { expected_version: detail.value.version, decision, reason: message },
      })
    )
      await retry()
  }
  function create() {
    if (locked.value) return
    detail.value = null
    Object.assign(management, { name: '', category: 'personality', enabled: true, reason: '' })
    editorOpen.value = true
    error.value = ''
  }
  function edit() {
    if (locked.value || !detail.value) return
    Object.assign(management, {
      name: detail.value.name,
      category: detail.value.category ?? 'uncategorized',
      enabled: detail.value.enabled ?? true,
      reason: '',
    })
    editorOpen.value = true
    error.value = ''
  }
  function close() {
    if (busy.value || writing.value) return
    editorOpen.value = false
    detail.value = null
  }
  async function save() {
    if (locked.value) return
    const message = management.reason.trim()
    const name = management.name.trim()
    if (!message || [...message].length > 500 || !name || [...name].length > 20) {
      error.value = '请填写1～20字的词条及不超过500字的维护理由。'
      return
    }
    const current = detail.value
    const command = current
      ? {
          action: 'update' as const,
          id: current.id,
          key: crypto.randomUUID(),
          body: {
            expected_version: current.version,
            category: management.category,
            enabled: management.enabled,
            reason: message,
          },
        }
      : {
          action: 'create' as const,
          key: crypto.randomUUID(),
          body: { name, category: management.category, reason: message },
        }
    if (commands.save(command)) await retry()
  }
  onMounted(() => {
    if (!pending.value) void load()
  })
  return {
    editorOpen,
    management,
    create,
    edit,
    close,
    save,
    filters,
    rows,
    cloud,
    total,
    cloudTotal,
    page,
    mode,
    detail,
    reason,
    busy,
    writing,
    error,
    notice,
    pending,
    workspace,
    locked,
    search,
    turn,
    inspect,
    retry,
    decide,
  }
}
