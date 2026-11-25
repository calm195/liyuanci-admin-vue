<script setup lang="ts">
import NumberedPagination from '@/components/NumberedPagination.vue'
import { useAutoSearch } from '@/composables/useAutoSearch'
import FloatingNotice from '@/components/FloatingNotice.vue'
import TraitWordCloud from '@/components/TraitWordCloud.vue'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import { useMatchmakingTraits } from '@/composables/useMatchmakingTraits'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import { traitCategories, traitCategoryLabels, traitStatusLabels } from '@/types/matchmaking-traits'
import { displayBeijingTime } from '@/utils/admin-time'
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
  editorOpen,
  management,
  create,
  edit,
  close,
  save,
} = useMatchmakingTraits()
const { feedback, run } = useOperationFeedback(() => !!error.value)
const automaticSearch = useAutoSearch(search, () => !editorOpen.value)
</script>

<template>
  <main class="traits-page experience-page">
    <template v-if="workspace.allowed()">
      <WorkspaceHeading title="特质标签" description="按分类整理表达，审核新词并管理可选范围。">
        <button class="business-primary" :disabled="locked" @click="create">新增词条</button>
      </WorkspaceHeading>
      <FloatingNotice v-if="error" :message="error" tone="error" />
      <FloatingNotice v-if="notice" :message="notice" tone="success" />
      <FloatingNotice
        v-if="feedback.message"
        :message="feedback.message"
        :tone="feedback.tone"
        :revision="feedback.revision"
      />
      <section
        v-if="pending && !detail && !editorOpen"
        class="experience-panel"
        aria-label="待确认操作"
      >
        <p>操作结果尚未确认。原请求已保留，重试不会创建另一项操作。</p>
        <button :disabled="busy || writing" @click="retry">原样重试</button>
      </section>
      <section class="experience-panel experience-table-panel" aria-label="特质统计">
        <form
          @input="automaticSearch.input"
          @change="automaticSearch.change"
          @compositionstart="automaticSearch.start"
          @compositionend="automaticSearch.end"
          @submit="automaticSearch.cancel"
          @submit.prevent="run(search, '筛选结果已更新')"
        >
          <fieldset class="experience-filters" :disabled="locked">
            <label class="trait-search"
              >词条名称<input
                v-model="filters.q"
                type="search"
                maxlength="80"
                placeholder="搜索特质"
            /></label>
            <label
              >用途<select v-model="filters.purpose" name="purpose">
                <option value="all">全部用途</option>
                <option value="personal">个人特质</option>
                <option value="ideal">理想型特质</option>
              </select></label
            >
            <label
              >分类<select v-model="filters.category" name="category">
                <option value="">全部分类</option>
                <option v-for="category in traitCategories" :key="category" :value="category">
                  {{ traitCategoryLabels[category] }}
                </option>
              </select></label
            >
            <label
              >审核状态<select v-model="filters.status">
                <option value="approved">已通过</option>
                <option value="pending">待审核</option>
                <option value="rejected">已驳回</option>
              </select></label
            >
            <button type="submit" class="business-primary">查询</button>
          </fieldset>
          <details class="trait-advanced">
            <summary>更多筛选</summary>
            <fieldset class="experience-filters" :disabled="locked">
              <label
                >是否可选<select v-model="filters.enabled">
                  <option value="">全部</option>
                  <option value="true">已启用</option>
                  <option value="false">已停用</option>
                </select></label
              >
              <label
                >选用者性别<select v-model="filters.gender" name="gender">
                  <option value="">全部性别</option>
                  <option value="male">男生</option>
                  <option value="female">女生</option>
                  <option value="undisclosed">未设置</option>
                </select></label
              >
              <label
                >最低热度<input
                  v-model="filters.min_heat"
                  name="min_heat"
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
            </fieldset>
          </details>
        </form>
        <p v-if="busy || writing" role="status">{{ writing ? '正在提交操作…' : '正在读取…' }}</p>
        <p v-if="error && !detail && !editorOpen" role="alert">{{ error }}</p>
        <template v-if="mode === 'list'">
          <div v-if="rows.length" class="business-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">词条</th>
                  <th scope="col">分类</th>
                  <th scope="col">审核状态</th>
                  <th scope="col">可选状态</th>
                  <th scope="col">使用人数</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.id">
                  <td>
                    <strong>{{ row.name }}</strong>
                  </td>
                  <td>{{ traitCategoryLabels[row.category ?? 'uncategorized'] }}</td>
                  <td>
                    <span class="experience-badge" :data-status="row.status">{{
                      traitStatusLabels[row.status]
                    }}</span>
                  </td>
                  <td>
                    {{
                      row.enabled === false
                        ? '已停用'
                        : row.status === 'approved'
                          ? '可选用'
                          : row.status === 'pending'
                            ? '待审核'
                            : '不可选用'
                    }}
                  </td>
                  <td>{{ row.heat }} 人</td>
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
          <p v-else-if="!busy" class="experience-empty">没有符合条件的词条，请调整筛选。</p>
          <NumberedPagination
            :page="page"
            :page-size="20"
            :total="total"
            fixed-size
            :disabled="locked"
            @turn="turn"
          />
        </template>
      </section>
      <section class="experience-panel trait-cloud-panel">
        <div class="trait-cloud-heading">
          <h2>大家如何描述自己</h2>
          <div class="trait-switch">
            <button :aria-pressed="mode === 'list'" @click="mode = 'list'">标签列表</button
            ><button :aria-pressed="mode === 'cloud'" @click="mode = 'cloud'">热度词云</button>
          </div>
        </div>
        <p class="experience-muted">
          当前筛选匹配 {{ cloudTotal }} 个词条，展示前 {{ cloud.length }} 个（最多 100
          个），字号表示真实使用人数。
        </p>
        <TraitWordCloud v-if="cloud.length" :items="cloud" />
        <p v-else-if="!busy" class="experience-empty">暂无可展示的词云。</p>
        <p class="experience-muted trait-count-note">
          热度为当前选择人数；同一用户在全部用途下使用同一词条只计一次。分类不改变配对评分。
        </p>
      </section>
      <WorkspaceDrawer
        :open="!!detail || editorOpen"
        :title="editorOpen ? (detail ? '维护特质' : '新增词条') : (detail?.name ?? '特质详情')"
        :busy="writing"
        :dirty="pending ? false : undefined"
        @close="close"
      >
        <p v-if="error" role="alert" class="experience-inline-error">{{ error }}</p>
        <section v-if="pending" aria-label="待确认操作" class="trait-pending">
          <p>操作结果尚未确认，原请求已保留。</p>
          <button :disabled="busy || writing" @click="retry">原样重试</button>
        </section>
        <form v-if="editorOpen" id="trait-editor" class="trait-editor" @submit.prevent="save">
          <fieldset :disabled="locked">
            <label
              >词条名称<input
                v-model="management.name"
                :disabled="!!detail"
                maxlength="20"
                required
            /></label>
            <label
              >特质分类<select v-model="management.category">
                <option v-for="category in traitCategories" :key="category" :value="category">
                  {{ traitCategoryLabels[category] }}
                </option>
              </select></label
            >
            <label v-if="detail" class="trait-check"
              ><input v-model="management.enabled" type="checkbox" />允许新选择</label
            >
            <p v-if="detail" class="experience-muted">
              停用后保留历史资料与报名记录，审核结论保持不变。
            </p>
            <label
              >维护理由<textarea v-model="management.reason" maxlength="500" rows="4" required />
            </label>
          </fieldset>
        </form>
        <template v-else-if="detail">
          <section class="experience-section">
            <div class="trait-detail-meta">
              <span class="experience-badge" :data-status="detail.status">{{
                traitStatusLabels[detail.status]
              }}</span
              ><span>{{ traitCategoryLabels[detail.category ?? 'uncategorized'] }}</span
              ><span>{{
                detail.enabled === false
                  ? '已停用'
                  : detail.status === 'approved'
                    ? '可选用'
                    : detail.status === 'pending'
                      ? '通过审核后可选用'
                      : '不可选用'
              }}</span>
            </div>
            <p class="experience-muted">当前版本 {{ detail.version }} · {{ detail.heat }} 人选用</p>
            <p class="experience-muted">
              男 {{ detail.male_count }} / 女 {{ detail.female_count }} / 未设置
              {{ detail.undisclosed_count }}
            </p>
            <p class="experience-muted">创建时间：{{ displayBeijingTime(detail.created_at) }}</p>
            <p v-if="detail.reason">审核说明：{{ detail.reason }}</p>
            <p v-if="detail.reviewed_at" class="experience-muted">
              审核时间：{{ displayBeijingTime(detail.reviewed_at) }}
            </p>
          </section>
          <section class="experience-section">
            <h3>词库命中依据</h3>
            <ul v-if="detail.evidence.matches.length" class="trait-evidence">
              <li v-for="(match, index) in detail.evidence.matches" :key="index">
                <strong>{{ match.word }}</strong>
                <p>
                  {{ match.label || match.kind }} · 来源 {{ match.source }} ·
                  {{ match.disposition }}
                </p>
              </li>
            </ul>
            <p v-else class="experience-muted">无词库命中记录。</p>
            <p v-if="detail.evidence.truncated" class="experience-muted">
              命中记录较多，此处显示部分依据。
            </p>
          </section>
          <section v-if="detail.status === 'pending'" class="experience-section">
            <label class="trait-reason"
              >审核说明（驳回必填）<textarea
                v-model="reason"
                maxlength="500"
                rows="4"
                :disabled="locked"
              />
            </label>
          </section>
        </template>
        <template #footer
          ><div class="drawer-actions">
            <button data-overlay-close :disabled="writing" @click="close">关闭详情</button>
            <template v-if="editorOpen"
              ><button
                form="trait-editor"
                type="submit"
                class="business-primary"
                :disabled="locked"
              >
                保存特质
              </button></template
            >
            <template v-else-if="detail"
              ><button
                :class="{ 'business-primary': detail.status !== 'pending' }"
                :disabled="locked"
                @click="edit"
              >
                维护词条</button
              ><template v-if="detail.status === 'pending'"
                ><button :disabled="locked" @click="decide('rejected')">驳回词条</button
                ><button class="business-primary" :disabled="locked" @click="decide('approved')">
                  通过审核
                </button></template
              ></template
            >
          </div></template
        >
      </WorkspaceDrawer>
    </template>
    <p v-else role="alert">当前会话无权查看特质，请重新登录或联系管理员。</p>
  </main>
</template>

<style scoped>
.traits-page {
  max-width: 1440px;
  margin: auto;
}
fieldset {
  min-width: 0;
  border: 0;
  padding: 0;
  margin: 0;
}
.trait-search {
  flex: 1;
  min-width: 180px;
}
.trait-advanced {
  margin-top: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}
.trait-advanced summary {
  cursor: pointer;
  width: fit-content;
}
.trait-advanced fieldset {
  margin-top: 16px;
}
.trait-advanced input {
  max-width: 120px;
}
.trait-switch {
  display: flex;
}
.trait-switch button {
  border-radius: 0;
}
.trait-switch button:first-child {
  border-radius: 8px 0 0 8px;
}
.trait-switch button:last-child {
  border-radius: 0 8px 8px 0;
  margin-left: -1px;
}
.trait-switch [aria-pressed='true'] {
  background: var(--selected-surface);
  color: var(--accent-color);
}
.trait-cloud-panel h2 {
  font-size: 18px;
  margin: 0 0 12px;
}
.trait-count-note {
  margin: 20px 0 0;
}
.trait-editor fieldset,
.trait-editor label,
.trait-reason {
  display: grid;
  gap: 8px;
}
.trait-editor fieldset {
  gap: 20px;
}
.trait-editor label {
  margin: 0;
}
.trait-editor :is(input, select, textarea),
.trait-reason textarea {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  font: inherit;
  border: 1px solid var(--control-border);
  border-radius: 8px;
}
.trait-editor select {
  margin: 0;
}
.trait-editor .trait-check {
  display: flex;
  align-items: center;
}
.trait-check input {
  width: auto;
  min-height: auto;
}
.trait-detail-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.trait-evidence {
  list-style: none;
  padding: 0;
}
.trait-evidence li {
  padding: 12px 16px;
  background: var(--surface-muted);
  border-radius: 8px;
  margin-bottom: 8px;
}
.trait-evidence p {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 4px 0 0;
}
.trait-pending {
  padding: 16px;
  background: var(--warning-surface);
  color: var(--warning-text);
  border-radius: 8px;
  margin-bottom: 20px;
}

.trait-cloud-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.trait-cloud-heading h2 {
  margin: 0;
}
</style>
