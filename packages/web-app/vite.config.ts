import { defineConfig } from "vite";

/**
 * Cross-origin isolation headers (COOP/COEP).
 *
 * Required to enable SharedArrayBuffer, which the polyphonic audio
 * adapter uses for the AudioWorklet → Inference Worker ring buffer
 * (SPEC 012). Without these the page will load but `crossOriginIsolated`
 * is false and the SAB constructor throws.
 *
 * Same headers must be configured at the production host. The dev
 * server preview uses the same config via `preview.headers`.
 */
const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// When the CLI spawns us (spawnWebApp.ts), it sets SYN_NO_AUTO_OPEN
// so we DON'T open a tab — the CLI does that itself, with the WS
// query params. Without this guard the user gets two tabs: one from
// Vite (bare URL), one from the CLI (with ws-port + instance).
// Direct `npm run dev` from packages/web-app still auto-opens.
const shouldAutoOpen = !process.env.SYN_NO_AUTO_OPEN;

export default defineConfig({
  server: {
    port: 3000,
    open: shouldAutoOpen ? "/" : false,
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  build: {
    outDir: "dist",
    // Source maps ship at ~17MB per bundle and blow up the CLI
    // package we bundle into. Off for production; developers pull
    // maps locally via `vite dev`.
    sourcemap: false,
  },
});
