<script setup lang="ts">
import { confirmDiscardChanges } from './confirmDiscardChanges'
import { onBeforeRouteLeave } from 'vue-router'
import { nextTick, onUpdated, ref, watch } from 'vue'
import { ElDialog, ElDrawer } from 'element-plus'
import 'element-plus/theme-chalk/el-drawer.css'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-overlay.css'
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    busy?: boolean
    dirty?: boolean | undefined
    presentation?: 'drawer' | 'dialog'
    guardRoute?: boolean
  }>(),
  { dirty: undefined, description: '', presentation: 'drawer', guardRoute: true },
)
const emit = defineEmits<{ close: [] }>()
const content = ref<HTMLElement | null>(null)
let initial = ''
let touched = false
let opener: HTMLElement | null = null
function values() {
  return JSON.stringify(
    [...(content.value?.querySelectorAll('input, textarea, select') ?? [])].map((element) => {
      if (element instanceof HTMLInputElement)
        return [element.name, element.type, element.value, element.checked]
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
        return [element.name, element.value]
      return []
    }),
  )
}
function captureInitial() {
  if (!touched) initial = values()
}
function edited() {
  touched = true
}
async function canClose() {
  if (!props.open) return true
  if (props.busy) return false
  const dirty = props.dirty ?? (touched && values() !== initial)
  return !dirty || (await confirmDiscardChanges('关闭将放弃尚未保存的修改。'))
}
async function close() {
  if (await canClose()) emit('close')
}
function closeFromControl(event: MouseEvent) {
  if (!(event.target instanceof Element) || !event.target.closest('[data-overlay-close]')) return
  event.preventDefault()
  event.stopImmediatePropagation()
  void close()
}
watch(
  () => props.open,
  async (open) => {
    touched = false
    initial = ''
    if (open) {
      opener =
        globalThis.document.activeElement instanceof HTMLElement
          ? globalThis.document.activeElement
          : null
      await nextTick()
      captureInitial()
    } else {
      await nextTick()
      if (opener?.isConnected) opener.focus()
    }
  },
  { immediate: true, flush: 'post' },
)
watch(content, captureInitial, { flush: 'post' })
onUpdated(captureInitial)
onBeforeRouteLeave(() => !props.guardRoute || canClose())
defineExpose({ close })
</script>

<template>
  <component
    :is="presentation === 'dialog' ? ElDialog : ElDrawer"
    v-if="open"
    :model-value="open"
    :title="title"
    size="min(640px, 100vw)"
    width="min(640px, calc(100vw - 32px))"
    class="workspace-drawer experience-page"
    :append-to-body="false"
    :destroy-on-close="true"
    :close-on-click-modal="!busy"
    :close-on-press-escape="!busy"
    :show-close="!busy"
    :before-close="close"
  >
    <template #header>
      <div class="workspace-drawer-heading">
        <h2>{{ title }}</h2>
        <p v-if="description">{{ description }}</p>
      </div>
    </template>
    <div
      ref="content"
      @input.capture="edited"
      @change.capture="edited"
      @click.capture="closeFromControl"
    >
      <slot :close="close" />
    </div>
    <template v-if="$slots['footer']" #footer>
      <div @click.capture="closeFromControl"><slot name="footer" :close="close" /></div>
    </template>
  </component>
</template>

<style>
.workspace-drawer {
  --el-drawer-padding-primary: 24px;
}
.workspace-drawer .el-drawer__header {
  margin-bottom: 0;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
}
.workspace-drawer button.el-drawer__close-btn {
  padding: 0;
  width: 32px;
  height: 32px;
  min-height: 32px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
}
.workspace-drawer .el-drawer__body {
  min-height: 0;
  overflow: auto;
  padding: 24px;
}
.workspace-drawer .el-drawer__footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
}
.workspace-drawer-heading h2 {
  font-size: 20px;
  line-height: 28px;
  color: var(--text-primary);
  margin: 0;
}
.workspace-drawer-heading p {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 6px 0 0;
}
.workspace-drawer .drawer-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
@media (max-width: 600px) {
  .workspace-drawer {
    --el-drawer-padding-primary: 20px;
  }
  .workspace-drawer .el-drawer__body {
    padding: 20px;
  }
}
</style>
