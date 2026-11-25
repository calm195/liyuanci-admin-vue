import { onScopeDispose } from 'vue'

/** 输入法选词完成后才计时，其他筛选变化立即执行。 */
export function useAutoSearch(search: () => unknown, available: () => boolean = () => true) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let composing = false
  function cancel() {
    clearTimeout(timer)
    timer = undefined
  }
  function run() {
    cancel()
    if (!composing && available()) void search()
  }
  function input(event?: Event) {
    if (composing || (event instanceof InputEvent && event.isComposing)) return
    const field = event?.target
    if (field instanceof HTMLInputElement && !field.value) {
      run()
      return
    }
    cancel()
    timer = setTimeout(run, 300)
  }
  onScopeDispose(cancel)
  return {
    input,
    cancel,
    change(event: Event) {
      const field = event.target
      if (field instanceof HTMLElement && field.closest('[data-manual-action]')) return
      if (
        field instanceof HTMLSelectElement ||
        (field instanceof HTMLInputElement && ['date', 'checkbox', 'radio'].includes(field.type))
      )
        run()
    },
    start() {
      composing = true
      cancel()
    },
    end() {
      composing = false
      input()
    },
  }
}
