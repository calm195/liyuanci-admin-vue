<script setup lang="ts">
import BusinessToolbar from '@/components/BusinessToolbar.vue'
import IdentityCaseDetail from '@/components/IdentityCaseDetail.vue'
import { ElDialog } from 'element-plus'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-overlay.css'
import { useIdentityReview } from '@/composables/useIdentityReview'
import { displayBeijingTime } from '@/utils/admin-time'

const props = defineProps<{ history?: boolean }>()
const pageTitle = props.history ? '身份审核历史' : '身份审核'
const {
  editorOpen,
  allowed,
  items,
  nextCursor,
  cursors,
  listBusy,
  listError,
  detail,
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
  closeProcessing,
} = useIdentityReview(props.history ? 'history' : 'pending')
</script>

<template>
  <main class="panel workflow" :aria-label="pageTitle">
    <template v-if="allowed()">
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="caseError && !selected && !editorOpen" role="alert">{{ caseError }}</p>
      <section v-if="receipt" class="receipt" aria-label="审核回执">
        <h2>审核回执</h2>
        <p>{{ statusLabel(receipt.status) }}</p>
        <p v-if="receipt.reason">驳回原因：{{ receipt.reason }}</p>
        <p v-if="receipt.revision_suggestion">修改建议：{{ receipt.revision_suggestion }}</p>
      </section>

      <section aria-labelledby="case-list-title" :aria-busy="listBusy">
        <BusinessToolbar :label="`${pageTitle}操作栏`">
          <h2 id="case-list-title">{{ history ? '已处理案件' : '待审核案件' }}</h2>
          <template #tools>
            <button :disabled="listBusy || editorOpen" @click="refreshList">刷新列表</button>
          </template>
        </BusinessToolbar>
        <p v-if="listBusy" role="status">正在加载案件…</p>
        <div v-else-if="listError" role="alert">
          <p>{{ listError }}</p>
          <button :disabled="editorOpen" @click="loadList()">重试列表</button>
        </div>
        <p v-else-if="!items.length">{{ history ? '暂无审核历史' : '暂无待审核案件' }}</p>
        <div v-else class="business-table">
          <table>
            <thead>
              <tr>
                <th scope="col">本页序号</th>
                <th scope="col">姓名</th>
                <th scope="col">学号</th>
                <template v-if="history">
                  <th scope="col">审核结果</th>
                  <th scope="col">审核时间</th>
                </template>
                <th v-else scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in items" :key="item.id">
                <th scope="row">{{ index + 1 }}</th>
                <td>{{ item.name }}</td>
                <td>{{ item.student_number }}</td>
                <template v-if="history">
                  <td>{{ statusLabel(item.status) }}</td>
                  <td>{{ item.reviewed_at ? displayBeijingTime(item.reviewed_at) : '—' }}</td>
                </template>
                <td v-else>
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
          <button :disabled="listBusy || editorOpen || !cursors.length" @click="previousPage">
            上一页
          </button>
          <button :disabled="listBusy || editorOpen || !nextCursor" @click="nextPage">
            下一页
          </button>
        </div>
      </section>
      <ElDialog
        v-if="selected && !editorOpen"
        :model-value="true"
        title="身份审核案件详情"
        width="min(56rem, calc(100vw - 2rem))"
        class="business-dialog workflow"
        top="2rem"
        :close-on-click-modal="false"
        @update:model-value="!$event && clearCase()"
      >
        <IdentityCaseDetail
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
      </ElDialog>
      <ElDialog
        v-if="editorOpen"
        v-model="editorOpen"
        title="处理身份审核"
        width="min(40rem, calc(100vw - 2rem))"
        class="business-dialog workflow"
        top="2rem"
        :close-on-click-modal="false"
        :before-close="closeProcessing"
        :show-close="!submitting"
      >
        <template v-if="detail">
          <p>{{ detail.name }} · {{ detail.student_number }}</p>
          <p v-if="caseError" role="alert">{{ caseError }}</p>
          <form v-if="detail.status === 'pending'" @submit.prevent="confirmDecision">
            <fieldset :disabled="submitting || confirming">
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
              <button :disabled="submitting" @click="confirming = false">返回修改</button>
            </div>
          </section>
          <button :disabled="submitting" @click="cancelProcessing">取消处理</button>
        </template>
      </ElDialog>
    </template>
  </main>
</template>

<style scoped>
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
