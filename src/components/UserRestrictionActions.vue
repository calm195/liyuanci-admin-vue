<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { useAdminWorkspace, reviewErrorMessage } from '@/composables/useAdminWorkspace'
import { createUsersClient } from '@/services/users'
import { ApiError } from '@/services/admin'
import type { UserRestrictionAction, UserRestrictionState } from '@/types/users'
const props = defineProps<{ userId: string }>()
const emit = defineEmits<{ changed: []; missing: [] }>()
const target = props.userId
const state = ref<UserRestrictionState | null>(null)
const action = ref<UserRestrictionAction | null>(null)
const reason = ref('')
const busy = ref(false)
const error = ref('')
const confirmation = ref<{
  action: UserRestrictionAction
  reason: string
  expected_version: number
  key: string
} | null>(null)
const labels = { ban: '封禁', unban: '解封', mute: '禁言', unmute: '取消禁言' }
const notes = {
  ban: '封禁持续到解除。将暂停用户交互并取消尚未生效的互动；已撤下的内容不会自动恢复。',
  unban: '解除当前全部有效封禁；仍有效的禁言继续生效，危机隔离和隐私屏障不受影响。',
  mute: '禁言7天。将暂停用户交互并取消尚未生效的互动；期满按服务端时间解除。',
  unmute: '解除当前全部有效禁言；仍有效的封禁继续生效，已取消的互动和下线内容不会自动恢复。',
}
function clear() {
  state.value = null
  action.value = null
  reason.value = ''
  confirmation.value = null
  busy.value = false
  error.value = ''
}
const workspace = useAdminWorkspace(clear, 'super_admin')
const client = createUsersClient(useAdminStore().session?.token ?? '', workspace.allowed)
function failure(cause: unknown) {
  if (cause instanceof ApiError && cause.status === 404) {
    clear()
    emit('missing')
    return
  }
  error.value =
    cause instanceof ApiError
      ? reviewErrorMessage(cause)
      : '操作未完成；提交结果不明确时，请保留本次确认并重试'
}
async function load() {
  busy.value = true
  error.value = ''
  state.value = null
  await workspace.run(
    (signal) => client.restrictions(target, signal),
    (result) => {
      state.value = result
    },
    failure,
    () => {
      busy.value = false
    },
  )
}
function select(value: UserRestrictionAction) {
  if (busy.value || confirmation.value || !state.value?.allowed_actions.includes(value)) return
  action.value = value
  reason.value = ''
  error.value = ''
}
function cancel() {
  action.value = null
  reason.value = ''
}
async function prepare() {
  const selected = action.value
  const text = reason.value.trim()
  if (!selected || !text || busy.value || confirmation.value) return
  if (new TextEncoder().encode(text).length > 2000) {
    error.value = '操作理由不能超过2000字节，请精简后重试'
    return
  }
  busy.value = true
  error.value = ''
  await workspace.run(
    (signal) => client.restrictions(target, signal),
    (result) => {
      state.value = result
      if (!result.allowed_actions.includes(selected)) {
        action.value = null
        reason.value = ''
        error.value = '用户状态已变化，请重新选择操作'
        return
      }
      confirmation.value = {
        action: selected,
        reason: text,
        expected_version: result.account_version,
        key: globalThis.crypto.randomUUID(),
      }
    },
    failure,
    () => {
      busy.value = false
    },
  )
}
async function submit() {
  const current = confirmation.value
  if (!current || busy.value) return
  busy.value = true
  error.value = ''
  await workspace.run(
    (signal) =>
      client.changeRestriction(
        target,
        current.action,
        { reason: current.reason, expected_version: current.expected_version },
        current.key,
        signal,
      ),
    (result) => {
      state.value = result
      confirmation.value = null
      action.value = null
      reason.value = ''
      emit('changed')
    },
    async (cause) => {
      if (cause instanceof ApiError && cause.status === 409) {
        confirmation.value = null
        action.value = null
        reason.value = ''
        await load()
        error.value = '用户状态或版本已变化，已重新读取，请重新选择并确认'
      } else failure(cause)
    },
    () => {
      busy.value = false
    },
  )
}
watch(
  () => props.userId,
  () => {
    workspace.cancel()
    clear()
  },
)
onMounted(load)
</script>
<template>
  <section v-if="workspace.allowed()" aria-label="用户操作" :aria-busy="busy">
    <h3>用户操作</h3>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="busy" role="status">正在核对或提交操作…</p>
    <button v-if="!state && !busy" @click="load">重试用户操作</button>
    <template v-if="state">
      <p>
        封禁：{{ state.banned ? '生效中' : '未封禁' }} · 禁言：{{
          state.muted ? '生效中' : '未禁言'
        }}
      </p>
      <div class="workflow-actions">
        <button
          v-for="value in state.allowed_actions"
          :key="value"
          :disabled="busy || !!confirmation"
          @click="select(value)"
        >
          {{ labels[value] }}
        </button>
      </div>
      <form v-if="action && !confirmation" @submit.prevent="prepare">
        <fieldset :disabled="busy">
          <legend>{{ labels[action] }}</legend>
          <p>{{ notes[action] }}</p>
          <label for="user-action-reason">操作理由（必填）</label
          ><textarea id="user-action-reason" v-model="reason" rows="3" required></textarea>
          <button type="submit" :disabled="!reason.trim()">核对用户操作</button
          ><button type="button" @click="cancel">取消操作</button>
        </fieldset>
      </form>
      <section v-if="confirmation" aria-label="用户操作确认" class="workflow-box">
        <h4>确认{{ labels[confirmation.action] }}</h4>
        <p>{{ notes[confirmation.action] }}</p>
        <p>目标用户：{{ target }}</p>
        <p class="reason-text">理由：{{ confirmation.reason }}</p>
        <button :disabled="busy" @click="submit">确认{{ labels[confirmation.action] }}</button>
        <button :disabled="busy" @click="confirmation = null">返回修改</button>
      </section>
    </template>
  </section>
</template>
<style scoped>
.reason-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
