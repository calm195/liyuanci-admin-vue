import { config } from '@vue/test-utils'

// 页面行为测试将悬浮提示保留在挂载树中；仅替换通知Portal，不影响弹窗的Teleport；提示组件专项测试使用真实Portal 验证目标与生命周期。
config.global.stubs['NoticePortal'] = { template: '<slot />' }
