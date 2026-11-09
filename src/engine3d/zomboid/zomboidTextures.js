/* ============================================================================
   ZOMBOID-STYLE HAND-PAINTED UV TEXTURES (Project Zomboid Build 41+ Aesthetic)
   Мягкая живописная прорисовка кожи, мышц, лица, волос, складок одежды и
   средневекового камня/дерева/кованого железа.
   ============================================================================ */

import * as THREE from "three";

function create2DCanvas(w, h, customFactory) {
  if (customFactory) { return customFactory(w, h); }
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  return cv;
}

function softRadial(ctx, cx, cy, r, innerCol, outerCol) {
  const g = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r);
  g.addColorStop(0, innerCol);
  g.addColorStop(1, outerCol);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function softVBand(ctx, x, y0, w, h, topCol, midCol, botCol) {
  const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, topCol);
  g.addColorStop(0.5, midCol);
  g.addColorStop(1, botCol);
  ctx.fillStyle = g;
  ctx.fillRect(x, y0, w, h);
}

/* ---------- 1. UV-КАРТА ЛИЦА И ГОЛОВЫ (512×512) ----------
   u = 0.5 — центр лица (+Z); u = 0 / 1 — затылок (-Z).
   v = 0 (y = 512) — низ подбородка/шеи; v = 1 (y = 0) — макушка. */
export function buildHeadTextureCanvas(opts = {}, canvasFactory = null) {
  const W = 512;
  const H = 512;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");

  const fem = !!opts.female;
  const skinBase = fem ? "#efc8a2" : "#e5b88c";
  const skinWarm = fem ? "#e2ae84" : "#d49f71";
  const skinShadow = fem ? "#c68d64" : "#b57e52";
  const hairBase = opts.hairColor || (fem ? "#4b2614" : "#5e3619");
  const hairDark = fem ? "#2b1409" : "#381e0c";
  const hairLight = fem ? "#703d23" : "#7e4d28";

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, skinBase);
  bg.addColorStop(0.60, skinBase);
  bg.addColorStop(0.84, skinWarm);
  bg.addColorStop(1, skinShadow);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  /* Мягкий живой румянец на скулах и щеках */
  softRadial(ctx, W * 0.42, H * 0.53, 34, "rgba(212, 122, 96, 0.25)", "rgba(212, 122, 96, 0)");
  softRadial(ctx, W * 0.58, H * 0.53, 34, "rgba(212, 122, 96, 0.25)", "rgba(212, 122, 96, 0)");

  /* Тень под подбородком */
  softRadial(ctx, W * 0.50, H * 0.90, 90, "rgba(110, 64, 36, 0.36)", "rgba(110, 64, 36, 0)");

  /* Глазные впадины (vFrac = 0.53 -> cy = 240) — выразительный масштаб Zomboid (image-51!) */
  const eyeY = H * 0.47;
  const eyeDX = fem ? 36 : 38;
  softRadial(ctx, W * 0.5 - eyeDX, eyeY, 28, "rgba(122, 72, 42, 0.45)", "rgba(122, 72, 42, 0)");
  softRadial(ctx, W * 0.5 + eyeDX, eyeY, 28, "rgba(122, 72, 42, 0.45)", "rgba(122, 72, 42, 0)");

  /* Крупные читаемые глаза и густые брови в стиле Project Zomboid (image-51!) */
  [-1, 1].forEach((side) => {
    const ex = W * 0.5 + side * eyeDX;
    /* Светлый белок глаза */
    ctx.fillStyle = "#f5efe6";
    ctx.beginPath();
    ctx.ellipse(ex, eyeY + 3, fem ? 16.5 : 15.5, fem ? 8.8 : 7.2, 0, 0, Math.PI * 2);
    ctx.fill();

    /* Крупная тёмная радужка и зрачок */
    ctx.fillStyle = fem ? "#362114" : "#241911";
    ctx.beginPath();
    ctx.arc(ex - side * 1.5, eyeY + 3, fem ? 8.2 : 7.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0d0906";
    ctx.beginPath();
    ctx.arc(ex - side * 1.5, eyeY + 3, 4.4, 0, Math.PI * 2);
    ctx.fill();

    /* Живой блик в глазах */
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fillRect(ex - side * 4 - 1, eyeY - 1, 3.5, 3.5);

    /* Чёткая тёмная линия верхнего века и ресниц */
    ctx.fillStyle = "#1c1008";
    ctx.beginPath();
    ctx.moveTo(ex - 18, eyeY + 3);
    ctx.quadraticCurveTo(ex, eyeY - (fem ? 9.5 : 7.0), ex + 18, eyeY + 3);
    ctx.quadraticCurveTo(ex, eyeY - (fem ? 4.2 : 2.8), ex - 18, eyeY + 5);
    ctx.closePath();
    ctx.fill();

    /* Выразительные брови (у мужчины — широкие хмурые как на image-51, у женщины — чёткие изящные дуги) */
    ctx.fillStyle = hairDark;
    ctx.beginPath();
    if (fem) {
      ctx.moveTo(ex - side * 18, eyeY - 13);
      ctx.quadraticCurveTo(ex - side * 2, eyeY - 22, ex + side * 20, eyeY - 14);
      ctx.lineTo(ex + side * 19, eyeY - 9.5);
      ctx.quadraticCurveTo(ex - side * 2, eyeY - 16, ex - side * 17, eyeY - 8.5);
    } else {
      ctx.moveTo(ex - side * 19, eyeY - 8);
      ctx.quadraticCurveTo(ex, eyeY - 18, ex + side * 22, eyeY - 13);
      ctx.lineTo(ex + side * 21, eyeY - 6);
      ctx.quadraticCurveTo(ex, eyeY - 10, ex - side * 18, eyeY - 2.5);
    }
    ctx.closePath();
    ctx.fill();
  });

  /* Спинка, крылья и тень носа */
  ctx.fillStyle = "rgba(255, 240, 222, 0.46)";
  ctx.fillRect(W * 0.5 - 5, eyeY + 2, 10, 52);
  softRadial(ctx, W * 0.5, H * 0.595, 18, "rgba(122, 68, 38, 0.48)", "rgba(122, 68, 38, 0)");
  ctx.fillStyle = "rgba(68, 36, 20, 0.72)";
  ctx.beginPath();
  ctx.ellipse(W * 0.5 - 8.5, H * 0.59, 4.2, 2.5, 0.3, 0, Math.PI * 2);
  ctx.ellipse(W * 0.5 + 8.5, H * 0.59, 4.2, 2.5, -0.3, 0, Math.PI * 2);
  ctx.fill();

  /* Рот, густые усы прямо под носом и окладистая борода (1-в-1 рыжебородый мужчина с image-51!) */
  const mouthY = H * 0.68;
  if (!fem && opts.beard !== false) {
    /* Бакенбарды от висков, пышные усы сразу под носом и густая борода по всей челюсти */
    ctx.fillStyle = hairBase;
    ctx.beginPath();
    ctx.moveTo(W * 0.30, H * 0.44);
    ctx.quadraticCurveTo(W * 0.37, H * 0.62, W * 0.42, H * 0.615);
    ctx.quadraticCurveTo(W * 0.50, H * 0.585, W * 0.58, H * 0.615);
    ctx.quadraticCurveTo(W * 0.63, H * 0.62, W * 0.70, H * 0.44);
    ctx.lineTo(W * 0.72, H * 0.84);
    ctx.quadraticCurveTo(W * 0.50, H * 0.96, W * 0.28, H * 0.84);
    ctx.closePath();
    ctx.fill();

    /* Плотные тёмные усы над линией рта */
    ctx.fillStyle = hairDark;
    ctx.beginPath();
    ctx.moveTo(W * 0.41, mouthY - 2);
    ctx.quadraticCurveTo(W * 0.50, mouthY - 16, W * 0.59, mouthY - 2);
    ctx.quadraticCurveTo(W * 0.50, mouthY - 5, W * 0.41, mouthY - 2);
    ctx.fill();

    /* Небольшой просвет нижней губы под усами */
    ctx.fillStyle = "#b87a60";
    ctx.beginPath();
    ctx.ellipse(W * 0.5, mouthY + 3, 12, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    /* Выразительные женские губы */
    ctx.fillStyle = fem ? "#c67364" : "#b87a62";
    ctx.beginPath();
    ctx.moveTo(W * 0.5 - 21, mouthY);
    ctx.quadraticCurveTo(W * 0.5 - 6, mouthY - 8, W * 0.5, mouthY - 4.5);
    ctx.quadraticCurveTo(W * 0.5 + 6, mouthY - 8, W * 0.5 + 21, mouthY);
    ctx.quadraticCurveTo(W * 0.5, mouthY + 11, W * 0.5 - 21, mouthY);
    ctx.fill();

    ctx.fillStyle = "rgba(68, 28, 22, 0.72)";
    ctx.fillRect(W * 0.5 - 18, mouthY - 0.8, 36, 2.2);
  }

  /* Линия роста волос на макушке и затылке (оставляем лоб u=0.35..0.65 открытым ниже H*0.24!) */
  ctx.fillStyle = hairBase;
  ctx.fillRect(0, 0, W, H * 0.22);
  ctx.fillRect(0, 0, W * 0.30, H * 0.72);
  ctx.fillRect(W * 0.70, 0, W * 0.30, H * 0.72);

  if (fem) {
    /* Изящная косая чёлка набок вверху лба (строго выше бровей, как у героини слева на image-51!) */
    ctx.beginPath();
    ctx.moveTo(W * 0.28, H * 0.22);
    ctx.quadraticCurveTo(W * 0.44, H * 0.35, W * 0.59, H * 0.24);
    ctx.quadraticCurveTo(W * 0.66, H * 0.30, W * 0.72, H * 0.22);
    ctx.lineTo(W * 0.72, 0);
    ctx.lineTo(W * 0.28, 0);
    ctx.closePath();
    ctx.fill();
  }

  for (let i = 0; i < 48; i++) {
    const hx = (i / 48) * W;
    ctx.strokeStyle = i % 2 === 0 ? hairLight : hairDark;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx + Math.sin(i) * 4, H * 0.21);
    ctx.stroke();
  }

  return cv;
}

/* ---------- 2. UV-КАРТА ПРИЧЁСКИ ПРЯДЯМИ (256×256) ---------- */
export function buildHairTextureCanvas(hairColor = "#4b2614", canvasFactory = null) {
  const W = 256;
  const H = 256;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");

  ctx.fillStyle = hairColor;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 56; i++) {
    const x = (i / 56) * W;
    ctx.fillStyle = i % 3 === 0 ? "rgba(255, 205, 160, 0.14)" : "rgba(18, 8, 3, 0.24)";
    ctx.fillRect(x, 0, 2.5, H);
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(20, 10, 4, 0.30)");
  g.addColorStop(0.30, "rgba(255, 220, 180, 0.18)");
  g.addColorStop(0.70, "rgba(20, 10, 4, 0.10)");
  g.addColorStop(1, "rgba(12, 6, 2, 0.42)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return cv;
}

/* ---------- 3. АТЛАС ТЕЛА И ОДЕЖДЫ В СТИЛЕ PROJECT ZOMBOID (512×512) ---------- */
export function buildBodyTextureCanvas(opts = {}, canvasFactory = null) {
  const W = 512;
  const H = 512;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");

  const fem = !!opts.female;
  const outfit = opts.outfit || "tunic";

  const skinBase = fem ? "#efc8a2" : "#e5b88c";
  const skinMid  = fem ? "#dfa97e" : "#d19c6e";
  const skinDark = fem ? "#c2885e" : "#b0784c";

  ctx.fillStyle = skinBase;
  ctx.fillRect(0, 0, W, H);

  /* ================= ПОЛОСА 0: ТОРС И ТАЗ (y = 0..192) ================= */
  softVBand(ctx, 0, 0, W, 192, skinBase, skinMid, skinBase);

  softRadial(ctx, W * 0.5, 20, 30, "rgba(120, 70, 40, 0.26)", "rgba(120, 70, 40, 0)");
  if (fem) {
    softRadial(ctx, W * 0.43, 66, 26, "rgba(255, 240, 224, 0.34)", "rgba(255, 240, 224, 0)");
    softRadial(ctx, W * 0.57, 66, 26, "rgba(255, 240, 224, 0.34)", "rgba(255, 240, 224, 0)");
    softRadial(ctx, W * 0.43, 82, 24, "rgba(125, 72, 44, 0.28)", "rgba(125, 72, 44, 0)");
    softRadial(ctx, W * 0.57, 82, 24, "rgba(125, 72, 44, 0.28)", "rgba(125, 72, 44, 0)");
  } else {
    softRadial(ctx, W * 0.43, 58, 30, "rgba(255, 238, 218, 0.25)", "rgba(255, 238, 218, 0)");
    softRadial(ctx, W * 0.57, 58, 30, "rgba(255, 238, 218, 0.25)", "rgba(255, 238, 218, 0)");
    softRadial(ctx, W * 0.50, 96, 36, "rgba(130, 76, 44, 0.20)", "rgba(130, 76, 44, 0)");
  }

  /* Мягкие живописные полутени складок ткани (без полосок!) */
  function paintSoftFabricFolds(yStart, yEnd, foldCol) {
    softRadial(ctx, W * 0.36, (yStart + yEnd) * 0.5, 42, foldCol, "rgba(0,0,0,0)");
    softRadial(ctx, W * 0.64, (yStart + yEnd) * 0.5, 42, foldCol, "rgba(0,0,0,0)");
    softRadial(ctx, W * 0.50, yEnd - 8, 48, foldCol, "rgba(0,0,0,0)");
  }

  if (outfit === "underwear") {
    if (fem) {
      softVBand(ctx, 0, 52, W, 38, "#d5dce6", "#b6bfcc", "#96a0ae");
      paintSoftFabricFolds(60, 82, "rgba(80, 90, 108, 0.16)");
      ctx.fillStyle = "#c2cbd8";
      ctx.fillRect(W * 0.40, 14, 9, 42);
      ctx.fillRect(W * 0.58, 14, 9, 42);
      softVBand(ctx, 0, 148, W, 44, "#545961", "#44484f", "#34373d");
    } else {
      softVBand(ctx, 0, 26, W, 110, "#b6c3d8", "#9eadc6", "#8393ac");
      ctx.fillStyle = skinBase;
      ctx.beginPath();
      ctx.ellipse(W * 0.5, 16, 42, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      paintSoftFabricFolds(58, 122, "rgba(68, 82, 104, 0.16)");
      softVBand(ctx, 0, 136, W, 56, "#4a4e55", "#3c4046", "#2e3136");
    }
  } else if (outfit === "tunic") {
    const topL = fem ? "#e2dcd5" : "#6c7b6a";
    const topM = fem ? "#cbc4bc" : "#586657";
    const topD = fem ? "#aca59d" : "#434f42";
    softVBand(ctx, 0, 14, W, 124, topL, topM, topD);

    /* Открытая шея и V-вырез ворота */
    ctx.fillStyle = skinBase;
    ctx.fillRect(0, 0, W, 14);
    ctx.beginPath();
    ctx.moveTo(W * 0.43, 12);
    ctx.lineTo(W * 0.57, 12);
    ctx.lineTo(W * 0.50, 44);
    ctx.closePath();
    ctx.fill();

    /* Мягкие естественные складки ткани на груди и талии */
    paintSoftFabricFolds(58, 120, fem ? "rgba(90, 84, 78, 0.16)" : "rgba(28, 36, 28, 0.18)");
    if (fem) {
      softRadial(ctx, W * 0.43, 76, 24, "rgba(90, 84, 78, 0.18)", "rgba(90, 84, 78, 0)");
      softRadial(ctx, W * 0.57, 76, 24, "rgba(90, 84, 78, 0.18)", "rgba(90, 84, 78, 0)");
    }

    /* Тёмно-серые брюки на бёдрах — точно одного тона с полосой ног (бесшовный переход!) */
    softVBand(ctx, 0, 138, W, 54, "#5c6067", "#50545a", "#45484e");

    /* Кожаный ремень и серебристая пряжка */
    ctx.fillStyle = "#23201e";
    ctx.fillRect(0, 132, W, 13);
    ctx.fillStyle = "#e8edf2";
    ctx.fillRect(W * 0.5 - 13, 130, 26, 17);
    ctx.fillStyle = "#8a94a0";
    ctx.fillRect(W * 0.5 - 8, 133, 16, 11);
  } else {
    /* Северный кожано-ламельный дублет поверх зелёной рубахи */
    const brL = fem ? "#704a34" : "#7c5335";
    const brM = fem ? "#583926" : "#624027";
    const brD = "#3d2616";
    softVBand(ctx, 0, 14, W, 132, brL, brM, brD);
    ctx.fillStyle = skinBase;
    ctx.fillRect(0, 0, W, 12);

    /* Алый шейный платок у основания шеи (не заходит на саму шею!) */
    ctx.fillStyle = "#822622";
    ctx.fillRect(W * 0.34, 12, W * 0.32, 12);

    for (let y = 38; y <= 118; y += 22) {
      ctx.fillStyle = "rgba(22, 12, 5, 0.45)";
      ctx.fillRect(0, y, W, 3);
      ctx.fillStyle = "#c0cad4";
      for (let rx = W * 0.35; rx <= W * 0.65; rx += 26) {
        ctx.fillRect(rx - 2, y - 12, 4.5, 4.5);
      }
    }
    ctx.strokeStyle = "#331e0f";
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(W * 0.37, 16);
    ctx.lineTo(W * 0.60, 134);
    ctx.stroke();

    softVBand(ctx, 0, 146, W, 46, "#3e4c3d", "#313d30", "#263025");
    ctx.fillStyle = "#24160b";
    ctx.fillRect(0, 132, W, 15);
    ctx.fillStyle = "#d4b257";
    ctx.fillRect(W * 0.5 - 13, 129, 26, 20);
    ctx.fillStyle = "#24160b";
    ctx.fillRect(W * 0.5 - 7, 134, 14, 10);
  }

  /* ================= ПОЛОСА 1: РУКИ И КИСТИ (y = 192..304) ================= */
  softVBand(ctx, 0, 192, W, 112, skinBase, skinMid, skinBase);
  softRadial(ctx, W * 0.35, 220, 26, "rgba(165, 102, 58, 0.28)", "rgba(165, 102, 58, 0)");
  softRadial(ctx, W * 0.65, 220, 26, "rgba(165, 102, 58, 0.28)", "rgba(165, 102, 58, 0)");

  if (outfit === "tunic") {
    if (fem) {
      softVBand(ctx, 0, 192, W, 28, "#e2dcd5", "#cac3bb", "#b0a9a1");
    } else {
      softVBand(ctx, 0, 192, W, 48, "#6c7b6a", "#576556", "#424e41");
    }
  } else if (outfit === "armor") {
    softVBand(ctx, 0, 192, W, 54, "#4b5949", "#3c483a", "#2d372c");
    softVBand(ctx, 0, 246, W, 38, "#6e482b", "#54361f", "#3a2414");
    ctx.fillStyle = "#24150a";
    ctx.fillRect(0, 256, W, 4);
    ctx.fillRect(0, 272, W, 4);
  }
  ctx.fillStyle = skinDark;
  ctx.fillRect(0, 295, W, 9);

  /* ================= ПОЛОСА 2: НОГИ (y = 304..432) ================= */
  if (outfit === "underwear") {
    softVBand(ctx, 0, 304, W, 128, skinBase, skinMid, skinBase);
    softRadial(ctx, W * 0.5, 366, 22, "rgba(165, 102, 58, 0.32)", "rgba(165, 102, 58, 0)");
    softRadial(ctx, W * 0.5, 356, 14, "rgba(255, 240, 220, 0.32)", "rgba(255, 240, 220, 0)");
    if (!fem) {
      softVBand(ctx, 0, 304, W, 24, "#3c4046", "#34383e", "#2e3136");
    }
  } else {
    const pL = outfit === "armor" ? "#464d56" : "#565a61";
    const pM = outfit === "armor" ? "#373d45" : "#4b4f55";
    const pD = outfit === "armor" ? "#292e35" : "#3d4046";
    softVBand(ctx, 0, 304, W, 128, pL, pM, pD);

    ctx.strokeStyle = "rgba(22, 24, 28, 0.22)";
    ctx.lineWidth = 6;
    [332, 366, 404].forEach((py) => {
      ctx.beginPath();
      ctx.moveTo(W * 0.30, py);
      ctx.quadraticCurveTo(W * 0.5, py + 7, W * 0.70, py - 1);
      ctx.stroke();
    });

    if (outfit === "armor") {
      softVBand(ctx, 0, 376, W, 56, "#5c3d24", "#472e1a", "#332011");
      ctx.fillStyle = "#24150a";
      ctx.fillRect(0, 378, W, 6);
    }
  }

  /* ================= ПОЛОСА 3: ОБУВЬ (y = 432..512) ================= */
  const bootTop = outfit === "armor" ? "#4b301b" : "#222428";
  const bootBot = outfit === "armor" ? "#2a1a0e" : "#121316";
  softVBand(ctx, 0, 432, W, 80, bootTop, bootBot, "#0d0e10");

  return cv;
}

/* ---------- 4. АТЛАС КАМНЯ, ДУБА, КОВАНОЙ СТАЛИ И СНЕГА ДЛЯ 3D-ОБЪЕКТА ---------- */
export function buildPropAtlasCanvas(canvasFactory = null) {
  const W = 512;
  const H = 512;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");

  /* Квадрант 1 (0..256, 0..256): Крупная контрастная тёсаная каменная кладка */
  ctx.fillStyle = "#2c3239";
  ctx.fillRect(0, 0, 256, 256);
  const rows = 5;
  const rowH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const cols = 3;
    const colW = 256 / cols;
    const off = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = Math.max(0, c * colW + off + 3);
      const xEnd = Math.min(256, (c + 1) * colW + off - 3);
      if (xEnd <= x) { continue; }
      const shade = ((r * 7 + c * 13) % 5) * 9 - 16;
      const base = 104 + shade;
      ctx.fillStyle = `rgb(${base}, ${base + 8}, ${base + 16})`;
      ctx.fillRect(x, y + 3, xEnd - x, rowH - 6);
      ctx.fillStyle = "rgba(225, 238, 250, 0.28)";
      ctx.fillRect(x + 2, y + 3, Math.max(0, xEnd - x - 4), 5);
      ctx.fillStyle = "rgba(20, 26, 32, 0.35)";
      ctx.fillRect(x + 2, y + rowH - 8, Math.max(0, xEnd - x - 4), 5);
    }
  }

  /* Квадрант 2 (256..512, 0..256): Тёмный мореный дуб с досками */
  softVBand(ctx, 256, 0, 256, 256, "#724e2e", "#5b3c21", "#442c17");
  for (let p = 0; p < 8; p++) {
    const px = 256 + p * 32;
    ctx.fillStyle = p % 2 === 0 ? "rgba(255, 205, 150, 0.08)" : "rgba(20, 10, 4, 0.16)";
    ctx.fillRect(px, 0, 30, 256);
    ctx.fillStyle = "#221307";
    ctx.fillRect(px, 0, 3, 256);
    ctx.strokeStyle = "rgba(32, 18, 8, 0.35)";
    ctx.lineWidth = 1.6;
    for (let g = 0; g < 3; g++) {
      ctx.beginPath();
      ctx.moveTo(px + 7 + g * 8, 0);
      ctx.quadraticCurveTo(px + 12 + g * 6, 128, px + 6 + g * 8, 256);
      ctx.stroke();
    }
  }

  /* Квадрант 3 (0..256, 256..512): Кованое железо и сталь */
  softVBand(ctx, 0, 256, 256, 256, "#a4b0be", "#6d7884", "#3e464f");
  ctx.fillStyle = "#dce6f0";
  for (let rx = 24; rx < 240; rx += 48) {
    ctx.beginPath();
    ctx.arc(rx, 320, 5, 0, Math.PI * 2);
    ctx.arc(rx, 440, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Квадрант 4 (256..512, 256..512): Северный снег */
  softVBand(ctx, 256, 256, 256, 256, "#f2f7fc", "#d8e6f3", "#adc2d7");

  return cv;
}

export function canvasToThreeTexture(cv) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
