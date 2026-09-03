import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Built assets land inside the Foundry module so the same build can be
// (a) served by Foundry itself at /modules/fvtt-mobile-bridge/app/ and
// (b) packaged into the Android APK by Capacitor.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../module/app",
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false
  },
  server: { host: true, port: 5173 }
});
