<script setup lang="ts">
import { useDictionariesStore } from '@/stores/dictionaries'
import FloatingNotice from '@/components/FloatingNotice.vue'
import { watch, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { useAdminStore } from '@/stores/admin'
import AdminLayout from '@/components/AdminLayout.vue'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'
import './assets/styles/layout.css'

const dictionaries = useDictionariesStore()
let lastDictionaryRefresh = 0
function refreshDictionaries() {
  if (Date.now() - lastDictionaryRefresh < 30000) return
  lastDictionaryRefresh = Date.now()
  void dictionaries.load()
}
onMounted(() => {
  refreshDictionaries()
  globalThis.addEventListener('focus', refreshDictionaries)
})
onBeforeUnmount(() => globalThis.removeEventListener('focus', refreshDictionaries))
const admin = useAdminStore()
const router = useRouter()
const route = useRoute()
watch(() => route.path, refreshDictionaries)
const navigationError = ref('')
async function retryRestore() {
  await admin.restore()
  if (!admin.restoreError) await router.replace({ path: route.fullPath, force: true })
}
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
    globalThis.document.title = `${typeof title === 'string' ? title : '管理端'} · 鲤源池`
  },
  { immediate: true },
)
</script>

<template>
  <ElConfigProvider :locale="zhCn">
    <FloatingNotice
      v-if="admin.authenticated && admin.notice"
      :message="admin.notice"
      tone="success"
    />
    <FloatingNotice v-if="dictionaries.error" :message="dictionaries.error" tone="warning"
      ><p>{{ dictionaries.error }}</p>
      <button :disabled="dictionaries.busy" @click="dictionaries.load">重试</button></FloatingNotice
    >
    <FloatingNotice v-if="navigationError" :message="navigationError" tone="error">{{
      navigationError
    }}</FloatingNotice>
    <main v-if="admin.restoreError" class="panel" aria-label="恢复登录">
      <FloatingNotice :message="admin.restoreError" tone="error">{{
        admin.restoreError
      }}</FloatingNotice>
      <button :disabled="admin.restoring" @click="retryRestore">重试恢复登录</button>
    </main>
    <p v-else-if="admin.restoring" role="status">正在恢复登录…</p>
    <AdminLayout v-else-if="admin.authenticated"><RouterView /></AdminLayout>
    <div v-else class="public-shell">
      <div class="public-tools"><ThemeSwitcher /></div>
      <RouterView />
    </div>
    <footer class="site-footer">
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
        粤ICP备2025460136号-1
      </a>
    </footer>
  </ElConfigProvider>
</template>

<style scoped>
.site-footer {
  padding: 16px 24px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
}
.site-footer a {
  color: inherit;
  text-decoration: none;
}
.site-footer a:hover {
  text-decoration: underline;
}
</style>
