<script setup lang="ts">
import { computed } from 'vue'
import type { TraitWord } from '@/types/matchmaking-traits'
const props = defineProps<{ items: TraitWord[] }>()
const maximum = computed(() => Math.max(1, ...props.items.map((item) => item.heat)))
function fontSize(heat: number) {
  return `${14 + 8 * Math.sqrt(heat / maximum.value)}px`
}
</script>
<template>
  <ul class="trait-word-cloud" aria-label="特质标签词云，字号表示当前筛选下的使用人数">
    <li
      v-for="word in items"
      :key="word.id"
      :style="{ fontSize: fontSize(word.heat) }"
      :title="`${word.name}：${word.heat} 人`"
      :aria-label="`${word.name}：${word.heat} 人`"
    >
      {{ word.name }}
    </li>
  </ul>
</template>
<style scoped>
.trait-word-cloud {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 16px 0 0;
  margin: 0;
  list-style: none;
}
.trait-word-cloud li {
  padding: 4px 10px;
  border-radius: 8px;
  background: var(--selected-surface);
  color: var(--accent-color);
  overflow-wrap: anywhere;
  max-width: 100%;
}
</style>
