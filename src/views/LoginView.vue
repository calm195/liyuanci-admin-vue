<script setup lang="ts">
import FloatingNotice from '@/components/FloatingNotice.vue'
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
  <main class="login panel experience-page login-workspace">
    <p class="eyebrow">鲤源池 · 管理端</p>
    <h1 id="admin-login-title">后台登录</h1>
    <FloatingNotice v-if="admin.notice" :message="admin.notice" tone="info">{{
      admin.notice
    }}</FloatingNotice>
    <form class="experience-editor" aria-labelledby="admin-login-title" @submit.prevent="login">
      <fieldset :disabled="busy">
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
        <button class="business-primary" :disabled="!valid">
          {{ busy ? '正在登录…' : '登录后台' }}
        </button>
      </fieldset>
      <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
    </form>
  </main>
</template>

<style scoped>
.login-workspace {
  width: min(460px, calc(100vw - 32px));
  border-radius: 12px;
  padding: 32px;
  margin: clamp(40px, 12vh, 120px) auto;
}
.login-workspace h1 {
  font-size: 26px;
  line-height: 36px;
  margin: 0;
}
.login-workspace .eyebrow {
  margin: 0;
}
</style>
