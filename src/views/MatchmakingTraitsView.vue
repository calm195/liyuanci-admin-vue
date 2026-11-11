<script setup lang="ts">
import FloatingNotice from '@/components/FloatingNotice.vue'
import TraitWordCloud from '@/components/TraitWordCloud.vue'
import { useMatchmakingTraits } from '@/composables/useMatchmakingTraits'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import { traitStatusLabels } from '@/types/matchmaking-traits'
const {
  filters,
  rows,
  cloud,
  total,
  cloudTotal,
  page,
  mode,
  detail,
  reason,
  busy,
  writing,
  error,
  notice,
  pending,
  workspace,
  locked,
  search,
  turn,
  inspect,
  retry,
  decide,
} = useMatchmakingTraits()
const { feedback, run } = useOperationFeedback(() => !!error.value)
function time(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.valueOf())
    ? date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '未记录'
}
</script>
<template>
  <main class="traits-page">
    <template v-if="workspace.allowed()">
      <header>
        <div>
          <h1>特质标签</h1>
          <p>查看个人特质与理想型特质的使用情况，审核新词条。</p>
        </div>
        <RouterLink to="/matchmaking">返回活动维护</RouterLink>
      </header>
      <FloatingNotice v-if="error" :message="error" tone="error" />
      <FloatingNotice v-if="notice" :message="notice" tone="success" />
      <FloatingNotice
        v-if="feedback.message"
        :message="feedback.message"
        :tone="feedback.tone"
        :revision="feedback.revision"
      />
      <section v-if="pending" class="alert" aria-label="待确认审核">
        <p>审核结果尚未确认。原请求已保留，重试不会重复提交另一项审核。</p>
        <button :disabled="busy || writing" @click="retry">原样重试</button>
      </section>
      <p v-if="error" role="alert">{{ error }}</p>
      <form class="filters" @submit.prevent="run(search, '筛选结果已更新')">
        <fieldset :disabled="locked">
          <label
            >搜索词条<input
              v-model="filters.q"
              type="search"
              maxlength="80"
              placeholder="输入特质关键词"
          /></label>
          <label
            >选用者性别<select v-model="filters.gender">
              <option value="">全部性别</option>
              <option value="male">男生</option>
              <option value="female">女生</option>
              <option value="undisclosed">未设置</option>
            </select></label
          >
          <label
            >审核状态<select v-model="filters.status">
              <option value="approved">已通过</option>
              <option value="pending">待审核</option>
              <option value="rejected">已驳回</option>
            </select></label
          >
          <label
            >最低热度<input
              v-model="filters.min_heat"
              type="number"
              min="0"
              step="1"
              placeholder="不限"
          /></label>
          <label
            >最高热度<input
              v-model="filters.max_heat"
              type="number"
              min="0"
              step="1"
              placeholder="不限"
          /></label>
          <label
            >热度排序<select v-model="filters.sort">
              <option value="heat_desc">从高到低</option>
              <option value="heat_asc">从低到高</option>
            </select></label
          >
          <label
            >标签用途<select v-model="filters.purpose">
              <option value="all">全部用途</option>
              <option value="personal">个人特质</option>
              <option value="ideal">理想型特质</option>
            </select></label
          >
          <button type="submit" class="business-primary">查询</button>
        </fieldset>
      </form>
      <p class="explanation">
        性别指选择标签的用户。热度为当前选择人数，同一用户在全部用途下使用同一词条只计一次；移除标签后不再计入。修改条件后点击查询。
      </p>
      <p v-if="busy || writing" role="status">{{ writing ? '正在提交审核…' : '正在读取…' }}</p>
      <section class="results" aria-label="特质统计">
        <div class="result-heading">
          <h2>共 {{ total }} 个词条</h2>
          <div class="switch">
            <button :aria-pressed="mode === 'list'" @click="mode = 'list'">标签列表</button
            ><button :aria-pressed="mode === 'cloud'" @click="mode = 'cloud'">热度词云</button>
          </div>
        </div>
        <template v-if="mode === 'list'">
          <div v-if="rows.length" class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>词条</th>
                  <th>状态</th>
                  <th>筛选热度</th>
                  <th>男生 / 女生 / 未设置</th>
                  <th>创建时间（北京）</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.id">
                  <td>{{ row.name }}</td>
                  <td>{{ traitStatusLabels[row.status] }}</td>
                  <td>{{ row.heat }} 人</td>
                  <td>
                    {{ row.male_count }} / {{ row.female_count }} / {{ row.undisclosed_count }}
                  </td>
                  <td>{{ time(row.created_at) }}</td>
                  <td>
                    <button
                      :disabled="locked"
                      @click="run(() => inspect(row.id), '词条详情已读取')"
                    >
                      {{ row.status === 'pending' ? '查看与审核' : '查看详情' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else-if="!busy">没有符合条件的词条，请调整筛选。</p>
          <nav class="pagination" aria-label="词条分页">
            <button :disabled="locked || page <= 1" @click="run(() => turn(-1), '已切换上一页')">
              上一页</button
            ><span>第 {{ page }} 页</span
            ><button
              :disabled="locked || page * 20 >= total"
              @click="run(() => turn(1), '已切换下一页')"
            >
              下一页
            </button>
          </nav>
        </template>
        <template v-else
          ><p>
            当前筛选匹配 {{ cloudTotal }} 个词条，按所选热度顺序展示前 {{ cloud.length }} 个（最多
            100 个），不受列表分页影响。字号越大，选择人数越多。
          </p>
          <TraitWordCloud v-if="cloud.length" :items="cloud" />
          <p v-else-if="!busy">暂无可展示的词云。</p></template
        >
      </section>
      <section v-if="detail" class="review" aria-label="词条审核详情">
        <div class="result-heading">
          <h2>{{ detail.name }}</h2>
          <button :disabled="locked" @click="detail = null">关闭详情</button>
        </div>
        <p>状态：{{ traitStatusLabels[detail.status] }} · 版本 {{ detail.version }}</p>
        <p v-if="detail.reason">审核说明：{{ detail.reason }}</p>
        <p v-if="detail.reviewed_at">审核时间：{{ time(detail.reviewed_at) }}</p>
        <h3>词库命中依据</h3>
        <ul v-if="detail.evidence.matches.length">
          <li v-for="(match, index) in detail.evidence.matches" :key="index">
            {{ match.word }} · {{ match.label || match.kind }} · 来源 {{ match.source }} ·
            {{ match.disposition }}
          </li>
        </ul>
        <p v-else>无词库命中记录。</p>
        <p v-if="detail.evidence.truncated">命中记录较多，此处显示部分依据。</p>
        <template v-if="detail.status === 'pending'"
          ><label class="reason"
            >审核说明（驳回必填）<textarea
              v-model="reason"
              maxlength="500"
              rows="3"
              :disabled="locked"
            />
          </label>
          <div class="review-actions">
            <button class="business-primary" :disabled="locked" @click="decide('approved')">
              通过审核</button
            ><button :disabled="locked" @click="decide('rejected')">驳回词条</button>
          </div></template
        >
      </section>
    </template>
    <p v-else>当前会话无权查看特质，请重新登录或联系管理员。</p>
  </main>
</template>
<style scoped>
.traits-page {
  display: grid;
  gap: 1rem;
  max-width: 1440px;
  margin: auto;
  padding: 1.5rem;
}
header,
.result-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
h1,
h2,
h3,
p {
  margin: 0 0 0.65rem;
}
h1 {
  font-size: 1.8rem;
}
h2 {
  font-size: 1.2rem;
}
.filters,
.results,
.review {
  padding: 1.25rem;
  border: 1px solid var(--border-color, #dce3df);
  border-radius: 1rem;
  background: var(--bg-surface, #fff);
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: end;
  gap: 0.8rem;
  flex-wrap: wrap;
  min-width: 0;
}
label {
  display: grid;
  gap: 0.4rem;
  font-size: 0.9rem;
  flex: 1 1 130px;
}
input,
select,
textarea {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid #bdcbc4;
  border-radius: 0.5rem;
  padding: 0.6rem;
  background: var(--bg-surface, #fff);
  color: inherit;
  font: inherit;
}
button {
  padding: 0.6rem 0.9rem;
  border: 1px solid #bdcbc4;
  border-radius: 0.5rem;
  cursor: pointer;
  font: inherit;
  background: white;
  color: #174d43;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
button[aria-pressed='true'],
.business-primary {
  background: #176b68;
  color: white;
  border-color: #176b68;
}
.explanation {
  color: var(--text-secondary, #53695f);
  font-size: 0.9rem;
  line-height: 1.65;
}
.switch,
.pagination,
.review-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.pagination {
  justify-content: flex-end;
  margin-top: 1rem;
}
.table-scroll {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
th,
td {
  padding: 0.8rem;
  border-bottom: 1px solid #e1e8e4;
  white-space: nowrap;
}
th {
  font-size: 0.85rem;
  color: #53695f;
}
td:first-child {
  white-space: normal;
  min-width: 6rem;
  overflow-wrap: anywhere;
}
.alert {
  padding: 1rem;
  background: #fff5db;
  border-radius: 0.7rem;
}
.reason {
  margin: 1rem 0;
}
.review li {
  margin-bottom: 0.5rem;
  overflow-wrap: anywhere;
}
@media (max-width: 640px) {
  .traits-page {
    padding: 0.75rem;
  }
  .filters,
  .results,
  .review {
    padding: 0.8rem;
  }
}
</style>
