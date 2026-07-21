import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Faust WASM compiler (libfaust) ships large .wasm/.data assets that must be
// served as-is. We copy them into /public/faustwasm (see scripts/copy-faust.mjs)
// and reference them at runtime by URL, so they are excluded from optimizeDeps.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@grame/faustwasm"],
  },
});
