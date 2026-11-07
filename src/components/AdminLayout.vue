<script setup lang="ts">
import FloatingNotice from '@/components/FloatingNotice.vue'
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
const expandedGroup = ref<string | null>(null)
const error = ref('')
const visibleGroups = computed(() => {
  const visible = menu.filter(canAccessMenu)
  return ['用户管理', '资料管理', '内容治理', '安全治理', '隐私管理', '系统管理']
    .filter((title) => visible.some((item) => item.group === title))
    .map((title) => ({
      title,
      items: visible.filter((item) => item.group === title),
    }))
})
function toggleGroup(title: string) {
  expandedGroup.value = expandedGroup.value === title ? null : title
}
watch(
  () => route.path,
  () => {
    menuOpen.value = false
    const current = visibleGroups.value.find((group) =>
      group.items.some(({ path }) => route.path === path || route.path.startsWith(path + '/')),
    )
    expandedGroup.value = current?.title ?? null
  },
  { immediate: true },
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
      <RouterLink class="workspace-brand" to="/" aria-label="鲤源池管理端首页">
        <span class="brand-mark" aria-hidden="true">鲤</span>
        <span>鲤源池<strong>管理端</strong></span>
      </RouterLink>
      <nav class="workspace-navigation" aria-label="管理菜单">
        <RouterLink class="navigation-root-link" to="/">首页</RouterLink>
        <section
          v-for="(group, index) in visibleGroups"
          :key="group.title"
          class="navigation-group"
        >
          <h2>
            <button
              class="navigation-group-toggle"
              type="button"
              :aria-controls="`navigation-group-${index}`"
              :aria-expanded="expandedGroup === group.title"
              @click="toggleGroup(group.title)"
            >
              {{ group.title }}
              <span aria-hidden="true">{{ expandedGroup === group.title ? '▾' : '▸' }}</span>
            </button>
          </h2>
          <div :id="`navigation-group-${index}`" :hidden="expandedGroup !== group.title">
            <RouterLink v-for="item in group.items" :key="item.path" :to="item.path">
              {{ item.title }}
            </RouterLink>
          </div>
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
      <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
      <div id="workspace-content" class="workspace-content" tabindex="-1"><slot /></div>
    </div>
  </div>
</template>
