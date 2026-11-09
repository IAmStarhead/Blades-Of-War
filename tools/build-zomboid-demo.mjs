#!/usr/bin/env node
/* ============================================================================
   Сборщик автономного интерактивного 3D-примера дизайна Project Zomboid B41+
   Создаёт self-contained файл dist/Zomboid3D-Demo.html (мужчина, женщина и
   средневековый колодец на Three.js WebGL), не затрагивая dist/BladesOfWar.html.
   ============================================================================ */

import fs from "node:fs";
import path from "node:path";
import { build } from "vite";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
fs.mkdirSync(distDir, { recursive: true });

await build({
  configFile: false,
  root: rootDir,
  logLevel: "warn",
  build: {
    outDir: "dist",
    emptyOutDir: false,
    minify: true,
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
    lib: {
      entry: path.join(rootDir, "src/engine3d/zomboid/showcase3d.js"),
      name: "BOWZomboidShowcase",
      formats: ["iife"],
      fileName: () => "zomboid-showcase-bundle.js"
    }
  }
});

const bundlePath = path.join(distDir, "zomboid-showcase-bundle.js");
const jsCode = fs.readFileSync(bundlePath, "utf8").replace(/<\/script>/gi, "<\\/script>");
fs.unlinkSync(bundlePath);

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #pz-showcase-root {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #2d3034;
    color: #e9edf2;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    user-select: none;
    -webkit-font-smoothing: antialiased;
  }
  .pz-shell {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .pz-viewport {
    position: absolute;
    inset: 0;
    cursor: grab;
  }
  .pz-viewport:active {
    cursor: grabbing;
  }
  /* Верхняя плашка (строго без backdrop-filter ради чистых 60+ FPS) */
  .pz-topbar {
    position: absolute;
    top: 14px;
    left: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    pointer-events: none;
    z-index: 10;
  }
  .pz-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(24, 27, 31, 0.90);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    padding: 9px 14px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
    pointer-events: auto;
  }
  .pz-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #16181c;
    background: #d8b56c;
    padding: 4px 7px;
    border-radius: 5px;
    white-space: nowrap;
  }
  .pz-titles h1 {
    font-size: 14px;
    font-weight: 700;
    color: #f4f6f9;
    line-height: 1.2;
  }
  .pz-titles p {
    font-size: 11.5px;
    color: #a6afb9;
    margin-top: 2px;
  }
  .pz-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(24, 27, 31, 0.90);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: #c7cfd8;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
    pointer-events: auto;
  }
  .pz-fps {
    font-weight: 700;
    color: #8be28b;
  }
  .pz-sep {
    color: #5c6470;
  }
  .pz-dl-btn {
    margin-left: 6px;
    padding: 5px 10px;
    border-radius: 6px;
    background: #3a414a;
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #f2f5f8;
    text-decoration: none;
    font-size: 11.5px;
    font-weight: 600;
    transition: background 0.15s ease;
  }
  .pz-dl-btn:hover {
    background: #4b5460;
  }
  .pz-hint {
    position: absolute;
    top: 74px;
    left: 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 11.5px;
    color: #b7c0ca;
    background: rgba(24, 27, 31, 0.76);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 6px 11px;
    pointer-events: none;
    z-index: 9;
  }
  .pz-hint b {
    color: #e5c683;
    font-weight: 600;
  }
  /* Нижняя док-панель переключения комплектов и поз */
  .pz-dock {
    position: absolute;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
    max-width: calc(100vw - 24px);
    background: rgba(22, 25, 29, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 12px;
    padding: 10px 14px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.42);
    z-index: 10;
  }
  .pz-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .pz-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #8f99a5;
    padding-left: 2px;
  }
  .pz-segmented {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    background: #141619;
    padding: 3px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.07);
  }
  .pz-segmented button {
    appearance: none;
    border: none;
    background: transparent;
    color: #bcc5cf;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
    white-space: nowrap;
  }
  .pz-segmented button:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.07);
  }
  .pz-segmented button.is-active {
    background: #d8b56c;
    color: #16181c;
  }
  @media (max-width: 820px) {
    .pz-topbar { flex-direction: column; align-items: flex-start; }
    .pz-hint { display: none; }
    .pz-dock { bottom: 10px; padding: 8px 10px; gap: 8px; }
    .pz-segmented button { padding: 5px 8px; font-size: 11px; }
  }
`;

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="theme-color" content="#2d3034" />
  <title>Blades Of War — 3D Прототип дизайна (Project Zomboid Style)</title>
  <style>${css}</style>
</head>
<body>
  <div id="pz-showcase-root"></div>
  <script>${jsCode}</script>
</body>
</html>
`;

const outPath = path.join(distDir, "Zomboid3D-Demo.html");
fs.writeFileSync(outPath, html, "utf8");
console.log("✔ Собран 3D-стенд дизайна:", outPath, "(" + Math.round(Buffer.byteLength(html) / 1024) + " KB)");
