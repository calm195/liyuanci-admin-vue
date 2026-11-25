<script setup lang="ts">
import NumberedPagination from './NumberedPagination.vue'
const page = defineModel<number>('page', { required: true })
const size = defineModel<number>('size', { required: true })
defineProps<{ total: number; disabled?: boolean }>()
</script>
<template>
  <NumberedPagination
    :page="page"
    :page-size="size"
    :total="total"
    :disabled="disabled"
    @turn="page = $event"
    @resize="size = $event"
  />
</template>
