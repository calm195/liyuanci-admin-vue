<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { menu, canAccessMenu } from '@/router'
const admin = useAdminStore()
const router = useRouter()
const visibleMenu = computed(() => menu.filter(canAccessMenu))
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
