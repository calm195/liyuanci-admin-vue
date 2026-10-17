/** TypeScript-only tools need an SFC boundary; vue-tsc checks actual component props and templates. */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}
