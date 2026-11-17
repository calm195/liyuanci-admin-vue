<script setup lang="ts">
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
</script>
<template>
  <main class="experience-page">
    <section class="experience-panel experience-state">
      <WorkspaceHeading
        title="403 · 无访问权限"
        description="当前后台角色无权访问此功能，请联系管理员。"
      /><RouterLink class="experience-primary-link" to="/">返回首页</RouterLink>
    </section>
  </main>
</template>
<style scoped>
.experience-state {
  min-height: 300px;
  display: grid;
  align-content: center;
  justify-items: start;
  gap: 24px;
}
</style>
