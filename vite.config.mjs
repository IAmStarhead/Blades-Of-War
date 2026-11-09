import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 8080,
    allowedHosts: true
  },
  preview: {
    host: "0.0.0.0",
    port: 8080,
    allowedHosts: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    cssMinify: false,
    chunkSizeWarningLimit: 2500,
    sourcemap: false,
    rollupOptions: {
      output: {
        format: "iife",
        entryFileNames: "bow-bundle.js",
        assetFileNames: "bow-assets.[ext]"
      }
    }
  }
});
