/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_ADMIN_MOCK?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
