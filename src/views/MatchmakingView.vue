<script setup lang="ts">
import FloatingNotice from '@/components/FloatingNotice.vue'
import { ref } from 'vue'
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import type { LibraryTask } from '@/types/matchmaking'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import MatchmakingProfile from '@/components/MatchmakingProfile.vue'
import MatchmakingScore from '@/components/MatchmakingScore.vue'
import MatchmakingAutoPairing from '@/components/MatchmakingAutoPairing.vue'
import { activityDateFields, useMatchmaking } from '@/composables/useMatchmaking'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import { phaseLabels, enrollmentLabels, pairLabels } from '@/types/matchmaking'
const { libraryOnly = false } = defineProps<{ libraryOnly?: boolean }>()
const {
  autoWriting,
  autoPending,
  autoApplied,
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
  showList,
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
  showFirstTaskPicker,
  pendingOnOtherPage,
  hideLibrary,
  libraryTurn,
  editLibraryTask,
  saveLibraryTask,
  chooseFirstTask,
  addTemplate,
  saveTemplates,
} = useMatchmaking(libraryOnly)
const libraryEditorOpen = ref(false)
function openLibraryEditor(task?: LibraryTask) {
  if (locked.value) return
  editLibraryTask(task)
  libraryEditorOpen.value = true
}
async function toggleLibraryTask(task: LibraryTask) {
  if (locked.value || libraryEditorOpen.value) return
  editLibraryTask(task)
  libraryForm.enabled = !task.enabled
  await saveLibraryTask()
}
function closeLibraryEditor() {
  if (locked.value) return
  libraryEditorOpen.value = false
  editLibraryTask()
}
const { feedback, run: runRead } = useOperationFeedback(() => !!error.value)
const tabs = [
  { key: 'activity', label: '活动设置' },
  { key: 'enrollments', label: '报名审核' },
  { key: 'pairs', label: '配对结果' },
  { key: 'tasks', label: '每日任务' },
] as const
function shortTime(value: string, withTime = false) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'long',
    day: 'numeric',
    ...(withTime ? ({ hour: '2-digit', minute: '2-digit', hour12: false } as const) : {}),
  }).format(new Date(value))
}
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
  <main
    class="panel matchmaking-workspace experience-page"
    :aria-label="libraryOnly ? '每日任务库' : '活动维护'"
  >
    <template v-if="workspace.allowed()">
      <WorkspaceHeading
        :title="
          libraryOnly
            ? '每日任务库'
            : selected === 'new'
              ? '新建活动'
              : detail
                ? detail.activity.title
                : '活动管理'
        "
        :description="
          libraryOnly
            ? '维护活动共用的每日任务与最早可分配日。'
            : selected
              ? '管理报名、配对与每日任务，跟进每一场相遇。'
              : '安排每一次相遇，清楚掌握报名与活动进展。'
        "
      >
        <template v-if="selected && !libraryOnly" #back>
          <button class="match-back" :disabled="locked" @click="showList">← 返回活动列表</button>
        </template>
        <template v-if="detail && !libraryOnly" #status>
          <span class="experience-badge" :data-status="detail.activity.phase">{{
            phaseLabels[detail.activity.phase]
          }}</span>
        </template>
        <button
          v-if="!libraryOnly && !selected"
          class="business-primary"
          :disabled="locked"
          @click="create"
        >
          新建活动
        </button>
        <button
          v-else-if="libraryOnly"
          class="business-primary"
          :disabled="locked"
          @click="openLibraryEditor()"
        >
          新建任务
        </button>
        <button v-else :disabled="locked" @click="runRead(refresh, '页面数据已刷新')">
          重新读取
        </button>
      </WorkspaceHeading>
      <FloatingNotice v-if="error" :message="error" tone="error" />
      <FloatingNotice v-if="notice" :message="notice" tone="success" />
      <FloatingNotice
        v-if="feedback.message"
        :message="feedback.message"
        :tone="feedback.tone"
        :revision="feedback.revision"
      />
      <section v-if="autoPending && libraryOnly" class="match-alert" aria-label="待确认自动分配">
        <p>有自动分配操作结果尚未确认，请返回活动维护核实原请求。</p>
        <RouterLink to="/matchmaking">返回活动维护</RouterLink>
      </section>
      <section v-if="pending" class="match-alert" aria-label="待确认操作">
        <p>
          {{ pending.title }}的结果尚未确认，表单已锁定。重试会使用同一份内容，不会创建另一项操作。
        </p>
        <RouterLink v-if="pendingOnOtherPage" :to="pendingOnOtherPage">前往原页面核实</RouterLink>
        <button v-else :disabled="writing || busy" @click="runPending">原样重试</button>
      </section>
      <p v-if="conflict" role="alert">当前数据已变化，请点击“重新读取”，核对后再操作。</p>
      <p v-if="busy || writing" role="status">
        {{ writing ? '正在提交，请稍候…' : '正在读取数据…' }}
      </p>
      <section v-if="libraryOpen" aria-label="每日任务库" class="experience-panel">
        <div class="match-heading">
          <div>
            <h2 v-if="choosingFirst">选择固定首日任务</h2>
            <p v-if="choosingFirst">为 {{ detail?.activity.title }} 选择固定首日任务。</p>
            <p>最早可分配日填 0 时无额外限制。首日可用的启用任务可设为活动的固定首日任务。</p>
          </div>
          <button v-if="choosingFirst" :disabled="locked" @click="runRead(hideLibrary)">
            返回活动
          </button>
        </div>
        <div v-if="libraryOnly" class="experience-toolbar">
          <button :disabled="locked" @click="runRead(refresh, '页面数据已刷新')">刷新任务</button
          ><span class="experience-muted">共 {{ libraryTotal }} 项任务</span>
        </div>
        <WorkspaceDrawer
          presentation="dialog"
          :open="libraryEditorOpen"
          :title="libraryEditID ? '编辑任务' : '新建任务'"
          :busy="locked"
          @close="closeLibraryEditor"
        >
          <form id="library-editor" class="experience-editor" @submit.prevent="saveLibraryTask">
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
            </fieldset>
          </form>
          <template #footer
            ><div class="drawer-actions">
              <button data-overlay-close :disabled="locked" @click="closeLibraryEditor">取消</button
              ><button
                v-if="pending"
                class="business-primary"
                :disabled="writing || busy"
                @click="runPending"
              >
                原样重试</button
              ><button
                v-else
                class="business-primary"
                type="submit"
                form="library-editor"
                :disabled="locked || conflict"
              >
                保存任务
              </button>
            </div></template
          >
        </WorkspaceDrawer>
        <p v-if="!busy && !libraryTasks.length">暂无任务，请先新建。</p>
        <div
          v-if="libraryTasks.length"
          class="business-table"
          tabindex="0"
          aria-label="每日任务列表"
        >
          <table>
            <thead>
              <tr>
                <th>任务内容</th>
                <th>类型</th>
                <th>最早可分配日</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in libraryTasks" :key="task.id">
                <td class="match-task-body">{{ task.body }}</td>
                <td>{{ task.kind === 'online' ? '线上' : '线下' }}</td>
                <td>{{ task.min_day ? `第 ${task.min_day} 天起` : '无天数限制' }}</td>
                <td>
                  <button
                    v-if="libraryOnly"
                    class="inline-switch"
                    role="switch"
                    :aria-checked="task.enabled"
                    :aria-label="`启用任务 ${task.body}`"
                    :disabled="locked || libraryEditorOpen"
                    @click="toggleLibraryTask(task)"
                  >
                    <span aria-hidden="true"></span></button
                  ><span>{{ task.enabled ? '已启用' : '已停用' }}</span>
                </td>
                <td>
                  <button v-if="libraryOnly" :disabled="locked" @click="openLibraryEditor(task)">
                    编辑任务</button
                  ><button
                    v-if="choosingFirst"
                    :disabled="
                      locked || conflict || !canEditTemplates || !task.enabled || task.min_day > 1
                    "
                    @click="chooseFirstTask(task)"
                  >
                    设为固定首日任务
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
        <section v-if="!selected" class="experience-panel activity-list" aria-label="活动列表">
          <div class="match-list-heading">
            <div>
              <h2>
                全部活动 <span class="experience-muted">{{ total }}</span>
              </h2>
              <p class="experience-muted">按当前页展示，进入详情管理活动。</p>
            </div>
            <button :disabled="locked" @click="runRead(refresh, '页面数据已刷新')">刷新列表</button>
          </div>
          <div v-if="activities.length" class="business-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">活动</th>
                  <th scope="col">阶段</th>
                  <th scope="col">报名截止</th>
                  <th scope="col">活动时间</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="activity in activities" :key="activity.id">
                  <td>
                    <strong>{{ activity.title }}</strong
                    ><small class="experience-muted">{{ activity.days }} 天 · 每日任务</small>
                  </td>
                  <td>
                    <span class="experience-badge" :data-status="activity.phase">{{
                      phaseLabels[activity.phase]
                    }}</span>
                  </td>
                  <td>{{ shortTime(activity.registration_closes_at, true) }}</td>
                  <td>{{ shortTime(activity.starts_at) }} — {{ shortTime(activity.ends_at) }}</td>
                  <td>
                    <button
                      class="match-activity"
                      :disabled="locked"
                      @click="runRead(() => open(activity.id), '活动详情已读取')"
                    >
                      管理活动
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else-if="!busy" class="experience-empty">
            <h2>暂无活动</h2>
            <p>新建一场活动，开始准备下一次相遇。</p>
          </div>
          <div class="business-pagination" aria-label="活动列表分页">
            <span class="experience-muted">共 {{ total }} 场 · 每页 20 场</span>
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
        </section>
        <div v-else class="match-main experience-panel">
          <template v-if="selected">
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
              <form
                v-if="selected === 'new' || detail?.activity.status === 'draft'"
                @submit.prevent="saveActivity"
              >
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
              <dl v-else-if="detail" class="activity-information">
                <dt>活动名称</dt>
                <dd>{{ detail.activity.title }}</dd>
                <template v-for="field in activityDateFields" :key="field.key"
                  ><dt>{{ field.label }}</dt>
                  <dd>{{ time(detail.activity[field.key]) }}</dd></template
                >
                <dt>活动天数</dt>
                <dd>{{ detail.activity.days }} 天</dd>
                <dt>活动说明</dt>
                <dd class="match-task-body">{{ detail.activity.description }}</dd>
              </dl>
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
              <h2>
                报名审核 <small class="experience-muted">{{ detail.total }} 份报名</small>
              </h2>
              <p>学生认证和本活动资料审核分别管理。通过审核且当前资格有效的报名者才能配对。</p>
              <div class="business-table">
                <table>
                  <caption>
                    本页报名记录
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">昵称</th>
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
                  <MatchmakingScore
                    :score="candidate.score"
                    :details="candidate.score_details"
                    :first="source.profile?.name ?? '所选报名者'"
                    :second="candidate.enrollment.profile?.name ?? '候选人'"
                  />
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
              <MatchmakingAutoPairing
                :key="detail.activity.id"
                :activity-i-d="detail.activity.id"
                :activity-version="detail.activity.version"
                :disabled="locked || conflict || !canPair"
                @busy-change="autoWriting = $event"
                @applied="autoApplied"
              />
              <div class="match-heading">
                <h2>
                  配对记录 <small class="experience-muted">{{ detail.pair_total }} 条记录</small>
                </h2>
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
                <MatchmakingScore
                  :score="row.score"
                  :details="row.score_details"
                  :first="row.member_names[0] ?? '参与者一'"
                  :second="row.member_names[1] ?? '参与者二'"
                />
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
                @click="runRead(showFirstTaskPicker)"
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
    <p v-else role="alert">当前会话无权管理包分配，请联系管理员。</p>
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
.activity-list {
  padding: 0;
  overflow: hidden;
}
.activity-list .match-list-heading {
  padding: 24px;
  margin: 0;
}
.activity-list .business-table {
  border-inline: 0;
  border-radius: 0;
}
.activity-list .business-table :is(th, td) {
  padding-inline: 24px;
}
.activity-list .business-table table {
  table-layout: fixed;
  min-width: 960px;
}
.activity-list th:nth-child(1) {
  width: 32%;
}
.activity-list th:nth-child(2) {
  width: 12%;
}
.activity-list th:nth-child(3) {
  width: 18%;
}
.activity-list th:nth-child(4) {
  width: 26%;
}
.activity-list th:nth-child(5) {
  width: 12%;
}
.activity-list .business-table td small {
  display: block;
  margin-top: 0;
  line-height: 18px;
  font-size: 12px;
}
.activity-list .business-pagination {
  padding: 18px 24px;
  margin: 0;
}
.activity-information {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 20px 24px;
}
.activity-information dt {
  color: var(--text-secondary);
}
.activity-information dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.match-layout {
  min-width: 0;
}
.match-main {
  min-width: 0;
}
.match-list-heading {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 24px;
  margin-bottom: 24px;
}
.match-list-heading h2 {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
}
.match-list-heading p {
  margin: 6px 0 0;
  line-height: 20.8px;
}
.match-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}
.match-summary > div {
  border-right: 1px solid var(--border-color);
}
.match-summary > div:last-child {
  border-right: 0;
}
.match-summary span {
  display: block;
  color: var(--text-secondary);
  font-size: 13px;
}
.match-summary strong {
  display: block;
  font-size: 24px;
  margin-top: 4px;
}
.match-summary small {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-secondary);
}
.match-detail-tools {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}
.experience-page button.match-back {
  padding: 0;
  min-height: 22.4px;
  line-height: 22.4px;
  margin-bottom: 16px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
}
.match-tabs {
  display: flex;
  overflow-x: auto;
  gap: 28px;
  border-bottom: 1px solid var(--border-color);
  margin: -24px -24px 24px;
  padding: 0 24px;
}
.experience-page .match-tabs button {
  background: transparent;
  color: var(--text-secondary);
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  padding: 18px 0;
  white-space: nowrap;
}
.experience-page .match-tabs [aria-current='page'] {
  color: var(--accent-color);
  border-bottom-color: var(--accent-color);
  font-weight: 600;
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
@media (max-width: 640px) {
  .match-form-grid {
    grid-template-columns: 1fr;
  }
  .match-summary {
    gap: 12px;
  }
  .match-summary strong {
    font-size: 20px;
  }
}

.match-main > section > h2 {
  margin: 0;
  font-size: 18px;
  line-height: 28px;
}
.match-main > section > p {
  color: var(--text-secondary);
  font-size: 13px;
}
.activity-information {
  margin: 24px 0;
}
</style>
