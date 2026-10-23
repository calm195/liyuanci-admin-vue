<script setup lang="ts">
import { ElRadioButton, ElRadioGroup } from 'element-plus'
import { useThemeStore } from '@/stores/theme'

const theme = useThemeStore()
</script>

<template>
  <ElRadioGroup
    :model-value="theme.preference"
    size="small"
    aria-label="界面主题"
    @change="theme.setPreference"
  >
    <ElRadioButton value="light">浅色</ElRadioButton>
    <ElRadioButton value="dark">深色</ElRadioButton>
    <ElRadioButton value="system">跟随系统</ElRadioButton>
  </ElRadioGroup>
</template>
