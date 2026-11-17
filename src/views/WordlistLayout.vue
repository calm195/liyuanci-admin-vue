<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
</script>
<template>
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
