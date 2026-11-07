<script setup lang="ts">
import WordlistMatches from '@/components/WordlistMatches.vue'
import type { WordlistEvidence } from '@/types/wordlists'

defineProps<{
  evidence: WordlistEvidence
  body: string
  title?: string | undefined
  rewardText?: string | undefined
}>()
</script>

<template>
  <details>
    <summary>词库命中详情（{{ evidence.matches.length }} 条）</summary>
    <dl>
      <dt>匹配策略</dt>
      <dd>{{ evidence.engine_version }}</dd>
      <template v-if="evidence.builtin_version">
        <dt>内置词库版本</dt>
        <dd>{{ evidence.builtin_version }}</dd>
      </template>
      <dt>自定义词库版本</dt>
      <dd>危机 {{ evidence.crisis_version }}</dd>
      <dd>涉校 {{ evidence.school_version }}</dd>
      <dd>普通违规 {{ evidence.ordinary_version }}</dd>
    </dl>
    <p v-if="evidence.truncated">命中数量超过保存上限，此处展示已保存的记录。</p>
    <WordlistMatches
      :matches="evidence.matches"
      :body="body"
      :title="title"
      :reward-text="rewardText"
    />
  </details>
</template>
