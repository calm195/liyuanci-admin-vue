import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useThemeStore } from './theme'
import { themeStorageKey } from '@/services/theme'

let pinia: ReturnType<typeof createPinia>
let systemDark = false
let mediaEvents: EventTarget
const removeListener = vi.fn()
beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
  systemDark = false
  mediaEvents = new EventTarget()
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return systemDark
    },
    addEventListener: (type: string, callback: EventListener) =>
      mediaEvents.addEventListener(type, callback),
    removeEventListener: (type: string, callback: EventListener) => {
      removeListener(type)
      mediaEvents.removeEventListener(type, callback)
    },
  }))
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => {
  disposePinia(pinia)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function changeSystem(dark: boolean) {
  systemDark = dark
  mediaEvents.dispatchEvent(Object.assign(new Event('change'), { matches: dark }))
  await nextTick()
}
describe('REQ-019 管理端主题偏好', () => {
  it('读取已保存的深色偏好，并将手动浅色选择持久化', async () => {
    localStorage.setItem(themeStorageKey, 'dark')
    const theme = useThemeStore()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
    theme.setPreference('light')
    await nextTick()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem(themeStorageKey)).toBe('light')
    disposePinia(pinia)
    pinia = createPinia()
    setActivePinia(pinia)
    expect(useThemeStore().preference).toBe('light')
  })
  it('默认跟随系统，手动选择后不受系统变化影响，恢复跟随后重新同步', async () => {
    const theme = useThemeStore()
    expect(theme.preference).toBe('system')
    await changeSystem(true)
    expect(theme.dark).toBe(true)
    theme.setPreference('light')
    await changeSystem(false)
    await changeSystem(true)
    expect(theme.dark).toBe(false)
    theme.setPreference('system')
    await nextTick()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
  it('非法偏好回退系统，忽略不合法的组件值', () => {
    localStorage.setItem(themeStorageKey, 'invalid')
    const theme = useThemeStore()
    theme.setPreference({ value: 'dark' })
    expect(theme.preference).toBe('system')
  })
  it('存储被禁用时仍然可以切换，且不抛出异常', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('存储不可用')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('存储不可用')
    })
    const theme = useThemeStore()
    theme.setPreference('dark')
    await nextTick()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
  it('同步其他标签页的主题，并在销毁后解除监听', async () => {
    const theme = useThemeStore()
    window.dispatchEvent(new StorageEvent('storage', { key: themeStorageKey, newValue: 'dark' }))
    await nextTick()
    expect(theme.dark).toBe(true)
    disposePinia(pinia)
    window.dispatchEvent(new StorageEvent('storage', { key: themeStorageKey, newValue: 'light' }))
    expect(theme.preference).toBe('dark')
    expect(removeListener).toHaveBeenCalledWith('change')
  })
  it('没有系统主题 API 时仍可使用手动深色', async () => {
    vi.stubGlobal('matchMedia', undefined)
    const theme = useThemeStore()
    expect(theme.dark).toBe(false)
    theme.setPreference('dark')
    await nextTick()
    expect(theme.dark).toBe(true)
  })
})
