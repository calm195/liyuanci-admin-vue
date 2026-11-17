<script setup lang="ts">
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
</script>
<template>
  <main class="experience-page">
    <section class="experience-panel experience-state">
      <WorkspaceHeading
        title="404 · 页面不存在"
        description="请检查访问地址，或返回工作台继续操作。"
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
