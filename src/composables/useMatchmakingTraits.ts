import { computed, onMounted, reactive, ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { useTraitCommands } from '@/stores/matchmaking-traits'
import { useAdminWorkspace } from './useAdminWorkspace'
import { createTraitClient } from '@/services/matchmaking-traits'
import { MatchmakingError, matchmakingErrorMessage } from '@/services/matchmaking'
import { matchmakingRoles } from '@/types/matchmaking'
import type { Trait, TraitDetail, TraitFilters, TraitWord } from '@/types/matchmaking-traits'

export function useMatchmakingTraits() {
  const filters = reactive<TraitFilters>({
    q: '',
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
    if (locked.value) return
    page.value = 1
    applied = { ...filters }
    detail.value = null
    notice.value = ''
    await load()
  }
  async function turn(direction: number) {
    if (
      locked.value ||
      page.value + direction < 1 ||
      (direction > 0 && page.value * 20 >= total.value)
    )
      return
    page.value += direction
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
      (signal) => client.review(command, signal),
      async () => {
        commands.clear()
        detail.value = null
        reason.value = ''
        await load()
        if (workspace.allowed())
          notice.value = error.value
            ? '审核已提交，列表刷新失败，请重新查询核对。'
            : '审核已完成，统计已刷新。'
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
          error.value = matchmakingErrorMessage(cause)
        } else error.value = '审核结果尚未确认，原请求已保留，请原样重试。'
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
  onMounted(() => {
    if (!pending.value) void load()
  })
  return {
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
