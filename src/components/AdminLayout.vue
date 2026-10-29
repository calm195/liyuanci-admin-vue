<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton } from 'element-plus'
import { menu, canAccessMenu } from '@/router'
import { useAdminStore } from '@/stores/admin'
import AppBreadcrumb from './AppBreadcrumb.vue'
import ThemeSwitcher from './ThemeSwitcher.vue'

const admin = useAdminStore()
const route = useRoute()
const router = useRouter()
const menuOpen = ref(false)
const error = ref('')
const visibleGroups = computed(() => {
  const visible = menu.filter(canAccessMenu)
  return ['总览', '用户管理', '认证管理', '内容治理', '安全治理', '隐私管理', '系统管理']
    .filter((title) => visible.some((item) => item.group === title))
    .map((title) => ({
      title,
      items: visible.filter((item) => item.group === title),
    }))
})
watch(
  () => route.path,
  () => {
    menuOpen.value = false
  },
)
async function logout() {
  try {
    await admin.logout()
    await router.replace('/login')
  } catch {
    error.value = '退出后的页面跳转未完成，请刷新页面'
  }
}
</script>

<template>
  <div class="admin-shell">
    <a class="skip-link" href="#workspace-content">跳到页面内容</a>
    <aside id="workspace-sidebar" class="workspace-sidebar" :class="{ 'is-open': menuOpen }">
      <RouterLink class="workspace-brand" to="/" aria-label="鲤源池管理端工作台">
        <span class="brand-mark" aria-hidden="true">鲤</span>
        <span>鲤源池<strong>管理工作台</strong></span>
      </RouterLink>
      <nav class="workspace-navigation" aria-label="管理菜单">
        <section v-for="group in visibleGroups" :key="group.title" class="navigation-group">
          <h2>{{ group.title }}</h2>
          <RouterLink v-for="item in group.items" :key="item.path" :to="item.path">
            {{ item.title }}
          </RouterLink>
        </section>
      </nav>
      <p class="sidebar-caption">鲤源池 · WEB 管理端</p>
    </aside>
    <div class="workspace-body">
      <header class="workspace-header">
        <ElButton
          class="mobile-menu-toggle"
          aria-controls="workspace-sidebar"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          {{ menuOpen ? '收起菜单' : '展开菜单' }}
        </ElButton>
        <AppBreadcrumb />
        <div class="workspace-tools">
          <ThemeSwitcher />
          <span class="account-name">{{ admin.session?.account.login_name }}</span>
          <ElButton @click="logout">退出登录</ElButton>
        </div>
      </header>
      <p v-if="error" role="alert">{{ error }}</p>
      <div id="workspace-content" class="workspace-content" tabindex="-1"><slot /></div>
    </div>
  </div>
</template>
