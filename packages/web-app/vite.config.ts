import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3000,
    open: "/", // Opens in default browser unless BROWSER env var is set
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
