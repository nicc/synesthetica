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

export default defineConfig({
  server: {
    port: 3000,
    open: "/", // Opens in default browser unless BROWSER env var is set
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
