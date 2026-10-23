<script setup lang="ts">
import { ElDrawer } from 'element-plus'
import 'element-plus/theme-chalk/el-drawer.css'
import 'element-plus/theme-chalk/el-overlay.css'
import { useRoute } from 'vue-router'
import CrisisEscalation from '@/components/CrisisEscalation.vue'
import { useSafety } from '@/composables/useSafety'
import type { SafetyMode } from '@/composables/useSafety'
import { useAdminStore } from '@/stores/admin'
import { penaltyLevels } from '@/types/safety'
const props = defineProps<{ mode: SafetyMode }>()
const mode = props.mode
const route = useRoute()
const initialReport = typeof route.query['report'] === 'string' ? route.query['report'] : undefined
const title = { reports: '举报管理', penalties: '处罚管理', appeals: '申诉管理' }[mode]
const processingTitle = { reports: '举报处理', penalties: '账号处罚', appeals: '申诉处理' }[mode]
const admin = useAdminStore()
const {
  editorOpen,
  editorTask,
  escalating,
  items,
  nextCursor,
  history,
  busy,
  loading,
  writing,
  listError,
  error,
  notice,
  selected,
  report,
  appeal,
  detail,
  receipt,
  operation,
  reason,
  level,
  accountVersion,
  resourceVersion,
  confirmation,
  workspace,
  options,
  valid,
  operationLabels,
  levelLabels,
  kindLabels,
  status,
  refresh,
  loadList,
  page,
  open,
  close,
  reloadSelected,
  startProcessing,
  closeProcessing,
  cancelProcessing,
  prepare,
  submit,
  crisisEscalated,
} = useSafety(mode, initialReport)
</script>
<template>
  <main class="panel workflow">
    <p class="eyebrow">安全治理 / 普通案件</p>
    <h1>{{ title }}</h1>
    <p v-if="mode === 'penalties'" class="banner">
      本页从已确认举报查询处罚依据；当前接入接口不提供处罚历史列表。仅显示当前分页中的已确认举报，可继续翻页查询。
    </p>
    <p>仅处理服务端授权的普通案件；账号角色管理请进入“后台账号管理”。</p>
    <template v-if="workspace.allowed()">
      <p v-if="notice" role="status">{{ notice }}</p>
      <section v-if="receipt" class="workflow-box" aria-label="处理回执">
        <h2>处理回执</h2>
        <p>{{ receipt.id }} · {{ status(receipt.status) }} · 版本 {{ receipt.version }}</p>
        <RouterLink
          v-if="mode === 'reports' && receipt.status === 'resolved'"
          :to="{ path: '/safety/penalties', query: { report: receipt.id } }"
          >进入该举报的处罚管理</RouterLink
        >
      </section>
      <div class="workflow-grid">
        <section aria-label="案件列表" :aria-busy="busy">
          <h2>
            {{
              mode === 'appeals' ? '申诉案件' : mode === 'penalties' ? '本页已确认举报' : '举报案件'
            }}
          </h2>
          <button :disabled="busy || editorOpen || writing" @click="refresh()">从首页刷新</button>
          <p v-if="busy" role="status">正在读取案件…</p>
          <div v-else-if="listError" role="alert">
            <p>{{ listError }}</p>
            <button :disabled="busy || editorOpen || writing" @click="loadList">重试列表</button>
          </div>
          <p v-else-if="!items.length">
            {{ mode === 'penalties' ? '本页暂无已确认举报，可继续翻页查询' : '暂无案件' }}
          </p>
          <ul v-else class="workflow-list">
            <li v-for="item in items" :key="item.id">
              <button
                :aria-pressed="selected === item.id"
                :disabled="writing || editorOpen"
                @click="open(item.id)"
              >
                {{ item.id }} · {{ status(item.status) }} · 案件版本 {{ item.version
                }}<span v-if="item.kind"> · {{ kindLabels[item.kind] }}</span>
              </button>
            </li>
          </ul>
          <div class="workflow-actions">
            <button
              :disabled="busy || editorOpen || writing || !history.length"
              @click="page(false)"
            >
              上一页
            </button>
            <button :disabled="busy || editorOpen || writing || !nextCursor" @click="page(true)">
              下一页
            </button>
          </div>
          <p>列表不展示举报说明、申诉正文或学生身份。</p>
        </section>
        <section aria-label="案件详情" :aria-busy="loading || writing">
          <h2>案件详情（只读）</h2>
          <p v-if="loading" role="status">正在读取案件详情…</p>
          <p v-if="error" role="alert">{{ error }}</p>
          <button v-if="selected && !detail && !loading" @click="open(selected)">重试详情</button>
          <template v-if="detail">
            <button :disabled="writing || editorOpen" @click="close">关闭案件</button>
            <p>{{ detail.id }} · {{ status(detail.status) }} · 案件版本 {{ detail.version }}</p>
            <template v-if="report">
              <dl class="case-fields">
                <dt>内容类型</dt>
                <dd>{{ kindLabels[report.target_kind] }}</dd>
                <dt>内容对象</dt>
                <dd>{{ report.target_id }}</dd>
                <dt>正文版本</dt>
                <dd>{{ report.content_version }}</dd>
                <dt>举报类型代码</dt>
                <dd>{{ report.type_code }}</dd>
                <dt>被处置账号</dt>
                <dd>{{ report.subject_id }}</dd>
              </dl>
              <h3>案件允许查看的正文</h3>
              <blockquote v-if="report.body" class="workflow-body">{{ report.body }}</blockquote>
              <p v-else>当前正文不可展示，可能已换版、注销或受隐私屏障保护。</p>
              <h3>举报说明</h3>
              <p class="case-text">{{ report.description || '未提供说明' }}</p>
            </template>
            <template v-if="appeal">
              <p>原处罚编号：{{ appeal.penalty_id }}</p>
              <h3>申诉正文</h3>
              <blockquote class="workflow-body">{{ appeal.body }}</blockquote>
              <h3>原处罚理由</h3>
              <p class="case-text">{{ appeal.penalty_reason || '未提供理由' }}</p>
            </template>
            <p v-if="detail.reason" class="case-text">已有处理理由：{{ detail.reason }}</p>
            <div class="workflow-actions">
              <button
                v-if="options.length"
                :disabled="busy || editorOpen"
                @click="startProcessing()"
              >
                {{
                  mode === 'appeals'
                    ? '处理申诉'
                    : mode === 'penalties'
                      ? '给予账号处罚'
                      : '处理举报'
                }}
              </button>
              <button
                v-if="mode === 'reports' && report && admin.can('crisis_operator')"
                :disabled="busy || editorOpen"
                @click="startProcessing('crisis')"
              >
                升级危机
              </button>
              <RouterLink
                v-if="mode === 'reports' && report?.status === 'resolved'"
                :to="{ path: '/safety/penalties', query: { report: report.id } }"
                >进入处罚管理</RouterLink
              >
            </div>
            <p v-if="!options.length">
              {{
                mode === 'penalties' ? '仅已确认举报可作为处罚依据。' : '当前案件已处理，仅供查看。'
              }}
            </p>
          </template>
          <p v-else-if="!loading && !selected">选择案件，按需读取详情。</p>
        </section>
      </div>
      <ElDrawer
        v-if="editorOpen"
        v-model="editorOpen"
        :title="editorTask === 'crisis' ? '升级危机' : processingTitle"
        size="min(40rem, 100vw)"
        :before-close="closeProcessing"
        :close-on-click-modal="false"
        :show-close="!writing && !escalating"
      >
        <p v-if="error" role="alert">{{ error }}</p>
        <button :disabled="writing || escalating" @click="cancelProcessing">取消并关闭</button>
        <p>案件 {{ detail?.id }} · 版本 {{ detail?.version }}</p>
        <CrisisEscalation
          v-if="editorTask === 'crisis' && report"
          :key="`${report.id}:${report.version}`"
          source="report"
          :source-id="report.id"
          :version="report.version"
          @escalated="crisisEscalated"
          @conflict="reloadSelected"
          @busy-change="escalating = $event"
        />
        <template v-else-if="detail">
          <form v-if="options.length" @submit.prevent="prepare">
            <fieldset :disabled="writing || !!confirmation">
              <legend>案件处理</legend>
              <label for="safety-operation">处理方式</label>
              <select id="safety-operation" v-model="operation">
                <option v-for="value in options" :key="value" :value="value">
                  {{ operationLabels[value] }}
                </option>
              </select>
              <template v-if="operation === 'penalty'">
                <p>处罚目标固定为本案作者和精确正文，仅已确认举报可作为本页处罚依据。</p>
                <label for="penalty-level">违规等级与固定措施</label>
                <select id="penalty-level" v-model="level">
                  <option v-for="value in penaltyLevels" :key="value" :value="value">
                    {{ levelLabels[value] }}
                  </option>
                </select>
                <label for="account-version">被处置账号当前版本</label>
                <input
                  id="account-version"
                  v-model="accountVersion"
                  type="text"
                  inputmode="numeric"
                  pattern="[1-9][0-9]*"
                  required
                  aria-describedby="account-version-note"
                />
                <p id="account-version-note">
                  请填写授权交接中该账号的当前版本；举报版本与正文版本不能代替。当前详情接口不提供此值。
                </p>
              </template>
              <template v-if="operation === 'offline' || operation === 'release-restriction'">
                <label for="resource-version">内容对象当前版本</label>
                <input
                  id="resource-version"
                  v-model="resourceVersion"
                  type="text"
                  inputmode="numeric"
                  pattern="[1-9][0-9]*"
                  required
                  aria-describedby="resource-version-note"
                />
                <p id="resource-version-note">
                  请从授权交接取得本内容对象的当前版本；心愿与故事使用所属心愿版本，留言与消息使用各自对象版本，均不是正文版本。
                </p>
              </template>
              <p
                v-if="operation === 'revoke' || operation === 'release-restriction'"
                class="banner"
              >
                仅解除本项处罚或普通内容限制，不解除其他处罚、危机隔离或隐私屏障，不自动恢复旧交互或公开内容。
              </p>
              <label for="safety-reason">处理理由（必填）</label>
              <textarea id="safety-reason" v-model="reason" rows="4" required></textarea>
              <button type="submit" :disabled="!valid">核对处理</button>
            </fieldset>
          </form>
          <p v-else>当前案件已处理，仅供查看。</p>
          <section v-if="confirmation" class="workflow-box" aria-label="处理确认">
            <h3>确认{{ operationLabels[operation] }}</h3>
            <p>案件 {{ detail.id }} · 案件版本 {{ detail.version }}</p>
            <p>
              操作目标 {{ confirmation.id }} · 目标版本 {{ confirmation.input.expected_version }}
            </p>
            <p v-if="confirmation.type === 'penalty'">
              {{ levelLabels[confirmation.input.level] }} · 正文版本
              {{ confirmation.input.content_version }} · 精确内容
              {{ confirmation.input.content_ref }}
            </p>
            <p v-if="confirmation.type === 'restriction'">
              内容类型：{{ kindLabels[confirmation.kind] }}
            </p>
            <p class="case-text">理由：{{ confirmation.input.reason }}</p>
            <p>提交后以服务端状态为准；版本变化必须重新核对。</p>
            <div class="workflow-actions">
              <button :disabled="writing" @click="submit">
                {{ writing ? '正在提交…' : '确认提交' }}
              </button>
              <button :disabled="writing" @click="confirmation = null">返回修改</button>
            </div>
          </section>
        </template>
      </ElDrawer>
    </template>
  </main>
</template>
<style scoped>
.case-fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem 1rem;
}
.case-fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.case-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
input {
  width: 100%;
  padding: 0.65rem;
  font: inherit;
  border: 1px solid var(--control-border);
  border-radius: 8px;
}
</style>
