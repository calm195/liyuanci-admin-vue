<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
</script>
<template>
  <nav class="workflow-actions wordlist-navigation" aria-label="词库管理导航">
    <RouterLink :to="{ name: 'wordlist-builtin' }">内置词库</RouterLink>
    <RouterLink :to="{ name: 'wordlist-list' }">自定义词库</RouterLink>
    <RouterLink :to="{ name: 'wordlist-history' }">发布记录</RouterLink>
  </nav>
  <RouterView :key="route.path" />
</template>

<style scoped>
.wordlist-navigation {
  margin-block-end: 1rem;
}
.wordlist-navigation a {
  padding: 0.5rem 0.75rem;
  border-bottom: 2px solid transparent;
}
.wordlist-navigation .router-link-exact-active {
  border-bottom-color: currentcolor;
  font-weight: 600;
}
</style>
