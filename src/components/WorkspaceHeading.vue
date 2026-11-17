<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <header class="workspace-page-heading">
    <div class="workspace-page-heading-copy">
      <slot name="back" />
      <div class="workspace-page-title">
        <h1>{{ title }}</h1>
        <slot name="status" />
      </div>
      <p v-if="description">{{ description }}</p>
    </div>
    <div v-if="$slots['default']" class="workspace-page-actions"><slot /></div>
  </header>
</template>

<style scoped>
.workspace-page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
}
.workspace-page-heading-copy {
  min-width: 0;
  flex: 1;
}
.workspace-page-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.workspace-page-title h1 {
  margin: 0;
  font-size: 27px;
  line-height: 36px;
  overflow-wrap: anywhere;
}
.workspace-page-heading p {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 6px 0 0;
}
.workspace-page-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
@media (max-width: 600px) {
  .workspace-page-heading {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }
  .workspace-page-actions {
    justify-content: flex-end;
  }
}
</style>
