<script setup lang="ts">
import { useCounterStore } from '@/stores/counter'

const counter = useCounterStore()
</script>

<template>
  <section class="demo" aria-labelledby="demo-title">
    <div>
      <p class="eyebrow">LIVE PLAYGROUND</p>
      <h2 id="demo-title">从一次响应开始。</h2>
      <p>试试 Pinia 状态管理，感受 Vue 的响应式。</p>
    </div>
    <div class="counter-controls">
      <output aria-live="polite" aria-label="当前计数">{{ counter.count }}</output>
      <span>computed × 2 = {{ counter.doubled }}</span>
      <div class="button-row">
        <button class="button" type="button" @click="counter.increment">增加计数 +1</button>
        <button class="text-button" type="button" @click="counter.reset">重置</button>
      </div>
    </div>
  </section>
</template>
