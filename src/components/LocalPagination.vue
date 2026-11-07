<script setup lang="ts">
import PageSizeSelect from './PageSizeSelect.vue'
const page = defineModel<number>('page', { required: true })
const size = defineModel<number>('size', { required: true })
defineProps<{ pages: number; disabled?: boolean }>()
</script>
<template>
  <nav class="business-pagination" aria-label="列表分页">
    <PageSizeSelect v-model="size" :disabled="disabled" />
    <button type="button" :disabled="disabled || page <= 1" @click="page--">上一页</button>
    <span>第 {{ page }} / {{ pages }} 页</span>
    <button type="button" :disabled="disabled || page >= pages" @click="page++">下一页</button>
  </nav>
</template>
