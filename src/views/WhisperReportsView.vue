<script setup lang="ts">
import { ElDrawer } from 'element-plus'
import 'element-plus/theme-chalk/el-drawer.css'
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
  <main class="panel workflow">
    <p class="eyebrow">安全治理 / 树洞举报</p>
    <h1>树洞举报</h1>
    <p>仅处理当前授权举报及其来源，不提供匿名作者身份查询。</p>
    <template v-if="workspace.allowed()">
      <p v-if="notice" role="status">{{ notice }}</p>
      <section v-if="penaltyReceipt" class="workflow-box" aria-label="树洞处罚回执">
        <h2>处罚回执</h2>
        <p>
          {{ penaltyReceipt.id }} ·
          {{ { warning: '警告', mute: '禁言', ban: '封禁' }[penaltyReceipt.kind] }}
        </p>
        <p v-if="penaltyReceipt.ends_at">截至 {{ penaltyReceipt.ends_at }}</p>
        <p v-else>{{ penaltyReceipt.kind === 'ban' ? '永久封禁' : '无到期时间' }}</p>
      </section>
      <div class="workflow-grid">
        <section aria-label="树洞举报列表" :aria-busy="listBusy">
          <div class="workflow-actions">
            <h2>举报案件</h2>
            <button :disabled="listBusy || editorOpen" @click="refresh">刷新列表</button>
          </div>
          <p v-if="listBusy" role="status">正在读取举报…</p>
          <p v-if="listError" role="alert">{{ listError }} 请刷新列表或重试加载。</p>
          <p v-if="listNotice" role="status">{{ listNotice }}</p>
          <p v-if="!listBusy && !listError && !items.length">当前页暂无举报</p>
          <ul v-if="items.length" class="workflow-list">
            <li v-for="item in items" :key="item.id">
              <button
                :disabled="editorOpen"
                :aria-pressed="selectedId === item.id"
                @click="openCase(item.id)"
              >
                {{ whisperKindLabels[item.source.kind] }} ·
                {{ whisperReportStatuses[item.status] }} · {{ item.id }}
                <span
                  >举报版本 {{ item.version }} · 正文版本 {{ item.source.content_version }}</span
                >
              </button>
            </li>
          </ul>
          <button v-if="nextCursor !== null" :disabled="listBusy || editorOpen" @click="more">
            {{ listError ? '重试加载' : '加载更多举报' }}
          </button>
        </section>
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
              {{ detail.id }} · {{ whisperReportStatuses[detail.status] }} · 举报版本
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
      </div>
      <ElDrawer
        v-if="editorOpen"
        v-model="editorOpen"
        :title="whisperTaskLabels[task]"
        size="min(40rem, 100vw)"
        :close-on-click-modal="false"
        :close-on-press-escape="false"
        :before-close="closeProcessing"
        :show-close="!writing && !uncertain"
      >
        <template v-if="detail">
          <p>
            {{ detail.id }} · 举报版本 {{ detail.version }} · 正文版本
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
            <p>{{ detail.id }} · 举报版本 {{ detail.version }}</p>
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
      </ElDrawer>
    </template>
  </main>
</template>
