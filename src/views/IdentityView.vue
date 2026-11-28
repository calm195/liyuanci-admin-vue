<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { onBeforeRouteUpdate, useRoute } from 'vue-router'
import NumberedPagination from '@/components/NumberedPagination.vue'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import FloatingNotice from '@/components/FloatingNotice.vue'
import PageSizeSelect from '@/components/PageSizeSelect.vue'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import IdentityCaseDetail from '@/components/IdentityCaseDetail.vue'
import { useIdentityReview } from '@/composables/useIdentityReview'
import type { IdentityListView } from '@/types/identity'
import { displayBeijingTime } from '@/utils/admin-time'

const route = useRoute()
const history = computed(() => route.query['tab'] === 'processed')
const view = computed<IdentityListView>(() => (history.value ? 'history' : 'pending'))
const editor = useTemplateRef<{ close: () => Promise<void> }>('editor')
const tabs = [
  { title: '待审核', view: 'pending', to: '/identity' },
  { title: '已处理', view: 'history', to: '/identity?tab=processed' },
] as const
const {
  uncertain,
  pageSize,
  pageNumber,
  total,
  turn,
  editorOpen,
  allowed,
  items,
  nextCursor,
  cursors,
  listBusy,
  listError,
  detail,
  historyDetail,
  selected,
  caseBusy,
  cardBusy,
  submitting,
  cardUrl,
  caseError,
  notice,
  receipt,
  decision,
  reason,
  suggestion,
  confirming,
  valid,
  statusLabel,
  hideCard,
  clearCase,
  loadList,
  refreshList,
  nextPage,
  previousPage,
  openCase,
  showCard,
  cardFailed,
  confirmDecision,
  submit,
  startProcessing,
  cancelProcessing,
} = useIdentityReview(view)
onBeforeRouteUpdate(async (to) => {
  if ((to.query['tab'] === 'processed') === history.value || !editorOpen.value) return true
  await editor.value?.close()
  return !editorOpen.value
})
const {
  feedback: readFeedback,
  run: runRead,
  reset: resetReadFeedback,
} = useOperationFeedback(() => Boolean(listError.value))
watch(view, resetReadFeedback, { flush: 'sync' })
function resizePage(size: number) {
  pageSize.value = size
  return refreshList()
}
</script>

<template>
  <FloatingNotice
    v-if="readFeedback.message"
    :message="readFeedback.message"
    :tone="readFeedback.tone"
    :revision="readFeedback.revision"
  />
  <main class="experience-page workflow" aria-label="身份审核">
    <WorkspaceHeading
      title="身份审核"
      :description="
        history
          ? '查看已处理身份审核的姓名、学号、结论和时间。'
          : '核对姓名、学号和授权学生卡；处理结论保留完整回执。'
      "
    />
    <template v-if="allowed()">
      <nav class="identity-tabs" aria-label="身份审核列表">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.view"
          v-slot="{ href, navigate }"
          :to="tab.to"
          custom
        >
          <a :href="href" :aria-current="view === tab.view ? 'page' : undefined" @click="navigate">
            {{ tab.title }}
          </a>
        </RouterLink>
      </nav>
      <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
      <FloatingNotice
        v-if="caseError && !selected && !editorOpen"
        :message="caseError"
        tone="error"
        >{{ caseError }}</FloatingNotice
      >
      <section v-if="receipt" class="receipt" aria-label="审核回执">
        <h2>审核回执</h2>
        <p>{{ statusLabel(receipt.status) }}</p>
        <p v-if="receipt.reason">驳回原因：{{ receipt.reason }}</p>
        <p v-if="receipt.revision_suggestion">修改建议：{{ receipt.revision_suggestion }}</p>
      </section>

      <section
        class="experience-panel experience-table-panel"
        aria-labelledby="case-list-title"
        :aria-busy="listBusy"
      >
        <div class="experience-toolbar">
          <h2 id="case-list-title" class="experience-list-title">
            {{ history ? '已处理案件' : '待审核案件' }}
          </h2>

          <button
            :disabled="listBusy || editorOpen"
            @click="runRead(() => refreshList(), '查询已完成')"
          >
            刷新列表
          </button>
        </div>
        <p v-if="listBusy" role="status">正在加载案件…</p>
        <FloatingNotice v-else-if="listError" :message="listError" tone="error">
          <p>{{ listError }}</p>
          <button :disabled="editorOpen" @click="runRead(() => loadList(), '查询已完成')">
            重试列表
          </button>
        </FloatingNotice>
        <p v-else-if="!items.length" class="experience-empty">
          {{ history ? '暂无审核历史' : '暂无待审核案件' }}
        </p>
        <div v-else class="business-table">
          <table>
            <thead>
              <tr>
                <th scope="col">本页序号</th>
                <th scope="col">姓名</th>
                <th scope="col">学号</th>
                <th scope="col">首次申请时间</th>
                <template v-if="history">
                  <th scope="col">审核结果</th>
                  <th scope="col">审核时间</th>
                </template>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in items" :key="item.id">
                <th scope="row">{{ index + 1 }}</th>
                <td>{{ item.name }}</td>
                <td>{{ item.student_number }}</td>
                <td>{{ item.created_at ? displayBeijingTime(item.created_at) : '—' }}</td>
                <template v-if="history">
                  <td>{{ statusLabel(item.status) }}</td>
                  <td>{{ item.reviewed_at ? displayBeijingTime(item.reviewed_at) : '—' }}</td>
                </template>
                <td>
                  <button
                    :disabled="editorOpen"
                    :aria-label="`查看第 ${index + 1} 条案件`"
                    @click="openCase(item.id)"
                  >
                    {{ history ? '查看记录' : '查看详情' }}
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
          :disabled="listBusy || editorOpen"
          @turn="turn"
          @resize="resizePage"
        />
        <div v-else class="business-pagination" role="group" aria-label="分页操作">
          <PageSizeSelect
            v-model="pageSize"
            :disabled="listBusy || editorOpen"
            @change="refreshList"
          />
          <button :disabled="listBusy || editorOpen || !cursors.length" @click="previousPage">
            上一页
          </button>
          <button :disabled="listBusy || editorOpen || !nextCursor" @click="nextPage">
            下一页
          </button>
        </div>
      </section>
      <WorkspaceDrawer
        :open="!!selected && !editorOpen"
        :title="history ? '身份审核历史' : '身份审核案件详情'"
        @close="clearCase"
      >
        <section v-if="history" aria-label="只读审核记录" :aria-busy="caseBusy">
          <p v-if="caseBusy">正在读取审核记录…</p>
          <p v-if="caseError" role="alert">{{ caseError }}</p>
          <button v-if="!historyDetail && !caseBusy" @click="openCase(selected)">重试记录</button>
          <dl v-if="historyDetail" class="identity-history-fields">
            <dt>姓名</dt>
            <dd>{{ historyDetail.name }}</dd>
            <dt>学号</dt>
            <dd>{{ historyDetail.student_number }}</dd>
            <dt>首次申请时间</dt>
            <dd>{{ displayBeijingTime(historyDetail.created_at) }}</dd>
            <dt>审核结果</dt>
            <dd>{{ statusLabel(historyDetail.status) }}</dd>
            <dt>审核时间</dt>
            <dd>
              {{
                historyDetail.reviewed_at ? displayBeijingTime(historyDetail.reviewed_at) : '未记录'
              }}
            </dd>
            <dt>审核员编号</dt>
            <dd>{{ historyDetail.reviewer_id ?? '未记录' }}</dd>
            <dt>处理理由</dt>
            <dd>{{ historyDetail.reason ?? '未填写' }}</dd>
            <dt>修改建议</dt>
            <dd>{{ historyDetail.revision_suggestion ?? '未填写' }}</dd>
          </dl>
          <p class="experience-muted">仅展示当前完成案件的审核结论，不提供学生卡或再次审核操作。</p>
        </section>
        <IdentityCaseDetail
          v-else
          :detail="detail"
          :selected="selected"
          :case-busy="caseBusy"
          :card-busy="cardBusy"
          :card-url="cardUrl"
          :case-error="caseError"
          :locked="editorOpen"
          @retry="openCase(selected)"
          @close="clearCase"
          @show-card="showCard"
          @hide-card="hideCard"
          @card-failed="cardFailed"
          @process="startProcessing"
        />
        <template #footer
          ><div class="drawer-actions">
            <button data-overlay-close @click="clearCase">关闭案件</button
            ><button
              v-if="detail?.status === 'pending' && !history"
              class="business-primary"
              @click="startProcessing"
            >
              处理身份审核
            </button>
          </div></template
        >
      </WorkspaceDrawer>
      <WorkspaceDrawer
        v-if="editorOpen"
        ref="editor"
        presentation="dialog"
        :open="editorOpen"
        :busy="submitting || uncertain"
        title="处理身份审核"
        class="business-dialog workflow"
        @close="cancelProcessing"
      >
        <p v-if="uncertain" class="experience-inline-error">
          提交结果尚未确认，请保留原请求重试；确认结果前不能修改、关闭或离开。
        </p>
        <template v-if="detail">
          <p>{{ detail.name }} · {{ detail.student_number }}</p>
          <FloatingNotice v-if="caseError" :message="caseError" tone="error">{{
            caseError
          }}</FloatingNotice>
          <form v-if="detail.status === 'pending'" @submit.prevent="confirmDecision">
            <fieldset :disabled="uncertain || submitting || confirming">
              <legend>审核决定</legend>
              <label
                ><input
                  v-model="decision"
                  type="radio"
                  value="approved"
                  name="decision"
                />通过认证</label
              >
              <label
                ><input
                  v-model="decision"
                  type="radio"
                  value="rejected"
                  name="decision"
                />驳回并建议修改</label
              >
              <template v-if="decision === 'rejected'">
                <p class="muted">原因和建议各不得超过 2000 字节，中文通常每字占 3 字节。</p>
                <label for="reject-reason">驳回原因（必填）</label>
                <textarea id="reject-reason" v-model="reason" required rows="3"></textarea>
                <label for="revision-suggestion">修改建议（必填）</label>
                <textarea
                  id="revision-suggestion"
                  v-model="suggestion"
                  required
                  rows="3"
                ></textarea>
              </template>
              <button :disabled="!valid" type="submit">核对决定</button>
            </fieldset>
          </form>
          <section v-if="confirming" class="receipt" aria-label="提交确认">
            <h3>确认审核决定</h3>
            <p>
              {{ decision === 'approved' ? '通过认证' : '驳回认证' }}
            </p>
            <p v-if="decision === 'rejected'">
              原因：{{ reason.trim() }}；建议：{{ suggestion.trim() }}
            </p>
            <div class="workflow-actions">
              <button :disabled="submitting" @click="submit">
                {{ submitting ? '正在提交…' : '确认提交' }}
              </button>
              <button :disabled="submitting || uncertain" @click="confirming = false">
                返回修改
              </button>
            </div>
          </section>
          <button data-overlay-close :disabled="submitting || uncertain" @click="cancelProcessing">
            取消处理
          </button>
        </template>
      </WorkspaceDrawer>
    </template>
  </main>
</template>

<style scoped>
.identity-tabs {
  display: flex;
  gap: 1.5rem;
  border-bottom: 1px solid var(--border-color);
}
.identity-tabs a {
  padding: 0.625rem 0.125rem;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  text-decoration: none;
}
.identity-tabs [aria-current='page'] {
  border-color: var(--accent-color);
  color: var(--accent-color);
  font-weight: 600;
}

.muted {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

fieldset {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  margin-top: 1rem;
  padding: 1rem;
}
fieldset label {
  margin: 0.75rem 0;
}
textarea {
  width: 100%;
  font: inherit;
  border: 1px solid var(--control-border);
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 1rem;
}
.receipt {
  background: var(--surface-muted);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1rem;
  margin: 1rem 0;
  overflow-wrap: anywhere;
}
</style>

<style scoped>
.identity-history-fields {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px 24px;
}
.identity-history-fields dt {
  color: var(--text-secondary);
}
.identity-history-fields dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
