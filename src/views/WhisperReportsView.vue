<script setup lang="ts">
import BusinessToolbar from '@/components/BusinessToolbar.vue'
import { displayBeijingTime } from '@/utils/admin-time'
import { ElDialog } from 'element-plus'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-overlay.css'
import {
  useWhisperReports,
  whisperPenaltyLabels,
  whisperReportStatuses,
  whisperTaskLabels,
} from '@/composables/useWhisperReports'
import { whisperKindLabels } from '@/composables/useWhisperReviews'
const {
  items,
  nextCursor,
  listBusy,
  listError,
  listNotice,
  selectedId,
  detail,
  control,
  matching,
  controlError,
  loading,
  error,
  notice,
  penaltyReceipt,
  editorOpen,
  task,
  decision,
  level,
  reason,
  confirming,
  writing,
  uncertain,
  workspace,
  options,
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
} = useWhisperReports()
</script>
<template>
  <main class="panel workflow" aria-label="树洞举报">
    <p>仅处理当前授权举报及其来源，不提供匿名作者身份查询。</p>
    <template v-if="workspace.allowed()">
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="error && !selectedId && !editorOpen" role="alert">{{ error }}</p>
      <section v-if="penaltyReceipt" class="workflow-box" aria-label="树洞处罚回执">
        <h2>处罚回执</h2>
        <p>
          {{ { warning: '警告', mute: '禁言', ban: '封禁' }[penaltyReceipt.kind] }}
        </p>
        <p v-if="penaltyReceipt.ends_at">截至 {{ penaltyReceipt.ends_at }}</p>
        <p v-else>{{ penaltyReceipt.kind === 'ban' ? '永久封禁' : '无到期时间' }}</p>
      </section>

      <section aria-label="树洞举报列表" :aria-busy="listBusy">
        <BusinessToolbar label="树洞举报操作栏">
          <h2>举报案件</h2>
          <template #tools>
            <button :disabled="listBusy || editorOpen" @click="refresh">刷新列表</button>
          </template>
        </BusinessToolbar>
        <p v-if="listBusy" role="status">正在读取举报…</p>
        <p v-if="listError" role="alert">{{ listError }} 请刷新列表或重试加载。</p>
        <p v-if="listNotice" role="status">{{ listNotice }}</p>
        <p v-if="!listBusy && !listError && !items.length">当前页暂无举报</p>
        <div v-if="items.length" class="business-table">
          <table>
            <thead>
              <tr>
                <th scope="col">本页序号</th>
                <th scope="col">内容类型</th>
                <th scope="col">状态</th>
                <th scope="col">举报版本</th>
                <th scope="col">正文版本</th>
                <th scope="col">创建时间（北京时间）</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in items" :key="item.id">
                <th scope="row">{{ index + 1 }}</th>
                <td>{{ whisperKindLabels[item.source.kind] }}</td>
                <td>{{ whisperReportStatuses[item.status] }}</td>
                <td>{{ item.version }}</td>
                <td>{{ item.source.content_version }}</td>
                <td>{{ displayBeijingTime(item.created_at) }}</td>
                <td>
                  <button
                    :disabled="editorOpen"
                    :aria-label="`查看第 ${index + 1} 条举报`"
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
          <button v-if="nextCursor !== null" :disabled="listBusy || editorOpen" @click="more">
            {{ listError ? '重试加载' : '加载更多举报' }}
          </button>
        </div>
      </section>
      <ElDialog
        v-if="selectedId && !editorOpen"
        :model-value="true"
        title="树洞举报详情"
        width="min(56rem, calc(100vw - 2rem))"
        class="business-dialog workflow"
        top="2rem"
        :close-on-click-modal="false"
        @update:model-value="!$event && close()"
      >
        <section aria-label="树洞举报详情" :aria-busy="loading">
          <h2>举报详情（只读）</h2>
          <p v-if="error" role="alert">{{ error }}</p>
          <p v-if="loading" role="status">正在读取举报和治理状态…</p>
          <button
            v-if="selectedId && !loading"
            :disabled="editorOpen"
            @click="openCase(selectedId)"
          >
            重新读取举报
          </button>
          <template v-if="detail">
            <button :disabled="editorOpen" @click="close">关闭举报</button>
            <p>
              {{ whisperReportStatuses[detail.status] }} · 举报版本
              {{ detail.version }}
            </p>
            <p>
              {{ whisperKindLabels[detail.source.kind] }} · 正文版本
              {{ detail.source.content_version }}
            </p>
            <p>举报类型：{{ detail.type_code }}</p>
            <p class="workflow-body">举报说明：{{ detail.description ?? '未填写说明' }}</p>
            <blockquote class="workflow-body">{{ detail.body }}</blockquote>
            <p v-if="controlError" role="alert">{{ controlError }}</p>
            <p v-if="control">
              治理版本 {{ control.version }} ·
              {{ control.restricted ? '存在普通限制' : '无普通限制' }}
            </p>
            <p v-if="control && !matching" class="banner">
              举报正文版本与当前治理对象不一致，治理操作已停用，请重新读取后核对。
            </p>
            <div class="workflow-actions">
              <button
                v-for="option in options"
                :key="option"
                :disabled="editorOpen"
                @click="startProcessing(option)"
              >
                {{
                  option === 'restriction'
                    ? control?.restricted
                      ? '解除普通限制'
                      : '设置普通限制'
                    : whisperTaskLabels[option]
                }}
              </button>
            </div>
            <p v-if="!options.length">当前没有可执行的处理动作。</p>
            <p>处罚须以已确认举报为依据；解除普通限制不代表直接公开，也不解除危机或隐私屏障。</p>
          </template>
          <p v-else-if="!selectedId && !loading">选择举报，按需读取授权内容。</p>
        </section>
      </ElDialog>
      <ElDialog
        v-if="editorOpen"
        v-model="editorOpen"
        :title="whisperTaskLabels[task]"
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
            举报版本 {{ detail.version }} · 正文版本
            {{ detail.source.content_version }}
          </p>
          <p v-if="task === 'restriction' || task === 'penalty'">治理版本 {{ control?.version }}</p>
          <p v-if="error" role="alert">{{ error }}</p>
          <form @submit.prevent="check">
            <fieldset :disabled="writing || confirming || uncertain">
              <legend>{{ whisperTaskLabels[task] }}</legend>
              <template v-if="task === 'decision'">
                <label
                  ><input
                    v-model="decision"
                    type="radio"
                    name="whisper-report-decision"
                    value="confirmed"
                  />确认举报</label
                >
                <label
                  ><input
                    v-model="decision"
                    type="radio"
                    name="whisper-report-decision"
                    value="dismissed"
                  />驳回举报</label
                >
              </template>
              <template v-if="task === 'penalty'">
                <label for="whisper-penalty-level">处罚等级</label>
                <select id="whisper-penalty-level" v-model="level">
                  <option v-for="(label, code) in whisperPenaltyLabels" :key="code" :value="code">
                    {{ label }}
                  </option>
                </select>
              </template>
              <p v-if="task === 'restriction'">
                {{
                  control?.restricted
                    ? '解除普通限制后仍需按当前条件重新复核，不会直接公开。'
                    : '设置普通限制将添加治理屏障，不替代危机或隐私处置。'
                }}
              </p>
              <label for="whisper-report-reason"
                >处理理由（必填，最多500字，表情按一个字符计算）</label
              >
              <textarea id="whisper-report-reason" v-model="reason" required rows="3"></textarea>
              <button type="submit" :disabled="!valid">核对操作</button>
            </fieldset>
          </form>
          <section v-if="confirming" class="workflow-box" aria-label="树洞举报操作确认">
            <h3>确认操作</h3>
            <p>举报版本 {{ detail.version }}</p>
            <p>
              {{
                task === 'decision'
                  ? decision === 'confirmed'
                    ? '确认举报'
                    : '驳回举报'
                  : task === 'restriction'
                    ? control?.restricted
                      ? '解除普通限制'
                      : '设置普通限制'
                    : task === 'penalty'
                      ? whisperPenaltyLabels[level]
                      : '升级危机并隔离'
              }}
            </p>
            <p class="workflow-body">理由：{{ reason }}</p>
            <p>以服务端当前版本与权限为准，冲突后不会自动重提。</p>
            <button :disabled="writing || !options.includes(task)" @click="submit">
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
