<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { mockEnabled, createSyntheticCredentials, ApiError } from '@/services/admin'
import type { Role } from '@/types/admin'
const admin = useAdminStore()
const router = useRouter()
const role = ref<Role>('review_operator')
const loginName = ref('')
const password = ref('')
const showPassword = ref(false)
const busy = ref(false)
const error = ref('')
const valid = computed(() => !!loginName.value.trim() && !!password.value.length)
const controller = new AbortController()
let active = true
function prepare() {
  if (busy.value) return
  const input = createSyntheticCredentials(role.value)
  loginName.value = input.login_name
  password.value = input.password
  error.value = ''
}
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
    showPassword.value = false
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
    <section v-if="mockEnabled">
      <p class="banner">合成 Mock 环境 · 不连接真实后台，不接受真实凭据</p>
      <label for="role">合成夹具角色（仅生成本地虚构账号，不作为登录请求字段）</label>
      <select id="role" v-model="role" :disabled="busy">
        <option value="review_operator">审核运营</option>
        <option value="crisis_operator">危机处置人员</option>
        <option value="super_admin">超级管理员</option>
      </select>
      <button :disabled="busy" @click="prepare">生成并填入临时合成凭据</button>
      <p>每次生成会替换本次合成账号；没有内置口令，不代表真实账号创建。</p>
    </section>
    <p v-else>使用后台账号登录。</p>
    <form @submit.prevent="login">
      <fieldset :disabled="busy">
        <legend>后台账号登录</legend>
        <label for="login-name">后台账号</label>
        <input id="login-name" v-model="loginName" autocomplete="username" required />
        <label for="login-password">口令</label>
        <input
          id="login-password"
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="current-password"
          required
        />
        <label v-if="mockEnabled"
          ><input
            v-model="showPassword"
            type="checkbox"
          />显示临时合成口令（可在登录前记录用于改密演示）</label
        >
        <button :disabled="!valid">{{ busy ? '正在登录…' : '登录后台' }}</button>
      </fieldset>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
  </main>
</template>
