/// <reference types="vite-plugin-pwa/client" />
// (the reference above types `virtual:pwa-register`, used in main.tsx)

/** Injected by vite.config.ts `define` (absent in unit tests). */
declare const __APP_VERSION__: string;
declare const __APP_BUILT__: string;
