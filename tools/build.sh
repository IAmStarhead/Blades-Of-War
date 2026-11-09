#!/usr/bin/env bash
# ============================================================
# Сборка Blades Of War 0.0.9.3 (Vite + Three.js Low-Poly 3D)
# Собирает модульный 3D-движок и симуляцию в автономный файл
# dist/BladesOfWar.html (без внешних запросов, работает из file:// и HTTP).
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

npx vite build

node - <<'EOF'
const fs = require("fs");
const path = require("path");

const distDir = path.join(process.cwd(), "dist");
const cssPath = path.join(distDir, "bow-assets.css");
const jsPath = path.join(distDir, "bow-bundle.js");
const outPath = path.join(distDir, "BladesOfWar.html");

const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";
const js = fs.readFileSync(jsPath, "utf8").replace(/<\/script>/gi, "<\\/script>");

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="theme-color" content="#080b10" />
  <title>Blades Of War — Студёный Брод (0.0.9.3 · Low-Poly 3D)</title>
  <style>${css}</style>
</head>
<body>
  <div id="bow-root"></div>
  <script>${js}</script>
</body>
</html>
`;

fs.writeFileSync(outPath, html, "utf8");
fs.copyFileSync(outPath, path.join(distDir, "index.html"));
if (fs.existsSync(cssPath)) fs.unlinkSync(cssPath);
if (fs.existsSync(jsPath)) fs.unlinkSync(jsPath);
console.log("✔ Собрано:", outPath, "(" + Math.round(Buffer.byteLength(html) / 1024) + " KB)");
EOF
