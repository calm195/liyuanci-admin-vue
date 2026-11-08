import { useDictionariesStore } from '@/stores/dictionaries'
/** 供应商原始标签码保持稳定，中文名称由管理端字典维护。 */
export function builtinWordlistLabel(label: string): string {
  return useDictionariesStore().label('builtin_wordlist_label', label)
}
