/** 为单文件组件提供类型边界，组件属性和模板由专用类型检查器验证。 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}
