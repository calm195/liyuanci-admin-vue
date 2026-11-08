<script setup lang="ts">
import NoticePortal from './NoticePortal.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useNoticesStore } from '@/stores/notices'
import type { NoticeTone } from '@/stores/notices'
const props = withDefaults(
  defineProps<{ message: string; tone?: NoticeTone; revision?: number }>(),
  { tone: 'info', revision: 0 },
)
const notices = useNoticesStore()
const id = notices.allocate()
const element = ref<HTMLElement | null>(null)
const effectiveTone = computed(() =>
  props.tone !== 'pending' && /尚未确认|未获确认|未确认|不明确/.test(props.message)
    ? 'uncertain'
    : props.tone,
)
const visible = computed(() => notices.items.some((item) => item.id === id))
let timer: ReturnType<typeof globalThis.setTimeout> | undefined
let remaining = 0
let started = 0
let pointerInside = false
let focusInside = false
function stopTimer() {
  if (timer !== undefined) {
    globalThis.clearTimeout(timer)
    timer = undefined
    remaining = Math.max(0, remaining - (Date.now() - started))
  }
}
function close() {
  stopTimer()
  pointerInside = false
  focusInside = false
  notices.remove(id)
}
function resume() {
  if (
    pointerInside ||
    focusInside ||
    !visible.value ||
    timer !== undefined ||
    effectiveTone.value === 'pending'
  )
    return
  started = Date.now()
  timer = globalThis.setTimeout(close, remaining)
}
function pointer(value: boolean) {
  pointerInside = value
  if (value) stopTimer()
  else resume()
}
function focus(value: boolean) {
  focusInside = value
  if (value) stopTimer()
  else resume()
}
watch(
  () => [props.message, props.tone, props.revision],
  () => {
    stopTimer()
    notices.show(id, props.message, effectiveTone.value)
    remaining = {
      success: 3000,
      warning: 5000,
      error: 6000,
      uncertain: 8000,
      info: 4000,
      pending: 0,
    }[effectiveTone.value]
    resume()
  },
  { immediate: true },
)
let observer: ResizeObserver | undefined
watch(
  element,
  (value) => {
    observer?.disconnect()
    if (!value) return
    const measure = () => notices.measure(id, value.getBoundingClientRect().height || 76)
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure)
      observer.observe(value)
    }
  },
  { flush: 'post' },
)
onBeforeUnmount(() => {
  stopTimer()
  observer?.disconnect()
  notices.remove(id)
})
</script>
<template>
  <div
    v-if="
      !visible &&
      message &&
      (tone === 'error' || tone === 'warning' || effectiveTone === 'uncertain')
    "
    class="notice-retained"
  >
    <slot>{{ message }}</slot>
  </div>
  <NoticePortal>
    <aside
      v-if="visible"
      ref="element"
      class="floating-notice"
      :class="`floating-notice--${effectiveTone}`"
      :style="{ top: `${notices.offsets.get(id) ?? 20}px` }"
      :role="tone === 'error' ? 'alert' : 'status'"
      :aria-live="tone === 'error' ? 'assertive' : 'polite'"
      aria-atomic="true"
      @mouseenter="pointer(true)"
      @mouseleave="pointer(false)"
      @focusin="focus(true)"
      @focusout="focus(false)"
    >
      <span class="floating-notice-icon" aria-hidden="true">{{
        effectiveTone === 'error' ? '!' : effectiveTone === 'success' ? '✓' : 'i'
      }}</span>
      <div class="floating-notice-content">
        <slot>{{ message }}</slot>
      </div>
      <button class="floating-notice-close" type="button" aria-label="关闭提示" @click="close">
        ×
      </button>
    </aside>
  </NoticePortal>
</template>
<style scoped>
.floating-notice {
  position: fixed;
  z-index: 2147483000;
  right: 20px;
  width: min(440px, calc(100vw - 40px));
  max-height: calc((100dvh - 80px) / 3);
  overflow-y: auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-left: 4px solid var(--accent-color);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text-primary);
  box-shadow: 0 8px 28px rgb(0 0 0 / 22%);
  font-size: 14px;
  line-height: 1.6;
  box-sizing: border-box;
}
.floating-notice--warning,
.floating-notice--uncertain {
  border-left-color: #b7791f;
}
.notice-retained {
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.floating-notice--error {
  border-left-color: #e5484d;
}
.floating-notice--success {
  border-left-color: #22946e;
}
.floating-notice-content {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.floating-notice-content :deep(p) {
  margin: 0;
}
.floating-notice-icon {
  flex: 0 0 20px;
  text-align: center;
  font-weight: 700;
}
button.floating-notice-close {
  flex: 0 0 28px;
  min-width: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 22px;
  line-height: 1;
}
button.floating-notice-close:hover {
  background: var(--surface-muted);
}
</style>
