<script setup lang="ts">
import FloatingNotice from '@/components/FloatingNotice.vue'
import { onMounted, ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { useAdminWorkspace, reviewErrorMessage } from '@/composables/useAdminWorkspace'
import { dashboardMetrics, readDashboard } from '@/services/dashboard'
import type { Dashboard, Metric } from '@/services/dashboard'
const admin = useAdminStore()
const range = ref<'month' | 'year'>('month')
const data = ref<Dashboard | null>(null)
const busy = ref(false)
const error = ref('')
let request = new AbortController()
const workspace = useAdminWorkspace(() => {
  request.abort()
  data.value = null
  busy.value = false
}, null)
async function load() {
  request.abort()
  const current = new AbortController()
  request = current
  busy.value = true
  error.value = ''
  await workspace.run(
    (signal) =>
      readDashboard(
        admin.session?.token ?? '',
        range.value,
        AbortSignal.any([signal, current.signal]),
      ),
    (result) => {
      if (!current.signal.aborted) data.value = result
    },
    (cause) => {
      if (!current.signal.aborted) error.value = reviewErrorMessage(cause)
    },
    () => {
      if (!current.signal.aborted) busy.value = false
    },
  )
}
function maximum(key: Metric) {
  return Math.max(1, ...(data.value?.series.map((point) => point[key]) ?? []))
}
function position(index: number) {
  return 36 + (index * 488) / Math.max(1, (data.value?.series.length ?? 0) - 1)
}
function points(key: Metric) {
  return data.value?.series
    .map((point, index) => `${position(index)},${146 - (point[key] / maximum(key)) * 120}`)
    .join(' ')
}
function dateLabel(date?: string) {
  return date ? (data.value?.range === 'year' ? date.slice(0, 7) : date.slice(5)) : ''
}
onMounted(load)
</script>
<template>
  <main class="panel dashboard" aria-label="首页">
    <div class="dashboard-heading">
      <div>
        <h1>首页</h1>
        <p>用户、资料与心愿概况</p>
      </div>
      <button :disabled="busy" @click="load">刷新数据</button>
    </div>
    <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
    <p v-if="busy" role="status">正在读取统计…</p>
    <template v-if="data">
      <div class="metric-cards">
        <article v-for="(label, key) in dashboardMetrics" :key="key" class="metric-card">
          <h2>{{ key === 'new_users' ? '最近一月新增用户' : label }}</h2>
          <strong>{{ data.summary[key].toLocaleString('zh-CN') }}</strong>
        </article>
      </div>
      <div class="dashboard-heading">
        <h2>变化趋势</h2>
        <label
          >时间范围
          <select v-model="range" @change="load">
            <option value="month">最近一月 · 按日</option>
            <option value="year">最近一年 · 按月</option>
          </select></label
        >
      </div>
      <p>{{ data.history_note }}</p>
      <p>时间为北京时间；新增用户按日或月统计，其他曲线展示各期末累计数量。</p>
      <div class="charts">
        <article v-for="(label, key) in dashboardMetrics" :key="key" class="trend-chart">
          <h3>{{ label }}</h3>
          <svg viewBox="0 0 560 180" role="img" :aria-label="`${label}趋势`">
            <title>{{ label }}{{ data.range === 'month' ? '最近一月' : '最近一年' }}趋势</title>
            <path d="M36 26V146H524" class="chart-axis" />
            <text x="30" y="30" text-anchor="end">{{ maximum(key) }}</text>
            <text x="30" y="150" text-anchor="end">0</text>
            <text x="36" y="172">{{ dateLabel(data.series[0]?.date) }}</text>
            <text x="524" y="172" text-anchor="end">{{ dateLabel(data.series.at(-1)?.date) }}</text>
            <polyline :points="points(key)" class="chart-line" />
            <circle
              v-for="(point, index) in data.series"
              :key="point.date"
              :cx="position(index)"
              :cy="146 - (point[key] / maximum(key)) * 120"
              r="3"
              class="chart-point"
            >
              <title>{{ point.date }}：{{ point[key] }}</title>
            </circle>
          </svg>
          <details>
            <summary>查看数据</summary>
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>{{ label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="point in data.series" :key="point.date">
                  <td>{{ dateLabel(point.date) }}</td>
                  <td>{{ point[key] }}</td>
                </tr>
              </tbody>
            </table>
          </details>
        </article>
      </div>
    </template>
  </main>
</template>
<style scoped>
.dashboard {
  display: grid;
  gap: 1.25rem;
}
.dashboard-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.dashboard-heading h1,
.dashboard-heading h2 {
  margin: 0;
}
.metric-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}
.metric-card,
.trend-chart {
  border: 1px solid var(--border-color);
  border-radius: 0.8rem;
  padding: 1rem;
  min-width: 0;
}
.metric-card h2 {
  font-size: 0.95rem;
  font-weight: 500;
  margin: 0 0 1rem;
}
.metric-card strong {
  font-size: 2rem;
  font-variant-numeric: tabular-nums;
}
.charts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
svg {
  width: 100%;
  overflow: visible;
}
svg text {
  fill: currentColor;
  font-size: 11px;
}
.chart-axis {
  stroke: var(--border-color);
  fill: none;
}
.chart-line {
  stroke: var(--text-primary);
  stroke-width: 2;
  fill: none;
}
.chart-point {
  fill: var(--text-primary);
}
select {
  padding: 0.5rem;
  font: inherit;
}
summary {
  cursor: pointer;
}
th,
td {
  padding: 0.3rem 0.8rem;
  text-align: left;
}
@media (max-width: 760px) {
  .metric-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .charts {
    grid-template-columns: 1fr;
  }
}
</style>
