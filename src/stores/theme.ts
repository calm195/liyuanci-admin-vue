import { computed, onScopeDispose, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  isThemePreference,
  readThemePreference,
  saveThemePreference,
  themeStorageKey,
} from '@/services/theme'

export const useThemeStore = defineStore('appearance', () => {
  const preference = ref(readThemePreference())
  const media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : undefined
  const systemDark = ref(media?.matches ?? false)
  const dark = computed(
    () => preference.value === 'dark' || (preference.value === 'system' && systemDark.value),
  )

  function updateSystem(event: MediaQueryListEvent) {
    systemDark.value = event.matches
  }
  function updateStorage(event: StorageEvent) {
    if (event.key !== themeStorageKey && event.key !== null) return
    preference.value = isThemePreference(event.newValue) ? event.newValue : 'system'
  }
  media?.addEventListener('change', updateSystem)
  window.addEventListener('storage', updateStorage)
  onScopeDispose(() => {
    media?.removeEventListener('change', updateSystem)
    window.removeEventListener('storage', updateStorage)
  })
  watch(
    dark,
    (value) => {
      document.documentElement.classList.toggle('dark', value)
      document.documentElement.style.colorScheme = value ? 'dark' : 'light'
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', value ? '#111827' : '#f4f6f9')
    },
    { immediate: true },
  )

  function setPreference(value: unknown) {
    if (!isThemePreference(value)) return
    preference.value = value
    saveThemePreference(value)
  }
  return { preference, dark, setPreference }
})
