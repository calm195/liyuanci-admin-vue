<script setup lang="ts">
import FloatingNotice from '@/components/FloatingNotice.vue'
import PageSizeSelect from '@/components/PageSizeSelect.vue'
import BusinessToolbar from '@/components/BusinessToolbar.vue'
import { displayBeijingTime } from '@/utils/admin-time'
import { ElDialog } from 'element-plus'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-overlay.css'
import WhisperReviewDetail from '@/components/WhisperReviewDetail.vue'
import {
  useWhisperReviews,
  whisperKindLabels,
  whisperStatusLabels,
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
  closeProcessing,
  check,
  back,
  submit,
  reread,
} = useWhisperReviews()
</script>
<template>
  <main class="panel workflow" aria-label="树洞审核">
    <p>仅按当前授权案件读取命中版本，不提供匿名作者查询或私密胶囊全量浏览。</p>
    <template v-if="workspace.allowed()">
      <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
      <FloatingNotice v-if="error && !selectedId && !editorOpen" :message="error" tone="error">{{
        error
      }}</FloatingNotice>
      <section v-if="outcome" class="workflow-box" aria-label="树洞审核回执">
        <h2>审核回执</h2>
        <p>内容判定：{{ outcome.content_decision === 'approved' ? '通过' : '驳回' }}</p>
        <p>业务结果：{{ whisperOutcomeLabels[outcome.business_outcome] }}</p>
        <p>案件版本：{{ outcome.version }}</p>
        <p>内容通过不代表必然公开、激活昵称或解锁胶囊。</p>
      </section>

      <section aria-label="树洞案件列表" :aria-busy="listBusy">
        <BusinessToolbar label="树洞审核操作栏">
          <h2>审核案件</h2>
          <template #tools>
            <button :disabled="listBusy || editorOpen" @click="refresh">刷新列表</button>
          </template>
        </BusinessToolbar>
        <p v-if="listBusy" role="status">正在加载案件…</p>
        <FloatingNotice v-if="listError" :message="listError" tone="error"
          >{{ listError }} 请刷新列表或重试加载。</FloatingNotice
        >
        <FloatingNotice v-if="listNotice" :message="listNotice" tone="info">{{
          listNotice
        }}</FloatingNotice>
        <p v-if="!listBusy && !listError && !items.length">当前页暂无审核案件</p>
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
                <td>{{ whisperStatusLabels[item.status] }}</td>
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
      <ElDialog
        v-if="selectedId && !editorOpen"
        :model-value="true"
        title="树洞案件详情"
        width="min(56rem, calc(100vw - 2rem))"
        class="business-dialog workflow"
        top="2rem"
        :close-on-click-modal="false"
        @update:model-value="!$event && close()"
      >
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
      </ElDialog>
      <ElDialog
        v-if="editorOpen"
        v-model="editorOpen"
        :title="task === 'crisis' ? '升级树洞危机' : '处理树洞审核'"
        width="min(40rem, calc(100vw - 2rem))"
        class="business-dialog workflow"
        top="2rem"
        :close-on-click-modal="false"
        :close-on-press-escape="false"
        :before-close="closeProcessing"
        :show-close="!writing && !uncertain"
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
          <button :disabled="writing || uncertain" @click="cancelProcessing">取消处理</button>
        </template>
      </ElDialog>
    </template>
  </main>
</template>
