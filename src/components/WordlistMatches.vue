<script setup lang="ts">
import type { WordlistKind, WordlistMatch } from '@/types/wordlists'
import { builtinWordlistLabel } from '@/utils/builtin-wordlist-label'

const props = defineProps<{
  matches: WordlistMatch[]
  body?: string
  title?: string | undefined
  rewardText?: string | undefined
}>()
const kinds: Record<WordlistKind, string> = {
  builtin: '内置词库',
  crisis: '危机',
  school: '涉校',
  ordinary_violation: '普通违规',
}
const fields = { body: '正文', title: '标题', reward_text: '报答方式' }
function fragment(match: WordlistMatch) {
  const value = { body: props.body, title: props.title, reward_text: props.rewardText }[
    match.field ?? 'body'
  ]
  return value !== undefined && match.end <= value.length ? value.slice(match.start, match.end) : ''
}
</script>

<template>
  <p v-if="!matches.length">无词库命中</p>
  <div v-else class="business-table">
    <table>
      <thead>
        <tr>
          <th scope="col">词条</th>
          <th scope="col">来源与分类</th>
          <th scope="col">处置</th>
          <th scope="col">原文位置</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(match, index) in matches" :key="index">
          <th scope="row">{{ match.word }}</th>
          <td>
            {{ match.source === 'custom' ? '自定义 · ' : '' }}{{ kinds[match.kind] }}
            <span v-if="match.label"> · {{ builtinWordlistLabel(match.label) }}</span>
          </td>
          <td>{{ match.disposition === 'review' ? '进入复核' : '仅提示' }}</td>
          <td>
            {{ fields[match.field ?? 'body'] }} {{ match.start }}–{{ match.end }}
            <mark v-if="fragment(match)">{{ fragment(match) }}</mark>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
