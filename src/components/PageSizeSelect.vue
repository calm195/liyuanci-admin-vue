<script setup lang="ts">
const size = defineModel<number>({ default: 10 })
defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ change: [] }>()
</script>
<template>
  <label class="page-size-select"
    >每页数量
    <select v-model.number="size" :disabled="disabled" @change="emit('change')">
      <option :value="10">10</option>
      <option :value="20">20</option>
      <option :value="50">50</option>
    </select>
  </label>
</template>
<style scoped>
.page-size-select {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
select {
  font: inherit;
  padding: 0.4rem;
}
</style>
