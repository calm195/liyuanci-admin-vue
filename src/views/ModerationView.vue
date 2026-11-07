<script setup lang="ts">
import FloatingNotice from '@/components/FloatingNotice.vue'
import PageSizeSelect from '@/components/PageSizeSelect.vue'
import BusinessToolbar from '@/components/BusinessToolbar.vue'
import ModerationCaseDetail from '@/components/ModerationCaseDetail.vue'
import { ElDialog } from 'element-plus'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-overlay.css'
import CrisisEscalation from '@/components/CrisisEscalation.vue'
import { useModerationReview } from '@/composables/useModerationReview'
const {
  pageSize,
  editorOpen,
  editorTask,
  escalating,
  canEscalate,
  items,
  nextCursor,
  history,
  listBusy,
  listError,
  error,
  detail,
  selectedId,
  loading,
  writing,
  decision,
  reason,
  suggestion,
  confirming,
  outcome,
  notice,
  workspace,
  valid,
  outcomeLabels,
  stateLabel,
  refresh,
  loadList,
  page,
  openCase,
  close,
  check,
  submit,
  startProcessing,
  cancelProcessing,
  closeProcessing,
  reloadSelected,
  crisisEscalated,
} = useModerationReview()
const kindLabels: Readonly<Record<string, string>> = {
  wish: '心愿',
  application: '应愿留言',
  message: '私聊消息',
  story: '还愿故事',
}
function moderationKindLabel(kind?: string) {
  return kind ? (kindLabels[kind] ?? '其他内容') : '未提供'
}
</script>
<template>
  <main class="panel workflow" aria-label="内容审核">
    <p>仅查看授权案件命中正文，不提供全站私聊或上下文会话搜索。</p>
    <template v-if="workspace.allowed()">
      <p class="banner">仅展示当前授权的审核案件，决定提交后以服务端业务结果为准。</p>
      <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
      <FloatingNotice v-if="error && !selectedId && !editorOpen" :message="error" tone="error">{{
        error
      }}</FloatingNotice>
      <section v-if="outcome" class="workflow-box" aria-label="审核回执">
        <h2>审核回执</h2>
        <p>内容判定：{{ outcome.content_decision === 'approved' ? '通过' : '驳回' }}</p>
        <p>业务结果：{{ outcomeLabels[outcome.business_outcome] }}</p>
        <p>资源版本：{{ outcome.version }}</p>
        <p>内容通过不代表必然公开、送达或恢复交互。</p>
      </section>

      <section aria-label="案件列表" :aria-busy="listBusy">
        <BusinessToolbar label="内容审核操作栏">
          <h2>审核案件</h2>
          <template #tools>
            <button :disabled="listBusy || editorOpen" @click="refresh()">刷新列表</button>
          </template>
        </BusinessToolbar>
        <p v-if="listBusy" role="status">正在加载案件…</p>
        <FloatingNotice v-else-if="listError" :message="listError" tone="error">
          <p>{{ listError }}</p>
          <button :disabled="editorOpen" @click="loadList">重试列表</button>
        </FloatingNotice>
        <p v-else-if="!items.length">暂无审核案件</p>
        <div v-else class="business-table">
          <table>
            <thead>
              <tr>
                <th scope="col">本页序号</th>
                <th scope="col">内容类型</th>
                <th scope="col">状态</th>
                <th scope="col">案件版本</th>
                <th scope="col">正文版本</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in items" :key="item.id">
                <th scope="row">{{ index + 1 }}</th>
                <td>{{ moderationKindLabel(item.kind) }}</td>
                <td>{{ stateLabel(item.status) }}</td>
                <td>{{ item.version }}</td>
                <td>{{ item.content_version ?? '—' }}</td>
                <td>
                  <button
                    :disabled="editorOpen"
                    :aria-label="`查看第 ${index + 1} 条案件`"
                    @click="openCase(item.id)"
                  >
                    查看详情
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="business-pagination" role="group" aria-label="分页操作">
          <PageSizeSelect
            v-model="pageSize"
            :disabled="listBusy || writing || editorOpen"
            @change="refresh()"
          />
          <button :disabled="listBusy || editorOpen || !history.length" @click="page('previous')">
            上一页
          </button>
          <button :disabled="listBusy || editorOpen || !nextCursor" @click="page('next')">
            下一页
          </button>
        </div>
      </section>
      <ElDialog
        v-if="selectedId && !editorOpen"
        :model-value="true"
        title="内容审核案件详情"
        width="min(56rem, calc(100vw - 2rem))"
        class="business-dialog workflow"
        top="2rem"
        :close-on-click-modal="false"
        @update:model-value="!$event && close()"
      >
        <ModerationCaseDetail
          :detail="detail"
          :selected-id="selectedId"
          :loading="loading"
          :error="error"
          :status="detail ? stateLabel(detail.status) : ''"
          :locked="editorOpen"
          :can-escalate="canEscalate"
          @retry="openCase(selectedId)"
          @close="close"
          @process="startProcessing"
        />
      </ElDialog>
      <ElDialog
        v-if="editorOpen"
        v-model="editorOpen"
        :title="editorTask === 'crisis' ? '升级危机' : '处理内容审核'"
        width="min(40rem, calc(100vw - 2rem))"
        class="business-dialog workflow"
        top="2rem"
        :close-on-click-modal="false"
        :before-close="closeProcessing"
        :show-close="!writing && !escalating"
      >
        <template v-if="detail">
          <p>案件版本 {{ detail.version }} · 正文版本 {{ detail.content_version }}</p>
          <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
          <CrisisEscalation
            v-if="editorTask === 'crisis'"
            :key="`${detail.id}:${detail.version}`"
            source="task"
            :source-id="detail.id"
            :version="detail.version"
            @busy-change="escalating = $event"
            @escalated="crisisEscalated"
            @conflict="reloadSelected"
          />
          <template v-else>
            <form v-if="detail.status === 'human_required'" @submit.prevent="check">
              <fieldset :disabled="writing || confirming">
                <legend>审核决定</legend>
                <label
                  ><input
                    v-model="decision"
                    type="radio"
                    name="decision"
                    value="approved"
                  />通过内容审核</label
                >
                <label
                  ><input
                    v-model="decision"
                    type="radio"
                    name="decision"
                    value="rejected"
                  />驳回并建议修改</label
                >
                <template v-if="decision === 'rejected'">
                  <p>原因和建议各不得超过 2000 字节。</p>
                  <label for="moderation-reason">驳回原因（必填）</label>
                  <textarea id="moderation-reason" v-model="reason" rows="3" required></textarea>
                  <label for="moderation-suggestion">修改建议（必填）</label>
                  <textarea
                    id="moderation-suggestion"
                    v-model="suggestion"
                    rows="3"
                    required
                  ></textarea>
                </template>
                <button type="submit" :disabled="!valid">核对操作</button>
              </fieldset>
            </form>
            <section v-if="confirming" class="workflow-box" aria-label="操作确认">
              <h3>确认操作</h3>
              <p>
                案件版本 {{ detail.version }} · 正文版本 {{ detail.content_version }} ·
                {{ decision === 'approved' ? '通过内容审核' : '驳回内容审核' }}
              </p>
              <p v-if="decision === 'rejected'">
                原因：{{ reason.trim() }}；建议：{{ suggestion.trim() }}
              </p>
              <p>提交后以服务返回状态为准；版本变化需重新核对。</p>
              <button :disabled="writing" @click="submit">
                {{ writing ? '正在提交…' : '确认提交' }}
              </button>
              <button :disabled="writing" @click="confirming = false">返回修改</button>
            </section>
          </template>
          <button :disabled="writing || escalating" @click="cancelProcessing">取消处理</button>
        </template>
      </ElDialog>
    </template>
  </main>
</template>
