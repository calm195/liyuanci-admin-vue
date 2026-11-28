<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { onBeforeRouteUpdate } from 'vue-router'
import NumberedPagination from '@/components/NumberedPagination.vue'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import FloatingNotice from '@/components/FloatingNotice.vue'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import PageSizeSelect from '@/components/PageSizeSelect.vue'
import BusinessToolbar from '@/components/BusinessToolbar.vue'
import ModerationCaseDetail from '@/components/ModerationCaseDetail.vue'
import CrisisEscalation from '@/components/CrisisEscalation.vue'
import { useModerationReview } from '@/composables/useModerationReview'
const {
  pending,
  retryPending,
  pageSize,
  pageNumber,
  total,
  turn,
  filters,
  search,
  resetFilters,
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
  reloadSelected,
  crisisEscalated,
} = useModerationReview()
const kindLabels: Readonly<Record<string, string>> = {
  wish: '心愿',
  application: '应愿留言',
  wish_comment: '心愿评论与补充',
  message: '私聊消息',
  story: '还愿故事',
}
function moderationKindLabel(kind?: string) {
  return kind ? (kindLabels[kind] ?? '其他内容') : '未提供'
}
const { feedback: readFeedback, run: runRead } = useOperationFeedback(
  () => Boolean(error.value) || Boolean(listError.value),
)
const editor = useTemplateRef<{ close: () => Promise<void> }>('editor')
onBeforeRouteUpdate(async (to, from) => {
  if (!editorOpen.value || to.query['case'] === from.query['case']) return true
  await editor.value?.close()
  return !editorOpen.value
})
function resizePage(size: number) {
  pageSize.value = size
  return refresh()
}
</script>
<template>
  <FloatingNotice
    v-if="readFeedback.message"
    :message="readFeedback.message"
    :tone="readFeedback.tone"
    :revision="readFeedback.revision"
  />
  <main class="panel workflow experience-page" aria-label="内容审核">
    <WorkspaceHeading
      title="内容审核"
      description="核对同版本正文与命中依据，清晰记录每一次审核决定。"
    />
    <template v-if="workspace.allowed()">
      <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
      <FloatingNotice v-if="error && !selectedId && !editorOpen" :message="error" tone="error">{{
        error
      }}</FloatingNotice>
      <section v-if="pending && !editorOpen" class="experience-panel" aria-label="待确认审核">
        <h2>审核结果待确认</h2>
        <p>
          原请求已保留。关闭详情或切换页面不会取消已提交的决定，请先核实结果再创建新的审核操作。
        </p>
        <p>
          案件 {{ pending.id }} · 版本 {{ pending.body.expected_version }} ·
          {{ pending.body.decision === 'approved' ? '通过内容审核' : '驳回内容审核' }}
        </p>
        <button :disabled="writing || listBusy || loading" @click="retryPending">
          {{ writing ? '正在提交…' : '原样重试' }}
        </button>
        <button :disabled="writing || listBusy || loading" @click="openCase(pending.id)">
          查看原案件
        </button>
      </section>
      <section v-if="outcome" class="workflow-box" aria-label="审核回执">
        <h2>审核回执</h2>
        <p>内容判定：{{ outcome.content_decision === 'approved' ? '通过' : '驳回' }}</p>
        <p>业务结果：{{ outcomeLabels[outcome.business_outcome] }}</p>
        <p>资源版本：{{ outcome.version }}</p>
        <p>内容通过不代表必然公开、送达或恢复交互。</p>
      </section>

      <section class="experience-panel" aria-label="案件列表" :aria-busy="listBusy">
        <BusinessToolbar label="内容审核操作栏">
          <h2>审核案件</h2>
          <template #tools>
            <button
              :disabled="listBusy || writing || editorOpen"
              @click="runRead(() => refresh(), '查询已完成')"
            >
              刷新列表
            </button>
          </template>
        </BusinessToolbar>
        <form
          class="moderation-filters"
          aria-label="审核案件筛选"
          @change="runRead(search, '筛选结果已更新')"
          @submit.prevent
        >
          <fieldset
            class="experience-filters"
            :disabled="listBusy || writing || editorOpen || !!pending"
          >
            <label
              >审核状态<select v-model="filters.status">
                <option value="human_required">需要审核</option>
                <option value="all">全部状态</option>
                <option value="approved">已通过</option>
                <option value="rejected">已驳回</option>
              </select></label
            >
            <label
              >内容类型<select v-model="filters.kind">
                <option value="">全部类型</option>
                <option value="wish">心愿</option>
                <option value="application">应愿留言</option>
                <option value="message">私聊消息</option>
                <option value="story">还愿故事</option>
                <option value="wish_comment">心愿评论与补充</option>
              </select></label
            >
            <button type="button" @click="runRead(resetFilters, '已恢复需要审核的案件')">
              重置筛选
            </button>
          </fieldset>
        </form>
        <p class="moderation-query-note">
          默认展示需要人工审核的案件；全部状态下，需要审核的案件在所有分页中优先展示。
        </p>
        <p v-if="listBusy" role="status">正在加载案件…</p>
        <FloatingNotice v-else-if="listError" :message="listError" tone="error">
          <p>{{ listError }}</p>
          <button
            :disabled="writing || editorOpen"
            @click="runRead(() => loadList(), '查询已完成')"
          >
            重试列表
          </button>
        </FloatingNotice>
        <p v-else-if="!items.length" class="experience-empty">当前筛选下暂无审核案件</p>
        <div v-else class="business-table">
          <table>
            <thead>
              <tr>
                <th scope="col">本页序号</th>
                <th scope="col">案件编号</th>
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
                <td class="moderation-case-id">{{ item.id }}</td>
                <td>{{ moderationKindLabel(item.kind) }}</td>
                <td>{{ stateLabel(item.status) }}</td>
                <td>{{ item.version }}</td>
                <td>{{ item.content_version ?? '—' }}</td>
                <td>
                  <button
                    :disabled="writing || editorOpen"
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
        <NumberedPagination
          v-if="total !== null"
          :page="pageNumber"
          :page-size="pageSize"
          :total="total"
          :disabled="listBusy || editorOpen || writing"
          @turn="turn"
          @resize="resizePage"
        />
        <div v-else class="business-pagination" role="group" aria-label="分页操作">
          <PageSizeSelect
            v-model="pageSize"
            :disabled="listBusy || writing || editorOpen"
            @change="refresh()"
          />
          <button
            :disabled="listBusy || writing || editorOpen || !history.length"
            @click="page('previous')"
          >
            上一页
          </button>
          <button
            :disabled="listBusy || writing || editorOpen || !nextCursor"
            @click="page('next')"
          >
            下一页
          </button>
        </div>
      </section>
      <WorkspaceDrawer
        :open="!!selectedId && !editorOpen"
        title="内容审核案件详情"
        description="只读取本案件授权的同版本内容。"
        :busy="writing || escalating"
        @close="close"
      >
        <ModerationCaseDetail
          :detail="detail"
          :selected-id="selectedId"
          :loading="loading"
          :error="error"
          :status="detail ? stateLabel(detail.status) : ''"
          @retry="openCase(selectedId)"
        />
        <template #footer>
          <div class="drawer-actions">
            <button data-overlay-close :disabled="writing || escalating" @click="close">
              关闭案件
            </button>
            <button
              v-if="canEscalate"
              :disabled="writing || escalating"
              @click="startProcessing('crisis')"
            >
              升级危机
            </button>
            <button
              v-if="detail && (detail.status === 'human_required' || pending?.id === detail.id)"
              class="business-primary"
              :disabled="writing || escalating"
              @click="startProcessing('decision')"
            >
              {{ pending?.id === detail.id ? '核实审核结果' : '处理内容审核' }}
            </button>
          </div>
        </template>
      </WorkspaceDrawer>
      <WorkspaceDrawer
        v-if="editorOpen"
        ref="editor"
        presentation="dialog"
        :open="editorOpen"
        :busy="writing || escalating"
        :dirty="pending ? false : undefined"
        :title="editorTask === 'crisis' ? '升级危机' : '处理内容审核'"
        class="business-dialog workflow"
        @close="cancelProcessing"
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
          <template v-else-if="pending">
            <section aria-label="待确认审核">
              <h3>审核结果尚未确认</h3>
              <p>以下原请求已锁定，重试将使用相同内容、版本和操作标识。</p>
              <p>
                案件 {{ pending.id }} · 版本 {{ pending.body.expected_version }} ·
                {{ pending.body.decision === 'approved' ? '通过内容审核' : '驳回内容审核' }}
              </p>
              <template v-if="pending.body.decision === 'rejected'">
                <p>原因：{{ pending.body.reason }}</p>
                <p>建议：{{ pending.body.revision_suggestion }}</p>
              </template>
              <button :disabled="writing" @click="retryPending">
                {{ writing ? '正在提交…' : '原样重试' }}
              </button>
            </section>
          </template>
          <template v-else>
            <form
              v-if="detail.status === 'human_required'"
              aria-label="审核决定"
              @submit.prevent="check"
            >
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
          <button data-overlay-close :disabled="writing || escalating" @click="cancelProcessing">
            取消处理
          </button>
        </template>
      </WorkspaceDrawer>
    </template>
  </main>
</template>

<style scoped>
.moderation-filters {
  margin: 1rem 0;
}
.moderation-filters fieldset {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.8rem;
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.moderation-filters label {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
  flex: 1 1 150px;
}
.moderation-filters select {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
.moderation-case-id {
  max-width: 17rem;
  overflow-wrap: anywhere;
}
.moderation-query-note {
  color: var(--text-secondary);
  font-size: 0.9rem;
}
</style>
