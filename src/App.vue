<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { mockEnabled } from '@/services/admin'
import { menu } from '@/router'
const admin = useAdminStore()
const router = useRouter()
const visibleMenu = computed(() => menu.filter((item) => !item.role || admin.can(item.role)))
watch(
  () => admin.authenticated,
  (active) => {
    if (!active) void router.replace('/login')
  },
)
watch(
  () => admin.forbidden,
  () => {
    void router.replace('/403')
  },
)
async function logout() {
  await admin.logout()
  await router.replace('/login')
}
</script>
<template>
  <div v-if="mockEnabled" class="banner" role="status">
    合成 Mock · 所有会话和角色均为模拟，未完成真实验收
  </div>
  <header v-if="admin.authenticated">
    <strong>鲤源池 / 管理工作台</strong>
    <nav aria-label="管理菜单">
      <RouterLink v-for="item in visibleMenu" :key="item.path" :to="item.path">{{
        item.title
      }}</RouterLink>
    </nav>
    <button @click="logout">退出登录</button>
  </header>
  <RouterView />
</template>
