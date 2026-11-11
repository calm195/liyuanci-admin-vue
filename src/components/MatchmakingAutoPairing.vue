<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FloatingNotice from './FloatingNotice.vue'
import MatchmakingScore from './MatchmakingScore.vue'
import { useAutoPairing } from '@/composables/useAutoPairing'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import type { AutoPairingStatus } from '@/types/matchmaking-auto'
const props = defineProps<{ activityID: string; activityVersion: number; disabled: boolean }>()
const emit = defineEmits<{ applied: []; busyChange: [busy: boolean] }>()
const {
  job,
  reading,
  writing,
  error,
  notice,
  confirming,
  expired,
  pending,
  running,
  stale,
  canApply,
  canGenerate,
  refresh,
  retry,
  generate,
  apply,
} = useAutoPairing(
  () => props.activityID,
  () => props.activityVersion,
  () => props.disabled,
  () => emit('applied'),
)
const { feedback, run } = useOperationFeedback(() => !!error.value)
const tab = ref<'pairs' | 'unmatched' | 'excluded'>('pairs'),
  page = ref(1)
const pairRows = computed(
  () => job.value?.pairs.slice((page.value - 1) * 20, page.value * 20) ?? [],
)
const reasonRows = computed(() =>
  tab.value === 'pairs'
    ? []
    : (job.value?.[tab.value].slice((page.value - 1) * 20, page.value * 20) ?? []),
)
const total = computed(() => job.value?.[tab.value].length ?? 0)
const statusLabels: Record<AutoPairingStatus, string> = {
  pending: '等待后台处理',
  running: '正在计算分配',
  ready: '预览已生成',
  applied: '已应用为待发布配对',
  stale: '预览已失效',
  failed: '生成失败',
}
const reasons: Record<string, string> = {
  no_candidate: '没有满足条件的候选',
  competition: '合格候选已分配给其他参与者',
  not_approved: '报名尚未通过审核',
  ineligible: '当前配对资格无效',
  occupied: '已有配对占用，保持原配对',
}
watch([() => job.value?.id, tab], () => {
  page.value = 1
})
watch(writing, (value) => emit('busyChange', value), { flush: 'sync' })
function time(value: string) {
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}
</script>
<template>
  <section class="auto-panel" aria-label="全员自动分配">
    <div class="auto-heading">
      <div>
        <h2>全员自动分配</h2>
        <p>覆盖本活动全部报名者，保留已有配对，为未占用的合格报名者生成分配预览。</p>
      </div>
      <button :disabled="reading || writing || !!pending" @click="run(refresh, '分配进度已刷新')">
        刷新分配进度
      </button>
    </div>
    <p>优先让更多人完成配对，再优化总分；同分方案随机选择。重新生成可能得到不同方案。</p>
    <FloatingNotice v-if="error" :message="error" tone="error" />
    <FloatingNotice v-if="notice" :message="notice" tone="success" />
    <FloatingNotice
      v-if="feedback.message"
      :message="feedback.message"
      :tone="feedback.tone"
      :revision="feedback.revision"
    />
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="pending" class="auto-warning" aria-label="待确认自动分配操作">
      <p>提交结果尚未确认，已保留原请求。请原样重试后再继续操作。</p>
      <button :disabled="writing" @click="retry">原样重试自动分配</button>
    </div>
    <p v-if="reading && !running" role="status">正在读取分配预览…</p>
    <div v-if="running" class="auto-progress" role="status">
      <progress aria-label="后台分配计算进度" /><span
        >{{ job ? statusLabels[job.status] : '' }}。可离开页面，返回后继续查看。</span
      >
    </div>
    <div class="auto-actions">
      <button class="business-primary" :disabled="!canGenerate" @click="generate">
        {{ job ? '重新生成全员预览' : '生成全员分配预览' }}</button
      ><button v-if="job?.status === 'ready'" :disabled="!canApply" @click="confirming = true">
        确认应用为待发布配对
      </button>
    </div>
    <template v-if="job">
      <p>
        <strong>{{ statusLabels[job.status] }}</strong> · 创建于 {{ time(job.created_at) }}
      </p>
      <p v-if="job.status !== 'applied'">预览有效期至 {{ time(job.expires_at) }}</p>
      <p v-if="stale || (expired && job.status !== 'applied')" class="auto-warning" role="alert">
        {{
          stale
            ? '活动或参与资料已变化，当前预览不能应用。请刷新活动并重新生成。'
            : '预览已过期，请重新生成。'
        }}
      </p>
      <dl class="auto-stats">
        <div>
          <dt>报名人数</dt>
          <dd>{{ job.participant_count }}</dd>
        </div>
        <div>
          <dt>参与计算</dt>
          <dd>{{ job.eligible_count }}</dd>
        </div>
        <div>
          <dt>拟配对</dt>
          <dd>{{ job.paired_count }} 组 / {{ job.paired_count * 2 }} 人</dd>
        </div>
        <div>
          <dt>未匹配</dt>
          <dd>{{ job.unmatched_count }} 人</dd>
        </div>
        <div>
          <dt>未参与</dt>
          <dd>{{ job.excluded_count }} 人</dd>
        </div>
        <div>
          <dt>总分</dt>
          <dd>{{ job.total_score }}</dd>
        </div>
      </dl>
      <section v-if="confirming && canApply" class="auto-confirm" aria-label="确认分配方案">
        <h3>确认应用当前方案</h3>
        <p>
          将新增
          {{ job.paired_count }}
          组待发布配对，保留原有配对。应用时会重新核对报名、资格与版本；结果仍需按原流程发布。
        </p>
        <button :disabled="!canApply" @click="apply">确认应用 {{ job.paired_count }} 组</button
        ><button :disabled="writing" @click="confirming = false">继续核对</button>
      </section>
      <template v-if="job.status === 'applied' || (!running && !stale && !expired)">
        <div class="auto-tabs" role="group" aria-label="分配预览分类">
          <button :aria-pressed="tab === 'pairs'" @click="tab = 'pairs'">
            配对方案（{{ job.paired_count }}）</button
          ><button :aria-pressed="tab === 'unmatched'" @click="tab = 'unmatched'">
            未匹配原因（{{ job.unmatched_count }}）</button
          ><button :aria-pressed="tab === 'excluded'" @click="tab = 'excluded'">
            未参与原因（{{ job.excluded_count }}）
          </button>
        </div>
        <template v-if="tab === 'pairs'"
          ><article v-for="pair in pairRows" :key="pair.first.enrollment_id" class="auto-pair">
            <h3>{{ pair.first.name }} × {{ pair.second.name }}</h3>
            <MatchmakingScore
              :score="pair.score"
              :details="pair.score_details"
              :first="pair.first.name"
              :second="pair.second.name"
            />
          </article>
          <p v-if="!pairRows.length">本次没有可新增的配对。</p></template
        >
        <ul v-else-if="reasonRows.length" class="auto-reasons">
          <li v-for="person in reasonRows" :key="person.enrollment_id">
            <strong>{{ person.name || '报名者' }}</strong
            >：{{ reasons[person.reason] ?? person.reason }}
          </li>
        </ul>
        <p v-else>本分类暂无记录。</p>
        <nav v-if="total > 20" class="auto-pagination" aria-label="分配预览分页">
          <button :disabled="page <= 1" @click="page--">上一页预览</button
          ><span>第 {{ page }} / {{ Math.ceil(total / 20) }} 页，共 {{ total }} 条</span
          ><button :disabled="page * 20 >= total" @click="page++">下一页预览</button>
        </nav>
      </template>
    </template>
  </section>
</template>
<style scoped>
.auto-panel {
  border: 1px solid var(--border-color, #dce3df);
  border-radius: 1rem;
  background: var(--bg-surface, #fff);
  padding: 1.25rem;
  margin: 1rem 0;
  overflow-wrap: anywhere;
}
.auto-heading {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 1rem;
  flex-wrap: wrap;
}
h2,
h3 {
  margin: 0 0 0.5rem;
}
p {
  line-height: 1.65;
  margin: 0.6rem 0;
}
.auto-actions,
.auto-tabs,
.auto-pagination,
.auto-progress {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin: 1rem 0;
}
.auto-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin: 1.2rem 0;
}
.auto-stats div {
  padding: 0.8rem;
  border-radius: 0.6rem;
  background: var(--bg-subtle, #f4f7f6);
}
dt {
  color: var(--text-secondary);
  font-size: 0.85rem;
}
dd {
  margin: 0.4rem 0 0;
  font-weight: 650;
}
.auto-pair {
  padding: 1rem;
  border: 1px solid var(--border-color, #dce3df);
  border-radius: 0.7rem;
  margin-top: 0.8rem;
}
.auto-warning,
.auto-confirm {
  padding: 0.8rem;
  border-radius: 0.6rem;
  background: #fff5db;
  color: #674c14;
}
.auto-tabs button[aria-pressed='true'] {
  border-color: var(--primary-color, #6d28d9);
  font-weight: 700;
}
.auto-reasons {
  padding-left: 1.2rem;
  line-height: 1.8;
}
.auto-pagination {
  justify-content: flex-end;
}
@media (max-width: 640px) {
  .auto-panel {
    padding: 0.8rem;
  }
  .auto-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
