<script setup lang="ts">
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import DashboardHotList from '@/components/DashboardHotList.vue'
import FloatingNotice from '@/components/FloatingNotice.vue'
import { computed, onMounted, ref } from 'vue'
import { menu, canAccessMenu } from '@/router'
import { useAdminStore } from '@/stores/admin'
import { useAdminWorkspace, reviewErrorMessage } from '@/composables/useAdminWorkspace'
import { dashboardMetrics, readDashboard } from '@/services/dashboard'
import type { Dashboard, Metric } from '@/services/dashboard'
const admin = useAdminStore()
const range = ref<'month' | 'year'>('month')
const chartMode = ref<'users' | Metric>('users')
const chartKeys = computed<Metric[]>(() =>
  chartMode.value === 'users' ? ['registered_users', 'verified_users'] : [chartMode.value],
)
const chartMaximum = computed(() =>
  Math.max(
    1,
    ...(data.value?.series.flatMap((point) => chartKeys.value.map((key) => point[key])) ?? []),
  ),
)
const shortcuts = computed(() =>
  menu.filter(
    (item) =>
      ['/identity', '/moderation', '/matchmaking', '/resources', '/crisis'].includes(item.path) &&
      canAccessMenu(item),
  ),
)
const metricIcons: Record<Metric, string> = {
  registered_users: 'user',
  verified_users: 'shield',
  new_users: 'star',
  resources: 'book',
  wishes: 'fish',
  fulfilled_wishes: 'heart',
}
function metricIcon(key: Metric) {
  return new URL(`../assets/icons/${metricIcons[key]}.svg`, import.meta.url).href
}
const data = ref<Dashboard | null>(null)
const busy = ref(false)
const hotRevision = ref(0)
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
function changeRange(value: 'month' | 'year') {
  range.value = value
  void load()
}
function refresh() {
  hotRevision.value++
  return load()
}
function position(index: number) {
  return 36 + (index * 488) / Math.max(1, (data.value?.series.length ?? 0) - 1)
}
function points(key: Metric) {
  return data.value?.series
    .map((point, index) => `${position(index)},${146 - (point[key] / chartMaximum.value) * 120}`)
    .join(' ')
}
function dateLabel(date?: string) {
  return date ? (data.value?.range === 'year' ? date.slice(0, 7) : date.slice(5)) : ''
}
onMounted(load)
const { feedback: readFeedback, run: runRead } = useOperationFeedback(() => Boolean(error.value))
</script>
<template>
  <FloatingNotice
    v-if="readFeedback.message"
    :message="readFeedback.message"
    :tone="readFeedback.tone"
    :revision="readFeedback.revision"
  />
  <main class="experience-page dashboard" aria-label="首页">
    <WorkspaceHeading title="数据总览" description="看见每一份心愿，照顾每一次相遇。"
      ><button class="business-primary" :disabled="busy" @click="runRead(refresh, '查询已完成')">
        刷新数据
      </button></WorkspaceHeading
    >
    <FloatingNotice v-if="error" :message="error" tone="error" />
    <p v-if="busy" role="status">正在读取统计…</p>
    <template v-if="data">
      <section class="metric-cards" aria-label="核心统计">
        <article
          v-for="(label, key) in dashboardMetrics"
          :key="key"
          class="metric-card experience-panel"
        >
          <span class="metric-icon"
            ><img :src="metricIcon(key)" alt="" width="17" height="17"
          /></span>
          <h2>{{ key === 'new_users' ? '最近一月新增用户' : label }}</h2>
          <strong>{{ data.summary[key].toLocaleString('zh-CN') }}</strong>
        </article>
      </section>
      <div class="dashboard-main">
        <section class="trend-chart experience-panel" aria-label="变化趋势">
          <div class="dashboard-heading">
            <div>
              <h2>
                {{ chartMode === 'users' ? '用户增长趋势' : dashboardMetrics[chartMode] + '趋势' }}
              </h2>
              <p class="experience-muted">
                北京时间 · {{ chartMode === 'new_users' ? '各期新增数量' : '期末累计数量' }}
              </p>
            </div>
            <div class="dashboard-ranges" role="group" aria-label="时间范围">
              <button
                :aria-pressed="range === 'month'"
                :disabled="busy"
                @click="changeRange('month')"
              >
                最近一月</button
              ><button
                :aria-pressed="range === 'year'"
                :disabled="busy"
                @click="changeRange('year')"
              >
                最近一年
              </button>
            </div>
          </div>
          <svg viewBox="0 0 560 210" role="img" aria-label="统计变化趋势图">
            <path d="M36 26V146H524" class="chart-axis" />
            <path d="M36 66H524M36 106H524" class="chart-grid" />
            <text x="30" y="30" text-anchor="end">{{ chartMaximum }}</text>
            <text x="30" y="150" text-anchor="end">0</text>
            <text x="36" y="172">{{ dateLabel(data.series[0]?.date) }}</text>
            <text x="524" y="172" text-anchor="end">{{ dateLabel(data.series.at(-1)?.date) }}</text>
            <g
              v-for="(key, index) in chartKeys"
              :key="key"
              :class="index ? 'chart-secondary' : 'chart-primary'"
            >
              <polyline :points="points(key)" class="chart-line" />
              <circle
                v-for="(point, pointIndex) in data.series"
                :key="point.date"
                :cx="position(pointIndex)"
                :cy="146 - (point[key] / chartMaximum) * 120"
                r="2.5"
                class="chart-point"
              >
                <title>{{ dashboardMetrics[key] }} · {{ point.date }}：{{ point[key] }}</title>
              </circle>
            </g>
          </svg>
          <div class="chart-key">
            <span v-for="(key, index) in chartKeys" :key="key" :class="{ secondary: index > 0 }">{{
              dashboardMetrics[key]
            }}</span>
          </div>
          <details>
            <summary>查看其他指标与数据说明</summary>
            <label
              >趋势指标<select v-model="chartMode">
                <option value="users">注册与认证用户</option>
                <option v-for="(label, key) in dashboardMetrics" :key="key" :value="key">
                  {{ label }}
                </option>
              </select></label
            >
            <p>{{ data.history_note }}</p>
            <p>新增用户按日或月统计，其他曲线展示各期末累计数量。</p>
            <div class="business-table">
              <table>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th v-for="(label, key) in dashboardMetrics" :key="key">{{ label }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="point in data.series" :key="point.date">
                    <td>{{ dateLabel(point.date) }}</td>
                    <td v-for="(_, key) in dashboardMetrics" :key="key">{{ point[key] }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <section class="experience-panel work-panel">
          <h2>常用工作入口</h2>
          <p class="experience-muted">有序处理每一次期待</p>
          <nav aria-label="常用工作入口">
            <RouterLink v-for="item in shortcuts" :key="item.path" :to="item.path"
              ><span>{{ item.title }}</span
              ><span aria-hidden="true">→</span></RouterLink
            >
          </nav>
          <p v-if="!shortcuts.length" class="experience-muted">当前岗位暂无常用工作入口。</p>
        </section>
      </div>
    </template>
    <div class="hot-lists">
      <DashboardHotList
        kind="wish"
        title="心愿热点 TOP 10"
        :revision="hotRevision"
      /><DashboardHotList kind="whisper" title="悄悄话热点 TOP 10" :revision="hotRevision" />
    </div>
  </main>
</template>
<style scoped>
.dashboard {
  display: grid;
  gap: 24px;
}
.metric-cards {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
}
.metric-card {
  padding: 20px 18px;
  min-width: 0;
}
.metric-card:first-child {
  border-top: 3px solid var(--accent-color);
  padding-top: 18px;
}
.metric-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--selected-surface);
  margin-bottom: 16px;
}
.metric-card h2 {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 400;
  margin: 0 0 8px;
}
.metric-card strong {
  font-size: 27px;
  font-variant-numeric: tabular-nums;
}
.dashboard-main {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(260px, 1fr);
  gap: 22px;
}
.dashboard-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
h2 {
  font-size: 15px;
  margin: 0;
}
.dashboard-heading p,
.work-panel > p {
  margin-block: 6px 20px;
}
.dashboard-ranges {
  display: flex;
  background: var(--page-background);
  border-radius: 8px;
  padding: 3px;
}
.dashboard-ranges button {
  border: 0;
  font-size: 10px;
  padding: 5px 9px;
  min-height: 28px;
  background: transparent;
}
.dashboard-ranges button[aria-pressed='true'] {
  color: var(--accent-color);
  background: var(--surface);
}
svg {
  display: block;
  width: 100%;
  min-height: 220px;
  overflow: visible;
}
svg text {
  fill: var(--text-secondary);
  font-size: 10px;
}
.chart-axis,
.chart-grid {
  stroke: var(--border-color);
  fill: none;
}
.chart-grid {
  stroke-dasharray: 4 5;
}
.chart-line {
  stroke: var(--accent-color);
  stroke-width: 2.6;
  fill: none;
  stroke-linejoin: round;
}
.chart-point {
  fill: var(--accent-color);
}
.chart-secondary .chart-line {
  stroke: #287c69;
}
.chart-secondary .chart-point {
  fill: #287c69;
}
.chart-key {
  display: flex;
  justify-content: center;
  gap: 20px;
  font-size: 10px;
  color: var(--text-secondary);
}
.chart-key span::before {
  content: '';
  display: inline-block;
  width: 13px;
  height: 3px;
  background: var(--accent-color);
  margin-right: 7px;
  vertical-align: middle;
}
.chart-key .secondary::before {
  background: #287c69;
}
details {
  margin-top: 20px;
}
summary {
  cursor: pointer;
  color: var(--text-secondary);
}
details label {
  margin-top: 16px;
}
.work-panel nav {
  display: grid;
  gap: 10px;
}
.work-panel a {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  text-decoration: none;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
}
.work-panel a:hover {
  background: var(--selected-surface);
  border-color: var(--accent-color);
}
.hot-lists {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}
@media (max-width: 1150px) {
  .metric-cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .metric-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .dashboard-main,
  .hot-lists {
    grid-template-columns: 1fr;
  }
}
</style>
