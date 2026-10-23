<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { createCrisisClient, validCrisisReason } from '@/services/crisis'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import type { CrisisSource, CrisisSummary } from '@/types/crisis'
const props = defineProps<{ source: CrisisSource; sourceId: string; version: number }>()
const emit = defineEmits<{
  escalated: [result: CrisisSummary]
  conflict: []
  busyChange: [busy: boolean]
}>()
const reason = ref('')
const confirming = ref(false)
const busy = ref(false)
watch(busy, (value) => emit('busyChange', value), { flush: 'sync' })
const error = ref('')
const result = ref<CrisisSummary | null>(null)
const stale = ref(false)
let attempt: { fingerprint: string; key: string } | null = null
const workspace = useAdminWorkspace(clear, 'crisis_operator')
const client = createCrisisClient(useAdminStore().session?.token ?? '', workspace.allowed)
const valid = computed(
  () =>
    validCrisisReason(reason.value.trim()) &&
    Number.isSafeInteger(props.version) &&
    props.version > 0 &&
    !stale.value,
)
function clear() {
  reason.value = ''
  confirming.value = false
  busy.value = false
  error.value = ''
  result.value = null
  stale.value = false
  attempt = null
}
watch(
  () => [props.source, props.sourceId, props.version],
  () => {
    workspace.cancel()
    clear()
  },
  { flush: 'sync' },
)
watch(
  reason,
  () => {
    confirming.value = false
  },
  { flush: 'sync' },
)
function confirm() {
  if (valid.value && !busy.value) confirming.value = true
}
async function submit() {
  if (!confirming.value || !valid.value || busy.value) return
  const input = { reason: reason.value.trim(), expected_version: props.version }
  const fingerprint = JSON.stringify([props.source, props.sourceId, input])
  if (attempt?.fingerprint !== fingerprint)
    attempt = { fingerprint, key: globalThis.crypto.randomUUID() }
  const key = attempt.key
  busy.value = true
  error.value = ''
  await workspace.run(
    (signal) => client.escalate(props.source, props.sourceId, input, key, signal),
    (value) => {
      clear()
      result.value = value
      emit('escalated', value)
    },
    (cause) => {
      if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) {
        reason.value = ''
        confirming.value = false
        stale.value = true
        attempt = null
        error.value = '来源案件版本或状态已变化，请重新读取来源案件后核对，不会自动升级'
        busy.value = false
        emit('conflict')
      } else error.value = reviewErrorMessage(cause)
    },
    () => {
      busy.value = false
    },
  )
}
</script>
<template>
  <section v-if="workspace.allowed()" class="workflow-box" aria-label="升级危机案件">
    <h3>判定危机并升级</h3>
    <p>仅使用当前来源案件及其精确内容，升级后由后端隔离；不在这里搜索其他私聊或录入学生身份。</p>
    <template v-if="result"
      ><p role="status">危机升级已确认：{{ result.id }}</p>
      <RouterLink :to="{ path: '/crisis', query: { case: result.id } }"
        >进入该危机案件</RouterLink
      ></template
    >
    <form v-else @submit.prevent="confirm">
      <fieldset :disabled="busy || confirming || stale">
        <legend>来源 {{ sourceId }} · 版本 {{ version }}</legend>
        <label :for="`crisis-escalation-${sourceId}`">判定理由（必填，最多 2000 个字符）</label
        ><textarea
          :id="`crisis-escalation-${sourceId}`"
          v-model="reason"
          rows="3"
          required
        ></textarea
        ><button :disabled="!valid" type="submit">核对危机升级</button>
      </fieldset>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <section v-if="confirming" aria-label="危机升级确认">
      <p>
        确认将 {{ sourceId }}（版本
        {{ version }}）升级为危机案件？后端将按当前案件权限与状态复核，并隔离对应内容。
      </p>
      <p>{{ reason.trim() }}</p>
      <button :disabled="busy" @click="submit">{{ busy ? '正在提交…' : '确认升级' }}</button
      ><button :disabled="busy" @click="confirming = false">返回修改</button>
    </section>
  </section>
</template>
