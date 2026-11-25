<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PageSizeSelect from './PageSizeSelect.vue'

const props = defineProps<{
  page: number
  total: number
  pageSize: number
  disabled?: boolean
  fixedSize?: boolean
}>()
const emit = defineEmits<{ turn: [page: number]; resize: [size: number] }>()
const pages = computed(() => Math.ceil(props.total / props.pageSize))
const input = ref('')
const error = ref('')
watch([() => props.page, pages], () => {
  input.value = ''
  error.value = ''
})
function jump() {
  if (props.disabled || !pages.value) return
  const raw = input.value.trim()
  const target = Number(raw)
  if (!/^\d+$/u.test(raw) || !Number.isSafeInteger(target) || target < 1 || target > pages.value) {
    error.value = `请输入 1 至 ${pages.value} 之间的页码。`
    return
  }
  input.value = ''
  error.value = ''
  if (target !== props.page) emit('turn', target)
}
</script>

<template>
  <nav class="business-pagination numbered-pagination" aria-label="列表分页">
    <PageSizeSelect
      v-if="!fixedSize"
      :model-value="pageSize"
      :disabled="disabled"
      @update:model-value="emit('resize', $event)"
    />
    <span v-else>每页 {{ pageSize }} 条</span>
    <span role="status">共 {{ total }} 条 · {{ pages ? `第 ${page} / ${pages} 页` : '0 页' }}</span>
    <button type="button" :disabled="disabled || page <= 1" @click="emit('turn', page - 1)">
      上一页
    </button>
    <button type="button" :disabled="disabled || page >= pages" @click="emit('turn', page + 1)">
      下一页
    </button>
    <div class="jump">
      <label
        >跳至
        <input
          v-model="input"
          inputmode="numeric"
          :disabled="disabled || !pages"
          :aria-invalid="!!error"
          @keydown.enter.prevent="jump"
        />
        页</label
      >
      <button type="button" :disabled="disabled || !pages" @click="jump">跳转</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </nav>
</template>

<style scoped>
.numbered-pagination,
.jump {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.jump input {
  width: 5em;
  padding: 5px;
}
.numbered-pagination p {
  flex-basis: 100%;
  margin: 0;
}
</style>
