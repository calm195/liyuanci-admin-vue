import { flushPromises } from '@vue/test-utils'
import { afterEach, expect, it } from 'vitest'
import { ElMessageBox } from 'element-plus'
import { confirmDiscardChanges } from './confirmDiscardChanges'
afterEach(() => ElMessageBox.close())
it('明确提供继续编辑与放弃修改，取消返回保留结果', async () => {
  const result = confirmDiscardChanges('示例输入尚未保存。')
  await flushPromises()
  const dialog = document.querySelector('[role="dialog"]')
  expect(dialog?.textContent).toContain('示例输入尚未保存')
  const buttons = [...(dialog?.querySelectorAll('button') ?? [])]
  const cancel = buttons.find((button) => button.textContent?.trim() === '继续编辑')
  expect(buttons.some((button) => button.textContent?.trim() === '放弃修改')).toBe(true)
  expect(cancel).toBeDefined()
  cancel?.click()
  expect(await result).toBe(false)
})
