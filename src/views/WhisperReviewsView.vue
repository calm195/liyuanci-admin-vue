<script setup lang="ts">
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import { whisperStatusLabels } from '@/utils/dictionary-labels'

import FloatingNotice from '@/components/FloatingNotice.vue'
import PageSizeSelect from '@/components/PageSizeSelect.vue'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import { displayBeijingTime } from '@/utils/admin-time'
import WhisperReviewDetail from '@/components/WhisperReviewDetail.vue'
import {
  useWhisperReviews,
  whisperKindLabels,
  whisperOutcomeLabels,
} from '@/composables/useWhisperReviews'
const {
  pageSize,
  items,
  nextCursor,
  listBusy,
  listError,
  listNotice,
  selectedId,
  detail,
  loading,
  error,
  notice,
  outcome,
  editorOpen,
  task,
  decision,
  reason,
  suggestion,
  confirming,
  writing,
  uncertain,
  workspace,
  canDecide,
  canEscalate,
  valid,
  refresh,
  more,
  openCase,
  close,
  startProcessing,
  cancelProcessing,
  check,
  back,
  submit,
  reread,
} = useWhisperReviews()
const { feedback: readFeedback, run: runRead } = useOperationFeedback(
  () => Boolean(error.value) || Boolean(listError.value),
)
</script>
<template>
  <FloatingNotice
    v-if="readFeedback.message"
    :message="readFeedback.message"
    :tone="readFeedback.tone"
    :revision="readFeedback.revision"
  />
  <main class="experience-page workflow" aria-label="树洞审核">
    <WorkspaceHeading
      title="树洞审核"
      description="按当前授权案件读取命中版本；匿名身份与私密胶囊保持独立边界。"
    />
    <template v-if="workspace.allowed()">
      <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
      <FloatingNotice v-if="error && !selectedId && !editorOpen" :message="error" tone="error">{{
        error
      }}</FloatingNotice>
      <FloatingNotice
        v-if="outcome"
        :message="`审核决定已确认：${whisperOutcomeLabels[outcome.business_outcome]}`"
        tone="success"
      />
      <section v-if="outcome" class="workflow-box" aria-label="树洞审核回执">
        <h2>审核回执</h2>
        <p>内容判定：{{ outcome.content_decision === 'approved' ? '通过' : '驳回' }}</p>
        <p>业务结果：{{ whisperOutcomeLabels[outcome.business_outcome] }}</p>
        <p>案件版本：{{ outcome.version }}</p>
        <p>内容通过不代表必然公开、激活昵称或解锁胶囊。</p>
      </section>

      <section
        class="experience-panel experience-table-panel"
        aria-label="树洞案件列表"
        :aria-busy="listBusy"
      >
        <div class="experience-toolbar">
          <h2 class="experience-list-title">审核案件</h2>

          <button
            :disabled="listBusy || editorOpen"
            @click="runRead(() => refresh(), '查询已完成')"
          >
            刷新列表
          </button>
        </div>
        <p v-if="listBusy" role="status">正在加载案件…</p>
        <FloatingNotice v-if="listError" :message="listError" tone="error"
          >{{ listError }} 请刷新列表或重试加载。</FloatingNotice
        >
        <FloatingNotice v-if="listNotice" :message="listNotice" tone="info">{{
          listNotice
        }}</FloatingNotice>
        <p v-if="!listBusy && !listError && !items.length" class="experience-empty">
          当前页暂无审核案件
        </p>
        <div v-if="items.length" class="business-table">
          <table>
            <thead>
              <tr>
                <th scope="col">本页序号</th>
                <th scope="col">内容类型</th>
                <th scope="col">状态</th>
                <th scope="col">案件版本</th>
                <th scope="col">正文版本</th>
                <th scope="col">创建时间（北京时间）</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in items" :key="item.id">
                <th scope="row">{{ index + 1 }}</th>
                <td>{{ whisperKindLabels[item.source.kind] }}</td>
                <td>{{ whisperStatusLabels(item.status) }}</td>
                <td>{{ item.version }}</td>
                <td>{{ item.source.content_version }}</td>
                <td>{{ displayBeijingTime(item.created_at) }}</td>
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
            @change="refresh"
          />
          <button v-if="nextCursor !== null" :disabled="listBusy || editorOpen" @click="more">
            {{ listError ? '重试加载' : '加载更多案件' }}
          </button>
        </div>
      </section>
      <WorkspaceDrawer :open="!!selectedId && !editorOpen" title="树洞案件详情" @close="close">
        <WhisperReviewDetail
          :detail="detail"
          :selected-id="selectedId"
          :loading="loading"
          :error="error"
          :locked="editorOpen"
          :can-decide="canDecide"
          :can-escalate="canEscalate"
          @retry="reread"
          @close="close"
          @process="startProcessing"
        />
        <template #footer
          ><div class="drawer-actions">
            <button data-overlay-close @click="close">关闭案件</button
            ><button v-if="canEscalate" @click="startProcessing('crisis')">升级危机</button
            ><button v-if="canDecide" class="business-primary" @click="startProcessing('decision')">
              处理树洞审核
            </button>
          </div></template
        >
      </WorkspaceDrawer>
      <WorkspaceDrawer
        v-if="editorOpen"
        presentation="dialog"
        :open="editorOpen"
        :busy="writing || uncertain"
        :title="task === 'crisis' ? '升级树洞危机' : '处理树洞审核'"
        class="business-dialog workflow"
        @close="cancelProcessing"
      >
        <template v-if="detail">
          <p>
            {{ whisperKindLabels[detail.source.kind] }} · 案件版本 {{ detail.version }} · 正文版本
            {{ detail.source.content_version }}
          </p>
          <p v-if="detail.source.kind === 'whisper_capsule'" class="banner">
            私密胶囊仅供当前命中案件复核；通过不等于立即解锁。
          </p>
          <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
          <form @submit.prevent="check">
            <fieldset :disabled="writing || confirming || uncertain">
              <legend>{{ task === 'crisis' ? '危机升级理由' : '审核决定' }}</legend>
              <template v-if="task === 'decision'">
                <label
                  ><input
                    v-model="decision"
                    type="radio"
                    name="whisper-decision"
                    value="approved"
                  />通过内容审核</label
                >
                <label
                  ><input
                    v-model="decision"
                    type="radio"
                    name="whisper-decision"
                    value="rejected"
                  />驳回并建议修改</label
                >
              </template>
              <template v-if="task === 'crisis' || decision === 'rejected'">
                <p>理由和建议各最多500个 Unicode 码点，不修改输入中的空白。</p>
                <label for="whisper-reason">{{
                  task === 'crisis' ? '升级理由（必填）' : '驳回原因（必填）'
                }}</label>
                <textarea id="whisper-reason" v-model="reason" rows="3" required></textarea>
              </template>
              <template v-if="task === 'decision' && decision === 'rejected'">
                <label for="whisper-suggestion">修改建议（必填）</label>
                <textarea id="whisper-suggestion" v-model="suggestion" rows="3" required></textarea>
              </template>
              <button type="submit" :disabled="!valid">核对操作</button>
            </fieldset>
          </form>
          <section v-if="confirming" class="workflow-box" aria-label="树洞操作确认">
            <h3>确认操作</h3>
            <p>
              案件版本 {{ detail.version }} · 正文版本
              {{ detail.source.content_version }}
            </p>
            <p>
              {{
                task === 'crisis'
                  ? '升级危机并隔离'
                  : decision === 'approved'
                    ? '通过内容审核'
                    : '驳回内容审核'
              }}
            </p>
            <p v-if="task === 'crisis' || decision === 'rejected'" class="workflow-body">
              理由：{{ reason }}
            </p>
            <p v-if="task === 'decision' && decision === 'rejected'" class="workflow-body">
              建议：{{ suggestion }}
            </p>
            <p>提交后以服务端业务结果为准，状态变化需要重新核对。</p>
            <button
              :disabled="writing || (task === 'decision' ? !canDecide : !canEscalate)"
              @click="submit"
            >
              {{ writing ? '正在提交…' : uncertain ? '使用原请求重试' : '确认提交' }}
            </button>
            <button :disabled="writing || uncertain" @click="back">返回修改</button>
          </section>
          <button data-overlay-close :disabled="writing || uncertain" @click="cancelProcessing">
            取消处理
          </button>
        </template>
      </WorkspaceDrawer>
    </template>
  </main>
</template>
