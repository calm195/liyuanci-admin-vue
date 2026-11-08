import { useDictionariesStore } from '@/stores/dictionaries'

export function whisperStatusLabels(code: string): string {
  return useDictionariesStore().label('whisper_review_status', code)
}

export function whisperReportStatuses(code: string): string {
  return useDictionariesStore().label('whisper_report_status', code)
}

export function whisperCrisisStatuses(code: string): string {
  return useDictionariesStore().label('whisper_crisis_status', code)
}

export function whisperDeliveryLabels(code: string): string {
  return useDictionariesStore().label('whisper_delivery_status', code)
}

export function resourceStatusLabels(code: string): string {
  return useDictionariesStore().label('resource_status', code)
}
