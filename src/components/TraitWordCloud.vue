<script setup lang="ts">
import { computed } from 'vue'
import { layoutTraitCloud } from '@/utils/trait-cloud'
import type { TraitWord } from '@/types/matchmaking-traits'
const props = defineProps<{ items: TraitWord[] }>()
const words = computed(() => layoutTraitCloud(props.items))
const colors = ['#176b68', '#34569a', '#8651a3', '#956020', '#a14066']
</script>
<template>
  <svg viewBox="0 0 1000 600" role="img" aria-label="特质标签词云，字号表示当前筛选下的使用人数">
    <title>特质标签热度词云</title>
    <desc>{{ items.map((word) => `${word.name}：${word.heat} 人`).join('；') }}</desc>
    <text
      v-for="(word, index) in words"
      :key="word.id"
      :x="word.x + word.width / 2"
      :y="word.y + word.height / 2"
      text-anchor="middle"
      dominant-baseline="central"
      :font-size="word.fontSize"
      :fill="colors[index % colors.length]"
    >
      <title>{{ word.name }}：{{ word.heat }} 人</title>
      {{ word.name }}
    </text>
  </svg>
</template>
<style scoped>
svg {
  width: 100%;
  display: block;
  background: #fafcfb;
  border-radius: 1rem;
  font-family: sans-serif;
}
</style>
