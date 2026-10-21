/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_ADMIN_MOCK?: string
  readonly VITE_ADMIN_AUTH_INTEGRATION?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
