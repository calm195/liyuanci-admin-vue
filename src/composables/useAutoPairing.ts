import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAdminWorkspace } from './useAdminWorkspace'
import { useAdminStore } from '@/stores/admin'
import { useAutoPairingCommands } from '@/stores/matchmaking-auto'
import { createAutoPairingClient } from '@/services/matchmaking-auto'
import { MatchmakingError, matchmakingErrorMessage } from '@/services/matchmaking'
import { matchmakingRoles } from '@/types/matchmaking'
import type { AutoPairingJob } from '@/types/matchmaking-auto'

/** 每个活动单独持有预览；轮询只读，应用仍由运营确认并绑定快照版本。 */
export function useAutoPairing(
  activityID: () => string,
  activityVersion: () => number,
  disabled: () => boolean,
  applied: () => void,
) {
  const job = ref<AutoPairingJob | null>(null),
    reading = ref(false),
    writing = ref(false)
  const error = ref(''),
    notice = ref(''),
    confirming = ref(false),
    expired = ref(false)
  const commands = useAutoPairingCommands()
  const pending = computed(() => commands.pending)
  let timer: ReturnType<typeof setTimeout> | undefined
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  const workspace = useAdminWorkspace(clear, matchmakingRoles)
  const client = createAutoPairingClient(useAdminStore().session?.token ?? '', workspace.allowed)
  const running = computed(() => job.value?.status === 'pending' || job.value?.status === 'running')
  const stale = computed(
    () =>
      job.value?.status === 'stale' ||
      (!!job.value &&
        job.value.status !== 'applied' &&
        job.value.activity_version !== activityVersion()),
  )
  const canApply = computed(
    () =>
      job.value?.status === 'ready' &&
      !expired.value &&
      !stale.value &&
      !reading.value &&
      !writing.value &&
      !pending.value &&
      !disabled(),
  )
  const canGenerate = computed(
    () => !running.value && !reading.value && !writing.value && !pending.value && !disabled(),
  )
  function stop() {
    if (timer !== undefined) clearTimeout(timer)
    if (expiryTimer !== undefined) clearTimeout(expiryTimer)
    timer = undefined
    expiryTimer = undefined
  }
  function clear() {
    stop()
    job.value = null
    reading.value = false
    writing.value = false
    error.value = ''
    notice.value = ''
    confirming.value = false
  }
  function accept(value: AutoPairingJob) {
    const previous = job.value?.status
    job.value = value
    const remaining = Date.parse(value.expires_at) - Date.now()
    expired.value = remaining <= 0
    if (expiryTimer !== undefined) clearTimeout(expiryTimer)
    if (remaining > 0)
      expiryTimer = setTimeout(
        () => {
          expired.value = true
          confirming.value = false
        },
        Math.min(remaining + 1, 2147483647),
      )
    if ((previous === 'pending' || previous === 'running') && value.status === 'ready')
      notice.value = '全员分配预览已生成，请核对后确认应用。'
    if (value.status === 'failed')
      error.value = value.error || '自动分配失败，请重新生成或稍后重试。'
    schedule()
  }
  function schedule() {
    if (timer !== undefined) clearTimeout(timer)
    if (!workspace.allowed() || !running.value || pending.value) return
    timer = setTimeout(() => {
      if (writing.value || reading.value) schedule()
      else void read(false)
    }, 1500)
  }
  async function read(latest: boolean) {
    if (!workspace.allowed() || reading.value || writing.value) return
    reading.value = true
    error.value = ''
    const current = job.value
    await workspace.run(
      (signal) =>
        latest || !current
          ? client.latest(activityID(), signal)
          : client.job(activityID(), current.id, signal),
      accept,
      (cause) => {
        if (latest && cause instanceof MatchmakingError && cause.status === 404) {
          job.value = null
          return
        }
        error.value = matchmakingErrorMessage(cause)
      },
      () => {
        reading.value = false
        // 暂时断网不终止后台任务轮询；离页和会话失效仍由工作区阻止。
        schedule()
      },
    )
  }
  async function refresh() {
    await read(true)
  }
  async function retry() {
    const command = pending.value
    if (!command || command.activityID !== activityID() || writing.value) return
    stop()
    workspace.cancel()
    reading.value = false
    writing.value = true
    confirming.value = false
    error.value = ''
    notice.value = ''
    await workspace.run(
      (signal) => client.execute(command, signal),
      async (receipt) => {
        commands.clear()
        await workspace.run(
          (signal) => client.job(activityID(), receipt.id, signal),
          accept,
          (cause) => {
            error.value = `操作已成功，但预览刷新失败：${matchmakingErrorMessage(cause)}`
          },
          () => {},
        )
        if (!workspace.allowed()) return
        if (command.kind === 'apply') {
          notice.value = '分配已应用为待发布配对，可继续人工调整并按原流程发布。'
          applied()
        } else notice.value = '自动分配任务已提交，正在读取后台进度。'
      },
      (cause) => {
        if (
          cause instanceof MatchmakingError &&
          cause.status < 500 &&
          cause.status !== 408 &&
          cause.status !== 429
        ) {
          commands.clear()
          error.value =
            cause.status === 409
              ? '活动、资料或配对状态已变化，请刷新活动并重新生成预览。'
              : matchmakingErrorMessage(cause)
          if (cause.status === 409 && job.value) job.value = { ...job.value, status: 'stale' }
        } else error.value = '操作结果尚未确认，已保留原请求，请原样重试。'
      },
      () => {
        writing.value = false
        schedule()
      },
    )
  }
  async function generate() {
    if (!canGenerate.value) return
    confirming.value = false
    if (
      commands.save({
        kind: 'generate',
        activityID: activityID(),
        key: crypto.randomUUID(),
        body: { expected_version: activityVersion() },
      })
    )
      await retry()
  }
  async function apply() {
    const value = job.value
    if (!value || !canApply.value || !confirming.value) return
    if (
      commands.save({
        kind: 'apply',
        activityID: activityID(),
        jobID: value.id,
        key: crypto.randomUUID(),
        body: { expected_version: value.version, activity_version: value.activity_version },
      })
    )
      await retry()
  }
  watch(
    () => activityVersion(),
    () => {
      confirming.value = false
    },
  )
  onMounted(() => {
    void refresh()
  })
  onBeforeUnmount(stop)
  return {
    job,
    reading,
    writing,
    error,
    notice,
    confirming,
    expired,
    pending,
    running,
    stale,
    canApply,
    canGenerate,
    refresh,
    retry,
    generate,
    apply,
  }
}
