<script setup lang="ts">
import IdentityCaseDetail from '@/components/IdentityCaseDetail.vue'
import { ElDrawer } from 'element-plus'
import 'element-plus/theme-chalk/el-drawer.css'
import 'element-plus/theme-chalk/el-overlay.css'
import { useIdentityReview } from '@/composables/useIdentityReview'
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
} = useIdentityReview()
</script>

<template>
  <main class="panel identity-review">
    <p class="eyebrow">认证管理 / 身份审核</p>
    <h1>身份审核</h1>
    <p>按案件核对身份资料，不设置审核倒计时。</p>
    <template v-if="allowed()">
      <p class="banner">身份材料由同源后台按案件授权返回。</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <section v-if="receipt" class="receipt" aria-label="审核回执">
        <h2>审核回执</h2>
        <p>
          案件 {{ receipt.request_id }} · {{ statusLabel(receipt.status) }} · 版本
          {{ receipt.version }}
        </p>
        <p v-if="receipt.reason">驳回原因：{{ receipt.reason }}</p>
        <p v-if="receipt.revision_suggestion">修改建议：{{ receipt.revision_suggestion }}</p>
      </section>
      <div class="review-grid">
        <section aria-labelledby="case-list-title" :aria-busy="listBusy">
          <div class="review-actions">
            <h2 id="case-list-title">审核案件</h2>
            <button :disabled="listBusy || editorOpen" @click="refreshList">刷新列表</button>
          </div>
          <p v-if="listBusy" role="status">正在加载案件…</p>
          <div v-else-if="listError" role="alert">
            <p>{{ listError }}</p>
            <button :disabled="editorOpen" @click="loadList()">重试列表</button>
          </div>
          <p v-else-if="!items.length">暂无审核案件</p>
          <ul v-else class="case-list">
            <li v-for="item in items" :key="item.id">
              <button
                :disabled="editorOpen"
                :aria-pressed="selected === item.id"
                @click="openCase(item.id)"
              >
                <span>{{ item.id }}</span>
                <span>{{ statusLabel(item.status) }} · 版本 {{ item.version }}</span>
              </button>
            </li>
          </ul>
          <div class="review-actions">
            <button :disabled="listBusy || editorOpen || !cursors.length" @click="previousPage">
              上一页
            </button>
            <button :disabled="listBusy || editorOpen || !nextCursor" @click="nextPage">
              下一页
            </button>
          </div>
          <p class="muted">列表仅展示案件编号、状态与版本。</p>
        </section>
        <IdentityCaseDetail
          :detail="detail"
          :selected="selected"
          :status="detail ? statusLabel(detail.status) : ''"
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
      </div>
      <ElDrawer
        v-if="editorOpen"
        v-model="editorOpen"
        title="处理身份审核"
        size="min(40rem, 100vw)"
        :close-on-click-modal="false"
        :before-close="closeProcessing"
        :show-close="!submitting"
      >
        <template v-if="detail">
          <p>{{ detail.id }} · 案件版本 {{ detail.version }}</p>
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
              {{ detail.id }} · 当前版本 {{ detail.version }} ·
              {{ decision === 'approved' ? '通过认证' : '驳回认证' }}
            </p>
            <p v-if="decision === 'rejected'">
              原因：{{ reason.trim() }}；建议：{{ suggestion.trim() }}
            </p>
            <p>提交后以服务返回状态为准；版本变化需重新核对。</p>
            <div class="review-actions">
              <button :disabled="submitting" @click="submit">
                {{ submitting ? '正在提交…' : '确认提交' }}
              </button>
              <button :disabled="submitting" @click="confirming = false">返回修改</button>
            </div>
          </section>
          <button :disabled="submitting" @click="cancelProcessing">取消处理</button>
        </template>
      </ElDrawer>
    </template>
  </main>
</template>

<style scoped>
.identity-review {
  max-width: 1200px;
}
.review-grid {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(0, 2fr);
  gap: 2rem;
  margin-top: 2rem;
}
.review-grid > section {
  min-width: 0;
}
.review-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin: 1rem 0;
}
.case-list {
  list-style: none;
  padding: 0;
}
.case-list button {
  width: 100%;
  display: grid;
  text-align: left;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
  overflow-wrap: anywhere;
  background: var(--surface-muted);
  color: var(--text-primary);
}
.case-list button[aria-pressed='true'] {
  border: 2px solid var(--accent-color);
  background: var(--selected-surface);
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
@media (max-width: 760px) {
  .review-grid {
    grid-template-columns: 1fr;
  }
}
</style>
