<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElBreadcrumb, ElBreadcrumbItem } from 'element-plus'

const route = useRoute()
const title = computed(() =>
  typeof route.meta['title'] === 'string' ? route.meta['title'] : '页面不存在',
)
const group = computed(() => (typeof route.meta['group'] === 'string' ? route.meta['group'] : ''))
</script>

<template>
  <ElBreadcrumb separator="/" aria-label="面包屑导航">
    <ElBreadcrumbItem v-if="route.path !== '/'"
      ><RouterLink to="/">工作台</RouterLink></ElBreadcrumbItem
    >
    <ElBreadcrumbItem v-if="group && group !== '总览'">{{ group }}</ElBreadcrumbItem>
    <ElBreadcrumbItem
      ><span aria-current="page">{{ title }}</span></ElBreadcrumbItem
    >
  </ElBreadcrumb>
</template>
