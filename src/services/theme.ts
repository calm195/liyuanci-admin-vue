export type ThemePreference = 'light' | 'dark' | 'system'

export const themeStorageKey = 'liyuanci-theme'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function readThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(themeStorageKey)
    return isThemePreference(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

/** 存储不可用时仍允许本次会话切换主题。 */
export function saveThemePreference(value: ThemePreference): void {
  try {
    window.localStorage.setItem(themeStorageKey, value)
  } catch {
    // 浏览器禁用存储时仅保留内存偏好，不影响页面使用。
  }
}
