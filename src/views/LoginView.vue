<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { mockEnabled } from '@/services/admin'
import type { Role } from '@/types/admin'
const admin = useAdminStore()
const router = useRouter()
const role = ref<Role>('review_operator')
const busy = ref(false)
const error = ref('')
async function login() {
  busy.value = true
  error.value = ''
  try {
    await admin.login(role.value)
    await router.replace('/')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '登录未完成'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <main class="login panel">
    <p class="eyebrow">鲤源池 · WEB 管理端</p>
    <h1>后台登录</h1>
    <p>后台账号与学生账号独立。请使用获授权的后台身份。</p>
    <p v-if="admin.notice" role="status">{{ admin.notice }}</p>
    <form @submit.prevent="login">
      <template v-if="mockEnabled">
        <p class="banner">合成 Mock 环境 · 不连接真实后台，不接受真实凭据</p>
        <label for="role">模拟角色</label>
        <select id="role" v-model="role">
          <option value="review_operator">审核运营</option>
          <option value="crisis_operator">危机处置人员</option>
          <option value="super_admin">超级管理员</option>
        </select>
      </template>
      <p v-else>身份提供方接入准备中，登录暂不可用。</p>
      <button :disabled="busy || !mockEnabled">
        {{ busy ? '正在登录…' : mockEnabled ? '进入模拟后台' : '登录待接入' }}
      </button>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
  </main>
</template>
