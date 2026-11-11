<script setup lang="ts">
import { computed } from 'vue'
import type { ScoreDetails } from '@/types/matchmaking'
const props = withDefaults(
  defineProps<{ score: number; details: ScoreDetails; first?: string; second?: string }>(),
  { first: '参与者一', second: '参与者二' },
)
const base = computed(() => props.score - (props.details.traits ?? 0))
</script>
<template>
  <div class="match-score-detail">
    <p>
      <strong>总分 {{ score }}</strong> · 基础 {{ base }} + 标签 {{ details.traits ?? 0 }}
    </p>
    <p class="score-base">
      MBTI {{ details.mbti }}/30 · 年龄 {{ details.age }}/20 · 校区 {{ details.campus }}/25 · 身高
      {{ details.height }}/15 · 体重 {{ details.weight }}/10
    </p>
    <p>
      {{ first }}个人 → {{ second }}理想：{{ details.personal_to_ideal?.join('、') || '无命中' }}
    </p>
    <p>
      {{ second }}个人 → {{ first }}理想：{{ details.ideal_to_personal?.join('、') || '无命中' }}
    </p>
    <p class="score-note">
      每个方向每命中一个标签加 5 分；同一标签双向命中可加 10 分。总分不是百分比。
    </p>
  </div>
</template>
<style scoped>
.match-score-detail {
  overflow-wrap: anywhere;
  line-height: 1.65;
}
p {
  margin: 0.35rem 0;
}
.score-base,
.score-note {
  color: var(--text-secondary);
  font-size: 0.88rem;
}
</style>
