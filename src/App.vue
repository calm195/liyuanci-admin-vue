<script setup lang="ts">
import { watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { useAdminStore } from '@/stores/admin'
import AdminLayout from '@/components/AdminLayout.vue'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'
import './assets/styles/layout.css'

const admin = useAdminStore()
const router = useRouter()
const route = useRoute()
const navigationError = ref('')
function navigate(path: string) {
  void router.replace(path).catch(() => {
    navigationError.value = '页面跳转未完成，请刷新后重试'
  })
}
watch(
  () => admin.authenticated,
  (active) => {
    if (!active) navigate('/login')
    else if (route.path === '/login') navigate('/')
  },
)
watch(
  () => admin.forbidden,
  () => {
    navigate('/403')
  },
)
watch(
  () => route.meta['title'],
  (title) => {
    globalThis.document.title = `${typeof title === 'string' ? title : '管理工作台'} · 鲤源池`
  },
  { immediate: true },
)
</script>

<template>
  <ElConfigProvider :locale="zhCn">
    <p v-if="navigationError" role="alert">{{ navigationError }}</p>
    <AdminLayout v-if="admin.authenticated"><RouterView /></AdminLayout>
    <div v-else class="public-shell">
      <div class="public-tools"><ThemeSwitcher /></div>
      <RouterView />
    </div>
  </ElConfigProvider>
</template>
