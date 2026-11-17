import { ElMessageBox } from 'element-plus'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-overlay.css'

/** 未保存修改统一使用可访问的确认框；取消、Esc和关闭均继续编辑。 */
export async function confirmDiscardChanges(
  message = '有未保存的修改，放弃后无法恢复。',
): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, '未保存的修改', {
      confirmButtonText: '放弃修改',
      cancelButtonText: '继续编辑',
      closeOnClickModal: false,
      closeOnPressEscape: true,
      distinguishCancelAndClose: true,
      type: 'warning',
      autofocus: false,
    })
    return true
  } catch {
    return false
  }
}
