<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
const admin = useAdminStore()
const router = useRouter()
const loginName = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const valid = computed(() => !!loginName.value.trim() && !!password.value.length)
const controller = new AbortController()
let active = true
async function login() {
  if (busy.value || !valid.value) return
  busy.value = true
  error.value = ''
  try {
    await admin.login({ login_name: loginName.value, password: password.value }, controller.signal)
    if (active) await router.replace('/')
  } catch (cause) {
    if (active)
      error.value =
        cause instanceof ApiError && cause.status === 401
          ? '后台账号或口令不正确'
          : '登录未完成，请重试'
  } finally {
    password.value = ''
    busy.value = false
  }
}
onBeforeUnmount(() => {
  active = false
  controller.abort()
  loginName.value = ''
  password.value = ''
})
</script>
<template>
  <main class="login panel">
    <p class="eyebrow">鲤源池 · WEB 管理端</p>
    <h1>后台登录</h1>
    <p>使用超管预建的本地后台账号；后台账号与学生账号独立。登录后可自行改密，到期须重新登录。</p>
    <p v-if="admin.notice" role="status">{{ admin.notice }}</p>
    <p>使用后台账号登录。</p>
    <form @submit.prevent="login">
      <fieldset :disabled="busy">
        <legend>后台账号登录</legend>
        <label for="login-name">后台账号</label>
        <input id="login-name" v-model="loginName" autocomplete="username" required />
        <label for="login-password">口令</label>
        <input
          id="login-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
        />
        <button :disabled="!valid">{{ busy ? '正在登录…' : '登录后台' }}</button>
      </fieldset>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
  </main>
</template>
