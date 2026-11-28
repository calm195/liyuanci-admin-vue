<script setup lang="ts">
import NumberedPagination from '@/components/NumberedPagination.vue'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import FloatingNotice from '@/components/FloatingNotice.vue'
import PageSizeSelect from './PageSizeSelect.vue'
import WorkspaceHeading from './WorkspaceHeading.vue'
import WorkspaceDrawer from './WorkspaceDrawer.vue'
import { onBeforeRouteUpdate, useRoute } from 'vue-router'
import { useTemplateRef } from 'vue'
import CrisisEscalation from '@/components/CrisisEscalation.vue'
import { useSafety } from '@/composables/useSafety'
import type { SafetyMode } from '@/composables/useSafety'
import { useAdminStore } from '@/stores/admin'
import { penaltyLevels } from '@/types/safety'
const props = defineProps<{ mode: SafetyMode }>()
const mode = props.mode
const route = useRoute()
const initialCase = route.query[mode === 'reports' ? 'report' : 'appeal']
const title = mode === 'reports' ? '举报管理' : '申诉管理'
const processingTitle = mode === 'reports' ? '举报处理' : '申诉处理'
const admin = useAdminStore()
const {
  uncertain,
  pageSize,
  editorOpen,
  editorTask,
  escalating,
  items,
  nextCursor,
  currentPage,
  total,
  changePage,
  resizePage,
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
  canPenalize,
  operation,
  reason,
  level,
  accountVersion,
  confirmation,
  workspace,
  options,
  valid,
  operationLabels,
  levelLabels,
  kindLabels,
  status,
  refresh,
  resolvedOnly,
  filterReports,
  loadList,
  page,
  open,
  openPenaltyFromReceipt,
  close,
  reloadSelected,
  startProcessing,
  cancelProcessing,
  prepare,
  submit,
  crisisEscalated,
} = useSafety(
  mode,
  typeof initialCase === 'string' ? initialCase : undefined,
  mode === 'reports' && route.query['status'] === 'resolved',
)
const { feedback: readFeedback, run: runRead } = useOperationFeedback(() =>
  Boolean(error.value || listError.value),
)
const editor = useTemplateRef<{ close: () => Promise<void> }>('editor')
onBeforeRouteUpdate(async () => {
  if (!editorOpen.value) return true
  await editor.value?.close()
  return !editorOpen.value
})
</script>
<template>
  <FloatingNotice
    v-if="readFeedback.message"
    :message="readFeedback.message"
    :tone="readFeedback.tone"
    :revision="readFeedback.revision"
  />
  <main class="experience-page workflow" :aria-label="title">
    <WorkspaceHeading :title="title" />
    <template v-if="workspace.allowed()">
      <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
      <FloatingNotice v-if="error && !selected && !editorOpen" :message="error" tone="error">{{
        error
      }}</FloatingNotice>
      <section v-if="receipt" class="workflow-box" aria-label="处理回执">
        <h2>处理回执</h2>
        <p>{{ status(receipt.status) }} · 版本 {{ receipt.version }}</p>
        <button
          v-if="mode === 'reports' && receipt.status === 'resolved'"
          :disabled="busy || loading || editorOpen || writing"
          @click="openPenaltyFromReceipt"
        >
          给予账号处罚
        </button>
      </section>

      <section
        class="experience-panel experience-table-panel"
        aria-label="案件列表"
        :aria-busy="busy"
      >
        <div class="experience-toolbar">
          <h2 class="experience-list-title">
            {{ mode === 'appeals' ? '申诉案件' : '举报案件' }}
          </h2>
          <div
            v-if="mode === 'reports'"
            class="workflow-actions"
            role="group"
            aria-label="举报状态"
          >
            <button
              :aria-pressed="!resolvedOnly"
              :disabled="!resolvedOnly || busy || editorOpen || writing"
              @click="runRead(() => filterReports(false), '查询已完成')"
            >
              全部举报
            </button>
            <button
              :aria-pressed="resolvedOnly"
              :disabled="resolvedOnly || busy || editorOpen || writing"
              @click="runRead(() => filterReports(true), '查询已完成')"
            >
              已确认
            </button>
          </div>
          <button
            :disabled="busy || editorOpen || writing"
            @click="runRead(() => refresh(), '查询已完成')"
          >
            从首页刷新
          </button>
        </div>
        <p v-if="busy" role="status">正在读取案件…</p>
        <FloatingNotice v-else-if="listError" :message="listError" tone="error">
          <p>{{ listError }}</p>
          <button
            :disabled="busy || editorOpen || writing"
            @click="runRead(() => loadList(), '查询已完成')"
          >
            重试列表
          </button>
        </FloatingNotice>
        <p v-else-if="!items.length" class="experience-empty">
          {{ resolvedOnly ? '本页暂无已确认举报' : '暂无案件' }}
        </p>
        <div v-else class="business-table">
          <table>
            <thead>
              <tr>
                <th scope="col">本页序号</th>
                <th scope="col">内容类型</th>
                <th scope="col">状态</th>
                <th scope="col">案件版本</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in items" :key="item.id">
                <th scope="row">{{ index + 1 }}</th>
                <td>{{ item.kind ? kindLabels[item.kind] : '—' }}</td>
                <td>{{ status(item.status) }}</td>
                <td>{{ item.version }}</td>
                <td>
                  <button
                    :disabled="writing || editorOpen"
                    :aria-label="`查看第 ${index + 1} 条案件`"
                    @click="open(item.id)"
                  >
                    查看详情
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <NumberedPagination
          v-if="total !== null"
          :page="currentPage"
          :page-size="pageSize"
          :total="total"
          :disabled="busy || editorOpen || writing || escalating"
          @turn="changePage"
          @resize="resizePage"
        />
        <div v-else class="business-pagination" role="group" aria-label="分页操作">
          <PageSizeSelect
            v-model="pageSize"
            :disabled="busy || editorOpen || writing || escalating"
            @change="refresh()"
          />
          <button :disabled="busy || editorOpen || writing || !history.length" @click="page(false)">
            上一页
          </button>
          <button :disabled="busy || editorOpen || writing || !nextCursor" @click="page(true)">
            下一页
          </button>
        </div>
        <p>列表不展示举报说明、申诉正文或学生身份。</p>
      </section>
      <WorkspaceDrawer
        :open="!!selected && !editorOpen"
        title="案件详情"
        :busy="writing"
        @close="close"
      >
        <section aria-label="案件详情" :aria-busy="loading || writing">
          <p v-if="loading" role="status">正在读取案件详情…</p>
          <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
          <button v-if="selected && !detail && !loading" @click="open(selected)">重试详情</button>
          <template v-if="detail">
            <p>{{ status(detail.status) }} · 案件版本 {{ detail.version }}</p>
            <template v-if="report">
              <dl class="case-fields">
                <dt>内容类型</dt>
                <dd>{{ kindLabels[report.target_kind] }}</dd>
                <dt>正文版本</dt>
                <dd>{{ report.content_version }}</dd>
                <dt>举报类型代码</dt>
                <dd>{{ report.type_code }}</dd>
                <dt>处置对象</dt>
                <dd>本案内容作者</dd>
              </dl>
              <h3>案件允许查看的正文</h3>
              <blockquote v-if="report.body" class="workflow-body">{{ report.body }}</blockquote>
              <p v-else>当前正文不可展示，可能已换版、注销或受隐私屏障保护。</p>
              <h3>举报说明</h3>
              <p class="case-text">{{ report.description || '未提供说明' }}</p>
            </template>
            <template v-if="appeal">
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
                {{ mode === 'appeals' ? '处理申诉' : '处理举报' }}
              </button>
              <button
                v-if="mode === 'reports' && report && admin.can('crisis_operator')"
                :disabled="busy || editorOpen"
                @click="startProcessing('crisis')"
              >
                升级危机
              </button>
              <button
                v-if="canPenalize"
                :disabled="busy || editorOpen"
                @click="startProcessing('penalty')"
              >
                给予账号处罚
              </button>
            </div>
            <p v-if="!options.length">当前案件已处理，仅供查看。</p>
          </template>
          <p v-else-if="!loading && !selected">选择案件，按需读取详情。</p>
        </section>
        <template #footer
          ><div class="drawer-actions">
            <button data-overlay-close :disabled="writing" @click="close">关闭案件</button>
          </div></template
        >
      </WorkspaceDrawer>
      <WorkspaceDrawer
        v-if="editorOpen"
        ref="editor"
        presentation="dialog"
        :open="editorOpen"
        :busy="writing || escalating || uncertain"
        :title="
          editorTask === 'crisis'
            ? '升级危机'
            : editorTask === 'penalty'
              ? '账号处罚'
              : processingTitle
        "
        class="business-dialog workflow"
        @close="cancelProcessing"
      >
        <p v-if="uncertain" class="experience-inline-error">
          提交结果尚未确认，请保留原请求重试；确认结果前不能修改、关闭或离开。
        </p>
        <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
        <button
          data-overlay-close
          :disabled="writing || escalating || uncertain"
          @click="cancelProcessing"
        >
          取消并关闭
        </button>
        <p>案件版本 {{ detail?.version }}</p>
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
            <fieldset :disabled="uncertain || writing || loading || !!confirmation">
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
                <p>
                  核对处理时将重新读取案件及账号版本。{{
                    accountVersion ? `本次读取的账号版本：${accountVersion}` : ''
                  }}
                </p>
              </template>
              <p v-if="operation === 'offline' || operation === 'release-restriction'">
                核对处理时会读取本案内容对象的当前版本。
              </p>
              <p
                v-if="operation === 'revoke' || operation === 'release-restriction'"
                class="banner"
              >
                仅解除本项处罚或普通内容限制，不解除其他处罚、危机隔离或隐私屏障，不自动恢复旧交互或公开内容。
              </p>
              <label for="safety-reason">处理理由（必填）</label>
              <textarea id="safety-reason" v-model="reason" rows="4" required></textarea>
              <button type="submit" :disabled="!valid || loading">核对处理</button>
            </fieldset>
          </form>
          <p v-else>当前案件已处理，仅供查看。</p>
          <section v-if="confirmation" class="workflow-box" aria-label="处理确认">
            <h3>确认{{ operationLabels[operation] }}</h3>
            <p>案件版本 {{ detail.version }}</p>
            <p>目标版本 {{ confirmation.input.expected_version }}</p>
            <p v-if="confirmation.type === 'penalty'">
              {{ levelLabels[confirmation.input.level] }} · 正文版本
              {{ confirmation.input.content_version }}
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
              <button :disabled="writing || uncertain" @click="confirmation = null">
                返回修改
              </button>
            </div>
          </section>
        </template>
      </WorkspaceDrawer>
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
