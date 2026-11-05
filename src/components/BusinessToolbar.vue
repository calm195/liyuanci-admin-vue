<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div class="business-toolbar" role="group" :aria-label="label">
    <div v-if="$slots['default']" class="business-toolbar-actions"><slot /></div>
    <div v-if="$slots['tools']" class="business-toolbar-tools"><slot name="tools" /></div>
  </div>
</template>
