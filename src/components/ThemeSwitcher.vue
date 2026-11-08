<script setup lang="ts">
import { ref } from 'vue'
import FloatingNotice from './FloatingNotice.vue'
import { ElRadioButton, ElRadioGroup } from 'element-plus'
import { useThemeStore } from '@/stores/theme'

const theme = useThemeStore()
const notice = ref('')
const revision = ref(0)
function change(value: unknown) {
  theme.setPreference(value)
  revision.value++
  notice.value = '界面主题已切换'
}
</script>

<template>
  <FloatingNotice v-if="notice" :message="notice" :revision="revision" tone="success" />
  <ElRadioGroup :model-value="theme.preference" size="small" aria-label="界面主题" @change="change">
    <ElRadioButton value="light">浅色</ElRadioButton>
    <ElRadioButton value="dark">深色</ElRadioButton>
    <ElRadioButton value="system">跟随系统</ElRadioButton>
  </ElRadioGroup>
</template>
