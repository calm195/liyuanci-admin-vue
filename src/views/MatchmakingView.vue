<script setup lang="ts">
import FloatingNotice from '@/components/FloatingNotice.vue'
import MatchmakingProfile from '@/components/MatchmakingProfile.vue'
import { activityDateFields, useMatchmaking } from '@/composables/useMatchmaking'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import { phaseLabels, enrollmentLabels, pairLabels } from '@/types/matchmaking'
const {
  activities,
  total,
  listPage,
  detailPage,
  selected,
  detail,
  candidates,
  source,
  review,
  ending,
  form,
  templates,
  reason,
  busy,
  writing,
  pending,
  error,
  notice,
  conflict,
  tab,
  workspace,
  locked,
  canNext,
  canReview,
  canPair,
  canEditTemplates,
  refresh,
  open,
  create,
  listTurn,
  detailTurn,
  runPending,
  saveActivity,
  activityAction,
  inspect,
  decide,
  recommend,
  pair,
  prepareEnd,
  endPair,
  libraryOpen,
  choosingFirst,
  libraryTasks,
  libraryPage,
  libraryTotal,
  libraryEditID,
  libraryForm,
  showLibrary,
  hideLibrary,
  libraryTurn,
  editLibraryTask,
  saveLibraryTask,
  chooseFirstTask,
  addTemplate,
  saveTemplates,
} = useMatchmaking()
const { feedback, run: runRead } = useOperationFeedback(() => !!error.value)
const tabs = [
  { key: 'activity', label: '活动设置' },
  { key: 'enrollments', label: '报名与配对' },
  { key: 'pairs', label: '配对记录' },
  { key: 'tasks', label: '每日任务' },
] as const
function time(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
</script>
<template>
  <main class="panel matchmaking-workspace" aria-label="包分配活动管理">
    <template v-if="workspace.allowed()">
      <div class="match-heading">
        <div>
          <h1>包分配活动</h1>
          <p>审核报名，安排配对，让每一次相遇都有准备。</p>
        </div>
        <div class="match-actions">
          <button class="business-primary" :disabled="locked" @click="create">新建活动</button>
          <button v-if="!libraryOpen" :disabled="locked" @click="runRead(() => showLibrary())">
            每日任务库
          </button>
          <button :disabled="locked" @click="runRead(refresh, '活动状态已刷新')">重新读取</button>
        </div>
      </div>
      <FloatingNotice v-if="error" :message="error" tone="error" />
      <FloatingNotice v-if="notice" :message="notice" tone="success" />
      <FloatingNotice
        v-if="feedback.message"
        :message="feedback.message"
        :tone="feedback.tone"
        :revision="feedback.revision"
      />
      <section v-if="pending" class="match-alert" aria-label="待确认操作">
        <p>
          {{ pending.title }}的结果尚未确认，表单已锁定。重试会使用同一份内容，不会创建另一项操作。
        </p>
        <button :disabled="writing || busy" @click="runPending">原样重试</button>
      </section>
      <p v-if="conflict" role="alert">当前数据已变化，请点击“重新读取”，核对后再操作。</p>
      <p v-if="busy || writing" role="status">
        {{ writing ? '正在提交，请稍候…' : '正在读取活动…' }}
      </p>
      <section v-if="libraryOpen" aria-label="每日任务库" class="match-section">
        <div class="match-heading">
          <div>
            <h2>每日任务库</h2>
            <p v-if="choosingFirst">为 {{ detail?.activity.title }} 选择固定首日任务。</p>
            <p>最早可分配日填 0 时无额外限制。首日可用的启用任务可设为活动的固定首日任务。</p>
          </div>
          <button :disabled="locked" @click="runRead(hideLibrary)">返回活动</button>
        </div>
        <form @submit.prevent="saveLibraryTask">
          <fieldset :disabled="locked || conflict">
            <legend>{{ libraryEditID ? '编辑任务' : '新建任务' }}</legend>
            <div class="match-form-grid">
              <label
                >任务类型
                <select v-model="libraryForm.kind">
                  <option value="online">线上</option>
                  <option value="offline">线下</option>
                </select>
              </label>
              <label
                >最早可分配日
                <input
                  v-model.number="libraryForm.min_day"
                  type="number"
                  min="0"
                  max="30"
                  required
                />
              </label>
            </div>
            <label
              >任务内容
              <textarea v-model="libraryForm.body" required maxlength="1000" rows="3" />
            </label>
            <label class="match-check"
              ><input v-model="libraryForm.enabled" type="checkbox" />启用任务</label
            >
            <div class="match-actions">
              <button type="submit" class="business-primary">保存任务</button>
              <button v-if="libraryEditID" type="button" @click="editLibraryTask()">
                新建任务
              </button>
            </div>
          </fieldset>
        </form>
        <p v-if="!busy && !libraryTasks.length">暂无任务，请先新建。</p>
        <article v-for="task in libraryTasks" :key="task.id" class="match-card">
          <p class="match-task-body">{{ task.body }}</p>
          <p>
            {{ task.kind === 'online' ? '线上' : '线下' }} ·
            {{ task.min_day ? `第 ${task.min_day} 天起` : '无天数限制' }} ·
            {{ task.enabled ? '已启用' : '已停用' }}
          </p>
          <div class="match-actions">
            <button :disabled="locked" @click="editLibraryTask(task)">编辑任务</button>
            <button
              v-if="choosingFirst"
              :disabled="
                locked || conflict || !canEditTemplates || !task.enabled || task.min_day > 1
              "
              @click="chooseFirstTask(task)"
            >
              设为固定首日任务
            </button>
          </div>
        </article>
        <div class="match-pagination" aria-label="每日任务库分页">
          <button :disabled="locked || libraryPage <= 1" @click="runRead(() => libraryTurn(-1))">
            上一页
          </button>
          <span>第 {{ libraryPage }} 页</span>
          <button
            :disabled="locked || libraryPage * 20 >= libraryTotal"
            @click="runRead(() => libraryTurn(1))"
          >
            下一页
          </button>
        </div>
      </section>
      <div v-else class="match-layout">
        <aside class="match-activities" aria-label="活动列表">
          <h2>
            活动列表 <small>{{ total }}</small>
          </h2>
          <p v-if="!activities.length && !busy">暂无活动，可先创建草稿。</p>
          <button
            v-for="activity in activities"
            :key="activity.id"
            class="match-activity"
            :disabled="locked"
            :aria-current="selected === activity.id ? 'true' : undefined"
            @click="runRead(() => open(activity.id), '活动详情已读取')"
          >
            <strong>{{ activity.title }}</strong
            ><span>{{ phaseLabels[activity.phase] }}</span
            ><small>报名截止 {{ time(activity.registration_closes_at) }}</small>
          </button>
          <div class="match-pagination" aria-label="活动列表分页">
            <button :disabled="locked || listPage <= 1" @click="runRead(() => listTurn(-1))">
              上一页
            </button>
            <span>第 {{ listPage }} 页</span>
            <button
              :disabled="locked || listPage * 20 >= total"
              @click="runRead(() => listTurn(1))"
            >
              下一页
            </button>
          </div>
        </aside>
        <div class="match-main">
          <div v-if="!selected" class="match-empty">
            <h2>选择一场活动</h2>
            <p>从左侧查看报名和配对，或新建下一场活动。</p>
          </div>
          <template v-else>
            <header v-if="detail" class="match-summary">
              <div>
                <h2>{{ detail.activity.title }}</h2>
                <span class="match-badge">{{ phaseLabels[detail.activity.phase] }}</span>
              </div>
              <p>
                {{ detail.total }} 份报名 · {{ detail.pair_total }} 条配对记录 ·
                {{ detail.activity.days }} 天任务
              </p>
            </header>
            <nav v-if="detail" class="match-tabs" aria-label="活动工作台分页">
              <button
                v-for="item in tabs"
                :key="item.key"
                :disabled="locked"
                :aria-current="tab === item.key ? 'page' : undefined"
                @click="tab = item.key"
              >
                {{ item.label }}
              </button>
            </nav>
            <section
              v-if="tab === 'activity' && (selected === 'new' || detail)"
              aria-label="活动设置"
            >
              <h2>{{ selected === 'new' ? '新建活动草稿' : '活动设置' }}</h2>
              <p>所有时间均为北京时间。活动发布后，名称、说明和时间安排将冻结。</p>
              <form @submit.prevent="saveActivity">
                <fieldset
                  :disabled="
                    locked ||
                    conflict ||
                    (detail?.activity.status !== 'draft' && selected !== 'new')
                  "
                >
                  <label
                    >活动名称<input
                      v-model="form.title"
                      name="title"
                      required
                      maxlength="80"
                      autocomplete="off"
                  /></label>
                  <label
                    >活动说明<textarea
                      v-model="form.description"
                      name="description"
                      required
                      maxlength="2000"
                      rows="5"
                    />
                  </label>
                  <div class="match-form-grid">
                    <label v-for="field in activityDateFields" :key="field.key"
                      >{{ field.label }}（北京时间）<input
                        v-model="form[field.key]"
                        :name="field.key"
                        type="datetime-local"
                        required
                    /></label>
                    <label
                      >任务天数<input
                        v-model.number="form.days"
                        name="days"
                        type="number"
                        required
                        min="1"
                        max="30"
                        step="1"
                    /></label>
                  </div>
                  <button
                    v-if="selected === 'new' || detail?.activity.status === 'draft'"
                    type="submit"
                    class="business-primary"
                  >
                    保存活动草稿
                  </button>
                </fieldset>
              </form>
              <div v-if="detail" class="match-actions match-section">
                <button
                  v-if="detail.activity.status === 'draft'"
                  :disabled="locked || conflict"
                  @click="activityAction('publish')"
                >
                  发布活动
                </button>
                <template v-if="detail.activity.status !== 'cancelled'">
                  <label
                    >取消原因<input
                      v-model="reason"
                      :disabled="locked"
                      maxlength="200"
                      placeholder="说明取消活动的原因"
                  /></label>
                  <button :disabled="locked || conflict" @click="activityAction('cancel')">
                    取消活动
                  </button>
                </template>
              </div>
            </section>
            <section v-if="tab === 'enrollments' && detail" aria-label="报名与配对">
              <h2>报名审核</h2>
              <p>学生认证和本活动资料审核分别管理。通过审核且当前资格有效的报名者才能配对。</p>
              <div class="business-table">
                <table>
                  <caption>
                    本页报名记录
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">姓名</th>
                      <th scope="col">审核状态</th>
                      <th scope="col">配对资格</th>
                      <th scope="col">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in detail.enrollments" :key="row.id">
                      <th scope="row">{{ row.profile?.name ?? '资料不可访问' }}</th>
                      <td>{{ enrollmentLabels[row.status] }}</td>
                      <td>{{ row.eligible ? '可配对' : '暂不可配对' }}</td>
                      <td class="match-actions">
                        <button :disabled="locked || !row.profile" @click="inspect(row)">
                          查看与审核</button
                        ><button
                          :disabled="
                            locked || !canPair || row.status !== 'approved' || !row.eligible
                          "
                          @click="runRead(() => recommend(row), '候选已更新')"
                        >
                          推荐候选
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="!detail.enrollments.length">本页暂无报名记录。</p>
              <section v-if="review" class="match-card" aria-label="报名审核详情">
                <h3>{{ review.profile?.name ?? '报名资料' }}</h3>
                <MatchmakingProfile v-if="review.profile" :profile="review.profile" />
                <p v-if="review.reason">当前说明：{{ review.reason }}</p>
                <label
                  >审核说明<input
                    v-model="reason"
                    :disabled="locked"
                    maxlength="200"
                    placeholder="驳回时必填，说明需要修改的内容"
                /></label>
                <div class="match-actions">
                  <button
                    :disabled="
                      locked ||
                      conflict ||
                      !canReview ||
                      review.status !== 'pending' ||
                      !review.profile
                    "
                    @click="decide('approved')"
                  >
                    通过报名</button
                  ><button
                    :disabled="locked || conflict || !canReview || review.status !== 'pending'"
                    @click="decide('rejected')"
                  >
                    驳回报名</button
                  ><button :disabled="locked" @click="review = null">关闭详情</button>
                </div>
              </section>
              <section v-if="source" class="match-section" aria-label="推荐候选">
                <h3>为 {{ source.profile?.name ?? '所选报名者' }} 推荐</h3>
                <p>分数用于运营参考。配对结果发布且到活动开始时间后，用户才会看到对方资料。</p>
                <p v-if="!busy && !candidates.length">
                  当前没有合格候选。请核对审核状态、配对占用和账号资格。
                </p>
                <article
                  v-for="candidate in candidates"
                  :key="candidate.enrollment.id"
                  class="match-card"
                >
                  <div class="match-heading">
                    <h4>{{ candidate.enrollment.profile?.name ?? '候选人' }}</h4>
                    <strong>{{ candidate.score }} 分</strong>
                  </div>
                  <p class="match-score">
                    MBTI {{ candidate.score_details.mbti }}/30 · 年龄
                    {{ candidate.score_details.age }}/20 · 校区
                    {{ candidate.score_details.campus }}/25 · 身高
                    {{ candidate.score_details.height }}/15 · 体重
                    {{ candidate.score_details.weight }}/10
                  </p>
                  <details v-if="candidate.enrollment.profile">
                    <summary>查看候选资料</summary>
                    <MatchmakingProfile :profile="candidate.enrollment.profile" />
                  </details>
                  <button
                    :disabled="locked || conflict || !canPair || !candidate.enrollment.eligible"
                    @click="pair(candidate)"
                  >
                    与此人配对
                  </button>
                </article>
              </section>
            </section>
            <section v-if="tab === 'pairs' && detail" aria-label="配对记录">
              <div class="match-heading">
                <h2>配对记录</h2>
                <button
                  class="business-primary"
                  :disabled="locked || conflict || !canPair"
                  @click="activityAction('results/publish')"
                >
                  发布全部待发布结果
                </button>
              </div>
              <p>
                最早发布时间：{{
                  time(detail.activity.results_at)
                }}。发布会检查所有待发布配对，并固定每日任务；任何一项不满足条件时整次操作不生效。
              </p>
              <p v-if="!detail.pairs.length">本页暂无配对记录。</p>
              <article v-for="row in detail.pairs" :key="row.id" class="match-card">
                <div class="match-heading">
                  <h3>
                    {{ row.member_names[0] ?? '参与者一' }} <span aria-hidden="true">×</span>
                    {{ row.member_names[1] ?? '参与者二' }}
                  </h3>
                  <span class="match-badge">{{ pairLabels[row.status] }}</span>
                </div>
                <p>
                  推荐分数 {{ row.score }} · MBTI {{ row.score_details.mbti }} / 年龄
                  {{ row.score_details.age }} / 校区 {{ row.score_details.campus }} / 身高
                  {{ row.score_details.height }} / 体重 {{ row.score_details.weight }}
                </p>
                <p v-if="row.reason">解除原因：{{ row.reason }}</p>
                <button v-if="row.status !== 'ended'" :disabled="locked" @click="prepareEnd(row)">
                  解除配对
                </button>
                <form v-if="ending?.id === row.id" class="match-section" @submit.prevent="endPair">
                  <label
                    >解除原因<input v-model="reason" :disabled="locked" required maxlength="200"
                  /></label>
                  <p>解除后双方将无法继续查看对方资料和任务。</p>
                  <div class="match-actions">
                    <button type="submit" :disabled="locked || conflict">确认解除</button
                    ><button type="button" :disabled="locked" @click="ending = null">
                      保留配对
                    </button>
                  </div>
                </form>
              </article>
            </section>
            <section v-if="tab === 'tasks' && detail" aria-label="每日任务模板">
              <h2>每日任务</h2>
              <p>从每日任务库选择固定首日任务。其他日期从当日符合条件的任务中无放回抽取。</p>
              <p v-if="detail.templates_locked" role="status">
                已有配对结果发布，活动任务池与模板已冻结。
              </p>
              <template v-if="detail.task_plan">
                <p>固定首日任务：{{ detail.task_plan.first_task_body || '所选任务当前不可用' }}</p>
                <p v-if="detail.task_plan.missing_day" role="alert">
                  第 {{ detail.task_plan.missing_day }} 天无法分配任务，请检查任务库和首日设置。
                </p>
              </template>
              <button
                v-if="canEditTemplates"
                :disabled="locked || conflict"
                @click="runRead(() => showLibrary(true))"
              >
                {{ detail.task_plan ? '更换固定首日任务' : '选择固定首日任务' }}
              </button>
              <p v-if="!detail.task_plan && detail.templates.length">
                本活动使用旧版专用任务模板。
              </p>
              <form
                v-if="!detail.task_plan && detail.templates.length"
                @submit.prevent="saveTemplates"
              >
                <fieldset :disabled="locked || conflict || !canEditTemplates">
                  <article v-for="(item, index) in templates" :key="index" class="match-card">
                    <h3>任务 {{ index + 1 }}</h3>
                    <div class="match-form-grid">
                      <label
                        >任务类型<select v-model="item.kind">
                          <option value="online">线上</option>
                          <option value="offline">线下</option>
                        </select></label
                      ><label
                        >固定日期<select v-model.number="item.fixed_day">
                          <option :value="0">随机安排</option>
                          <option v-for="day in detail.activity.days" :key="day" :value="day">
                            第 {{ day }} 天
                          </option>
                        </select></label
                      >
                    </div>
                    <label
                      >任务内容<textarea
                        v-model="item.body"
                        required
                        maxlength="1000"
                        rows="3"
                      /></label
                    ><button type="button" @click="templates.splice(index, 1)">移除此任务</button>
                  </article>
                  <div class="match-actions">
                    <button type="button" :disabled="templates.length >= 30" @click="addTemplate">
                      添加任务</button
                    ><button type="submit" class="business-primary">保存任务模板</button>
                  </div>
                </fieldset>
              </form>
            </section>
            <div
              v-if="detail && (tab === 'enrollments' || tab === 'pairs')"
              class="match-pagination"
              aria-label="活动工作台记录分页"
            >
              <button :disabled="locked || detailPage <= 1" @click="runRead(() => detailTurn(-1))">
                上一页</button
              ><span>第 {{ detailPage }} 页 · 每页 20 条</span
              ><button :disabled="locked || !canNext" @click="runRead(() => detailTurn(1))">
                下一页
              </button>
            </div>
          </template>
        </div>
      </div>
    </template>
    <p v-else role="alert">当前会话无权管理包分配活动，请联系管理员。</p>
  </main>
</template>
<style scoped>
.matchmaking-workspace {
  display: grid;
  gap: 1.5rem;
}
.match-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}
.match-heading h1,
.match-heading h2,
.match-heading h3,
.match-heading h4 {
  margin: 0;
}
.match-heading p,
.match-score {
  color: var(--text-secondary);
}
.match-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}
.match-layout {
  display: grid;
  grid-template-columns: minmax(13rem, 17rem) minmax(0, 1fr);
  gap: 1.5rem;
  align-items: start;
}
.match-activities {
  display: grid;
  gap: 0.7rem;
}
.match-activities h2 {
  font-size: 1rem;
  margin: 0 0 0.3rem;
}
.match-activities small {
  color: var(--text-secondary);
}
.match-activity {
  display: grid;
  gap: 0.4rem;
  padding: 1rem;
  text-align: left;
  width: 100%;
  overflow-wrap: anywhere;
}
.match-activity[aria-current='true'] {
  border-color: var(--accent-color);
  background: var(--surface-muted);
  color: var(--text-primary);
}
.match-main {
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 0.8rem;
  padding: 1.5rem;
}
.match-empty {
  text-align: center;
  padding: 4rem 1rem;
  color: var(--text-secondary);
}
.match-summary h2 {
  margin-top: 0;
  display: inline;
  margin-right: 0.7rem;
}
.match-badge {
  display: inline-block;
  border-radius: 1rem;
  background: var(--surface-muted);
  border: 1px solid var(--border-color);
  padding: 0.2rem 0.7rem;
  font-size: 0.85rem;
}
.match-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 1rem;
  margin-bottom: 1.5rem;
}
.match-tabs [aria-current='page'] {
  font-weight: 700;
  border-color: var(--accent-color);
}
.match-card,
.match-alert {
  border: 1px solid var(--border-color);
  padding: 1.2rem;
  border-radius: 0.7rem;
  margin: 1rem 0;
}
.match-alert {
  border-left: 4px solid #b7791f;
}
.match-card h3 {
  margin-top: 0;
}
.match-task-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.match-section {
  margin-top: 1.5rem;
}
.match-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
  display: grid;
  gap: 1rem;
}
label {
  display: grid;
  gap: 0.4rem;
}
input,
textarea,
select {
  font: inherit;
  padding: 0.65rem;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
}
textarea {
  resize: vertical;
}
.match-check {
  display: flex;
  align-items: center;
}
.match-check input {
  width: auto;
}
.match-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 1rem;
  font-size: 0.85rem;
}
summary {
  cursor: pointer;
  padding: 0.5rem 0;
}
th,
td {
  overflow-wrap: anywhere;
}
@media (max-width: 960px) {
  .match-layout {
    grid-template-columns: 1fr;
  }
  .match-activities {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .match-activities h2,
  .match-activities .match-pagination {
    grid-column: 1 / -1;
  }
}
@media (max-width: 640px) {
  .match-main {
    padding: 1rem;
  }
  .match-form-grid,
  .match-activities {
    grid-template-columns: 1fr;
  }
}
</style>
