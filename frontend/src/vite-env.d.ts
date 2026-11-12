/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_MOCK_SELF_CORRECT?: string
  readonly VITE_MOCK_RELIABILITY?: string
  readonly VITE_ENABLE_SELF_CORRECT?: string
  readonly VITE_ENABLE_RELIABILITY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
