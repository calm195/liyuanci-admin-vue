<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { ApiError, mockEnabled } from '@/services/admin'
const admin = useAdminStore()
const router = useRouter()
const owner = admin.session
const currentPassword = ref('')
const newPassword = ref('')
const busy = ref(false)
const error = ref('')
const valid = computed(() => !!currentPassword.value.length && !!newPassword.value.length)
let active = true
let attempt: { current: string; next: string; key: string } | null = null
const controller = new AbortController()
function clear() {
  currentPassword.value = ''
  newPassword.value = ''
  attempt = null
}
watch(
  () => admin.session,
  () => {
    if (admin.session !== owner) {
      controller.abort()
      clear()
    }
  },
  { flush: 'sync' },
)
async function submit() {
  if (!active || busy.value || !valid.value || admin.session !== owner) return
  if (attempt?.current !== currentPassword.value || attempt.next !== newPassword.value)
    attempt = {
      current: currentPassword.value,
      next: newPassword.value,
      key: globalThis.crypto.randomUUID(),
    }
  const input = { current_password: currentPassword.value, new_password: newPassword.value }
  const key = attempt.key
  busy.value = true
  error.value = ''
  try {
    await admin.changePassword(input, key, controller.signal)
    clear()
    if (active && !admin.authenticated) await router.replace('/login')
  } catch (cause) {
    if (active && admin.session === owner) {
      if (cause instanceof ApiError && cause.status === 403) {
        clear()
        error.value = '当前口令不正确，请重新填写；会话未改变'
      } else error.value = '改密结果未确认，请先核对会话；相同输入重试沿用操作标识'
    }
  } finally {
    busy.value = false
  }
}
onBeforeUnmount(() => {
  active = false
  controller.abort()
  clear()
})
</script>
<template>
  <main class="panel workflow">
    <h1>本人修改口令</h1>
    <p>当前账号：{{ admin.session?.account.login_name }}</p>
    <p>核验当前口令后修改；成功后全部旧会话撤销并重新登录，不自动续期。</p>
    <p v-if="mockEnabled" class="banner">
      仅本进程合成演示，不证明真实口令存储、全局撤销或审计生效。
    </p>
    <form @submit.prevent="submit">
      <fieldset :disabled="busy">
        <legend>本人改密</legend>
        <label for="current-password">当前口令</label>
        <input
          id="current-password"
          v-model="currentPassword"
          type="password"
          autocomplete="current-password"
          required
        />
        <label for="new-password">新口令</label>
        <input
          id="new-password"
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          required
        />
        <button :disabled="!valid">{{ busy ? '正在提交…' : '确认改密并重新登录' }}</button>
      </fieldset>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
  </main>
</template>
