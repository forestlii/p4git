/// <reference types="vite/client" />

import type { P4GitApi } from '../../shared/types'

declare global {
  interface Window {
    p4git: P4GitApi
  }
}

export {}
