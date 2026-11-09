/* ============================================================================
   ПРОЦЕДУРНЫЙ ГЕНЕРАТОР UV-ТЕКСТУР В СТИЛЕ PROJECT ZOMBOID (BUILD 41+ 3D)
   Лаконичные матовые текстуры: спокойные серьёзные лица без кукольных глаз,
   цельные шапки волос/головных уборов без «штор», средневековая одежда и дерево.
   ============================================================================ */

import * as THREE from "three";

export function create2DCanvas(w, h, customFactory) {
  if (typeof customFactory === "function") {
    return customFactory(w, h);
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function softRadial(ctx, cx, cy, r, innerColor, outerColor) {
  const g = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r);
  g.addColorStop(0, innerColor);
  g.addColorStop(1, outerColor);
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

function softVBand(ctx, x, y, w, h, topCol, midCol, botCol) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, topCol);
  g.addColorStop(0.5, midCol);
  g.addColorStop(1, botCol);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/* Нормализация имени комплекта одежды (чтобы UI и движок понимали одни и те же ключи) */
export function normalizeOutfitKey(outfit) {
  if (outfit === "underwear") return "underwear";
  if (outfit === "warrior" || outfit === "armor") return "warrior";
  return "villager";
}

/* ---------- 1. ЦИЛИНДРИЧЕСКАЯ UV-КАРТА ГОЛОВЫ И ЛИЦА (512×512) ----------
   u = 0.5 — центр лица (нос/рот); u = 0.25 и 0.75 — виски и уши; u = 0/1 — затылок.
   v в Three.js: cy = (1 - v) * H:
   - макушка v = 0.80..1.00 -> cy = 0..102
   - лоб     v = 0.62..0.78 -> cy = 112..194
   - брови   v = 0.56       -> cy = 225
   - глаза   v = 0.52       -> cy = 246
   - кончик носа v = 0.42   -> cy = 297
   - рот     v = 0.31       -> cy = 353
   - подбородок v = 0.14..0.24 -> cy = 390..440 */
export function buildHeadTextureCanvas(opts = {}, canvasFactory = null) {
  const W = 512;
  const H = 512;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");

  const fem = !!opts.female;
  const skinBase = fem ? "#e8c39e" : "#dfb389";
  const skinMid  = fem ? "#d8ae86" : "#cc9b6f";
  const skinDark = fem ? "#ba8a63" : "#ad7b52";
  const hairBase = opts.hairColor || (fem ? "#4f2d1b" : "#5a361e");
  const hairDark = fem ? "#2c170d" : "#331d0e";

  /* 1. Ровный тёплый тон кожи с мягким затенением к затылку и под челюстью */
  softVBand(ctx, 0, 0, W, H, skinBase, skinBase, skinMid);
  softRadial(ctx, 0, H * 0.5, 130, "rgba(85, 50, 28, 0.22)", "rgba(85, 50, 28, 0)");
  softRadial(ctx, W, H * 0.5, 130, "rgba(85, 50, 28, 0.22)", "rgba(85, 50, 28, 0)");
  softVBand(ctx, 0, H * 0.80, W, H * 0.20, "rgba(110, 68, 40, 0)", "rgba(95, 56, 32, 0.28)", "rgba(80, 46, 26, 0.42)");

  /* Едва заметный живой тон на скулах и щеках */
  softRadial(ctx, W * 0.41, H * 0.56, 36, fem ? "rgba(196, 108, 86, 0.18)" : "rgba(175, 96, 72, 0.12)", "rgba(196, 108, 86, 0)");
  softRadial(ctx, W * 0.59, H * 0.56, 36, fem ? "rgba(196, 108, 86, 0.18)" : "rgba(175, 96, 72, 0)", "rgba(196, 108, 86, 0)");

  /* Ушные раковины по бокам (u = 0.25 и u = 0.75, cy ~ 256) */
  [W * 0.25, W * 0.75].forEach((ex) => {
    softRadial(ctx, ex, H * 0.50, 22, "rgba(130, 76, 46, 0.36)", "rgba(130, 76, 46, 0)");
    ctx.fillStyle = skinDark;
    ctx.beginPath();
    ctx.ellipse(ex, H * 0.50, 6, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  /* 2. ГЛАЗА И БРОВИ В ПРОПОРЦИЯХ PROJECT ZOMBOID (image-51)
     Правильная анатомическая посадка глаз (не сбиты в кучу у переносицы!),
     выразительные густые брови и чёткий тёмный взгляд без кукольных белых блюдец. */
  const eyeY = H * 0.495; // классическая середина высоты головы!
  const eyeDX = fem ? 36 : 38;

  [-1, 1].forEach((side) => {
    const ex = W * 0.5 + side * eyeDX;

    /* Мягкая анатомическая тень глазницы под бровью */
    softRadial(ctx, ex, eyeY - 2, 26, "rgba(112, 66, 38, 0.38)", "rgba(112, 66, 38, 0)");

    /* Узкий спокойный разрез глаза с деликатным светлым уголком склеры */
    ctx.fillStyle = "#e5ddd0";
    ctx.beginPath();
    ctx.ellipse(ex, eyeY + 2.5, fem ? 13.5 : 13.0, fem ? 5.2 : 4.4, 0, 0, Math.PI * 2);
    ctx.fill();

    /* Выразительная тёмная радужка во всю высоту разреза */
    ctx.fillStyle = fem ? "#2c1b10" : "#21160e";
    ctx.beginPath();
    ctx.ellipse(ex - side * 0.8, eyeY + 2.2, fem ? 7.4 : 7.0, fem ? 5.2 : 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0e0906";
    ctx.beginPath();
    ctx.arc(ex - side * 0.8, eyeY + 2.2, 3.4, 0, Math.PI * 2);
    ctx.fill();

    /* Плотная чёткая линия верхнего века */
    ctx.fillStyle = "#1c1008";
    ctx.beginPath();
    ctx.moveTo(ex - 15, eyeY + 3.0);
    ctx.quadraticCurveTo(ex, eyeY - (fem ? 4.8 : 3.6), ex + 15, eyeY + 3.0);
    ctx.lineTo(ex + 14, eyeY - (fem ? 0.6 : 0.2));
    ctx.quadraticCurveTo(ex, eyeY - (fem ? 7.6 : 6.2), ex - 14, eyeY - (fem ? 0.6 : 0.2));
    ctx.closePath();
    ctx.fill();

    /* Густые выразительные брови (как на референсе Zomboid image-51!) */
    ctx.fillStyle = hairDark;
    ctx.beginPath();
    if (fem) {
      ctx.moveTo(ex - side * 17, eyeY - 9.5);
      ctx.quadraticCurveTo(ex - side * 2, eyeY - 16.0, ex + side * 18, eyeY - 10.5);
      ctx.lineTo(ex + side * 17, eyeY - 6.2);
      ctx.quadraticCurveTo(ex - side * 2, eyeY - 11.2, ex - side * 16, eyeY - 5.8);
    } else {
      ctx.moveTo(ex - side * 18, eyeY - 6.5);
      ctx.quadraticCurveTo(ex, eyeY - 13.5, ex + side * 20, eyeY - 9.5);
      ctx.lineTo(ex + side * 19, eyeY - 3.2);
      ctx.quadraticCurveTo(ex, eyeY - 7.0, ex - side * 17, eyeY - 1.5);
    }
    ctx.closePath();
    ctx.fill();
  });

  /* 3. НОС: мягкие боковые грани переносицы и тень под основанием носа */
  softRadial(ctx, W * 0.5 - 12, H * 0.54, 15, "rgba(124, 74, 42, 0.22)", "rgba(124, 74, 42, 0)");
  softRadial(ctx, W * 0.5 + 12, H * 0.54, 15, "rgba(124, 74, 42, 0.22)", "rgba(124, 74, 42, 0)");
  softRadial(ctx, W * 0.5, H * 0.605, 16, "rgba(110, 62, 34, 0.42)", "rgba(110, 62, 34, 0)");
  ctx.fillStyle = "rgba(70, 38, 20, 0.60)";
  ctx.beginPath();
  ctx.ellipse(W * 0.5 - 6.5, H * 0.598, 3.2, 1.8, 0.25, 0, Math.PI * 2);
  ctx.ellipse(W * 0.5 + 6.5, H * 0.598, 3.2, 1.8, -0.25, 0, Math.PI * 2);
  ctx.fill();

  /* 4. ЕСТЕСТВЕННЫЙ РОТ НОРМАЛЬНОЙ ШИРИНЫ И ОПРЯТНАЯ БОРОДА С УСАМИ ПОД НОСОМ */
  const mouthY = H * 0.678;
  if (!fem && opts.beard !== false) {
    /* Окладистая борода вдоль челюсти и бакенбард + плотные усы сразу под носом! */
    ctx.fillStyle = hairBase;
    ctx.beginPath();
    ctx.moveTo(W * 0.27, H * 0.48);
    ctx.quadraticCurveTo(W * 0.34, H * 0.64, W * 0.40, H * 0.635);
    ctx.quadraticCurveTo(W * 0.50, H * 0.605, W * 0.60, H * 0.635);
    ctx.quadraticCurveTo(W * 0.66, H * 0.64, W * 0.73, H * 0.48);
    ctx.lineTo(W * 0.75, H * 0.90);
    ctx.quadraticCurveTo(W * 0.50, H * 0.98, W * 0.25, H * 0.90);
    ctx.closePath();
    ctx.fill();

    /* Чёткие тёмные усы над линией рта */
    ctx.fillStyle = hairDark;
    ctx.beginPath();
    ctx.moveTo(W * 0.395, mouthY + 2);
    ctx.quadraticCurveTo(W * 0.45, mouthY - 15, W * 0.50, mouthY - 11);
    ctx.quadraticCurveTo(W * 0.55, mouthY - 15, W * 0.605, mouthY + 2);
    ctx.quadraticCurveTo(W * 0.50, mouthY - 3, W * 0.395, mouthY + 2);
    ctx.closePath();
    ctx.fill();

    /* Тень рта и небольшая нижняя губа в бороде */
    ctx.fillStyle = "#a8735b";
    ctx.beginPath();
    ctx.ellipse(W * 0.5, mouthY + 4, 11, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1e0f07";
    ctx.fillRect(W * 0.5 - 15, mouthY - 0.5, 30, 2.5);
  } else {
    /* Спокойный человеческий рот нормальной ширины (не крошечная точка!) */
    ctx.fillStyle = fem ? "#b97868" : "#ad7660";
    ctx.beginPath();
    ctx.moveTo(W * 0.5 - 18, mouthY + 1);
    ctx.quadraticCurveTo(W * 0.5, mouthY - 5.5, W * 0.5 + 18, mouthY + 1);
    ctx.quadraticCurveTo(W * 0.5, mouthY + 8.0, W * 0.5 - 18, mouthY + 1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(64, 30, 22, 0.72)";
    ctx.fillRect(W * 0.5 - 17, mouthY + 0.2, 34, 2.0);
  }

  /* Подложка волос на макушке, висках и затылке (естественное обрамление лба и висков!) */
  ctx.fillStyle = hairBase;
  ctx.fillRect(0, 0, W, H * 0.23);
  ctx.fillRect(0, 0, W * 0.28, H * 0.56);
  ctx.fillRect(W * 0.72, 0, W * 0.28, H * 0.56);

  return cv;
}

/* ---------- 2. UV-КАРТА ЦЕЛЬНОЙ ШАПКИ ВОЛОС / СРЕДНЕВЕКОВОГО ГОЛОВНОГО УБОРА (256×256) ----------
   Никакого «частокола штор»! Мягкий живописный объём от темени к краям + режим плата/шапки. */
export function buildHairTextureCanvas(hairColor = "#4f2d1b", styleKey = "classic", female = false, canvasFactory = null) {
  const W = 256;
  const H = 256;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");

  if (styleKey === "headwear") {
    if (female) {
      /* Средневековый женский льняной плат / убрус с тёплой вышивкой по кромке */
      softVBand(ctx, 0, 0, W, H, "#e4ddd2", "#cfc6b8", "#b2a899");
      /* Мягкие естественные складки ткани */
      softRadial(ctx, W * 0.32, H * 0.55, 58, "rgba(95, 84, 70, 0.18)", "rgba(95, 84, 70, 0)");
      softRadial(ctx, W * 0.68, H * 0.55, 58, "rgba(95, 84, 70, 0.18)", "rgba(95, 84, 70, 0)");
      /* Тонкая северная тесьма по краю плата (внизу UV v=0..0.12 -> cy=224..256) */
      ctx.fillStyle = "#7c3229";
      ctx.fillRect(0, H - 22, W, 8);
      ctx.fillStyle = "#c9a86a";
      for (let x = 8; x < W; x += 16) {
        ctx.fillRect(x, H - 20, 6, 4);
      }
    } else {
      /* Средневековая северная суконная шапка с меховым околышем */
      softVBand(ctx, 0, 0, W, H * 0.72, "#5c4634", "#4a3728", "#3b2b1f");
      /* Тёмно-бурый меховой околыш по низу шапки */
      softVBand(ctx, 0, H * 0.70, W, H * 0.30, "#332419", "#271b12", "#1d140d");
      for (let x = 4; x < W; x += 12) {
        ctx.fillStyle = "rgba(180, 145, 110, 0.12)";
        ctx.fillRect(x, H * 0.72, 5, H * 0.26);
      }
    }
    return cv;
  }

  /* Натуральная цельная шапка волос: мягкий градиент без полосатых «жалюзи»! */
  ctx.fillStyle = hairColor;
  ctx.fillRect(0, 0, W, H);

  /* Чуть темнее у макушки/пробора и у самых кончиков, мягкий тёплый блик по середине объёма */
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.00, "rgba(18, 9, 4, 0.32)");
  g.addColorStop(0.28, "rgba(255, 215, 175, 0.14)");
  g.addColorStop(0.65, "rgba(0, 0, 0, 0.04)");
  g.addColorStop(1.00, "rgba(16, 8, 3, 0.30)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  /* Лишь 6 широких мягких полутоновых прядей на весь оборот головы (вместо 56 резких полосок!) */
  for (let i = 0; i < 6; i++) {
    const cx = (i + 0.5) * (W / 6);
    softRadial(ctx, cx, H * 0.48, 34, i % 2 === 0 ? "rgba(255, 210, 165, 0.09)" : "rgba(20, 10, 4, 0.12)", "rgba(0,0,0,0)");
  }

  return cv;
}

/* ---------- 3. АТЛАС ТЕЛА И ОДЕЖДЫ В СТИЛЕ PROJECT ZOMBOID (512×512) ---------- */
export function buildBodyTextureCanvas(opts = {}, canvasFactory = null) {
  const W = 512;
  const H = 512;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");

  const fem = !!opts.female;
  const outfit = normalizeOutfitKey(opts.outfit);

  const skinBase = fem ? "#e8c39e" : "#dfb389";
  const skinMid  = fem ? "#d8ae86" : "#cc9b6f";
  const skinDark = fem ? "#ba8a63" : "#ad7b52";

  ctx.fillStyle = skinBase;
  ctx.fillRect(0, 0, W, H);

  /* ================= ПОЛОСА 0: ТОРС, ШЕЯ И ТАЗ (y = 0..192) =================
     y = 0..24 — ствол шеи (строго чистая кожа без красных пятен!).
     y = 24..142 — грудь/спина/рубаха.
     y = 142..192 — пояс и верх брюк/белья. */
  softVBand(ctx, 0, 0, W, 192, skinBase, skinMid, skinBase);

  function paintSoftFabricVolume(yStart, yEnd, shadeCol) {
    softRadial(ctx, W * 0.35, (yStart + yEnd) * 0.5, 44, shadeCol, "rgba(0,0,0,0)");
    softRadial(ctx, W * 0.65, (yStart + yEnd) * 0.5, 44, shadeCol, "rgba(0,0,0,0)");
    softRadial(ctx, W * 0.50, yEnd - 8, 52, shadeCol, "rgba(0,0,0,0)");
  }

  if (outfit === "underwear") {
    if (fem) {
      /* Анатомический рельеф ключиц и груди + аккуратное светло-серое исподнее (как на референсе Zomboid) */
      softRadial(ctx, W * 0.43, 66, 24, "rgba(255, 240, 224, 0.28)", "rgba(255, 240, 224, 0)");
      softRadial(ctx, W * 0.57, 66, 24, "rgba(255, 240, 224, 0.28)", "rgba(255, 240, 224, 0)");
      softVBand(ctx, 0, 56, W, 38, "#d4dbe4", "#bac3cf", "#9da7b5");
      ctx.fillStyle = "#c5ceda";
      ctx.fillRect(W * 0.40, 26, 8, 34);
      ctx.fillRect(W * 0.58, 26, 8, 34);
      softVBand(ctx, 0, 148, W, 44, "#50555d", "#42464d", "#34383e");
    } else {
      /* Классическая серо-голубая майка и тёмные боксеры из Project Zomboid (image-51) */
      softVBand(ctx, 0, 32, W, 108, "#b5c2d6", "#9eadc4", "#8595ad");
      ctx.fillStyle = skinBase;
      ctx.beginPath();
      ctx.ellipse(W * 0.5, 24, 44, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      paintSoftFabricVolume(60, 126, "rgba(64, 78, 98, 0.18)");
      softVBand(ctx, 0, 138, W, 54, "#484c53", "#3b3f45", "#2f3237");
    }
  } else if (outfit === "villager") {
    /* Добротная повседневная одежда Студёного Брода / Zomboid:
       у женщины — светлая льняная блуза с рукавом и тёмно-серые брюки;
       у мужчины — оливково-серая северная рубаха с рукавами и суконные порты. */
    const topL = fem ? "#dfd9d0" : "#687666";
    const topM = fem ? "#c8c1b7" : "#556254";
    const topD = fem ? "#aba49a" : "#424d41";
    softVBand(ctx, 0, 26, W, 114, topL, topM, topD);

    /* Чистая шея и аккуратный V-вырез ворота */
    ctx.fillStyle = skinBase;
    ctx.fillRect(0, 0, W, 26);
    ctx.beginPath();
    ctx.moveTo(W * 0.44, 25);
    ctx.lineTo(W * 0.56, 25);
    ctx.lineTo(W * 0.50, 50);
    ctx.closePath();
    ctx.fill();

    paintSoftFabricVolume(62, 126, fem ? "rgba(88, 82, 74, 0.18)" : "rgba(26, 34, 26, 0.22)");

    /* Верх брюк на тазу — тон в тон со штанинами! */
    softVBand(ctx, 0, 140, W, 52, "#545860", "#494d54", "#3e4248");

    /* Кожаный ремень с пряжкой */
    ctx.fillStyle = "#25211e";
    ctx.fillRect(0, 134, W, 12);
    ctx.fillStyle = "#dce2e8";
    ctx.fillRect(W * 0.5 - 12, 132, 24, 16);
    ctx.fillStyle = "#6e7680";
    ctx.fillRect(W * 0.5 - 7, 135, 14, 10);
  } else {
    /* «Воин Севера»: стёгано-кожаная бригантина поверх плотной тёмно-зелёной рубахи */
    const brL = fem ? "#6e4b35" : "#765036";
    const brM = fem ? "#573a27" : "#5e3e28";
    const brD = "#3d2718";
    softVBand(ctx, 0, 28, W, 114, brL, brM, brD);

    /* Шея полностью телесная (никаких красных пятен на шее!) */
    ctx.fillStyle = skinBase;
    ctx.fillRect(0, 0, W, 27);

    /* Узкий тёмно-суконный воротник поддоспешника только по краю ключиц */
    ctx.fillStyle = "#3a4639";
    ctx.fillRect(0, 26, W, 6);

    for (let y = 48; y <= 118; y += 23) {
      ctx.fillStyle = "rgba(22, 12, 5, 0.42)";
      ctx.fillRect(0, y, W, 3);
      ctx.fillStyle = "#bcc6d0";
      for (let rx = W * 0.36; rx <= W * 0.64; rx += 28) {
        ctx.fillRect(rx - 2, y - 12, 4, 4);
      }
    }

    /* Подол зелёного гамбезона и ремень */
    softVBand(ctx, 0, 142, W, 50, "#3b473a", "#2f3a2e", "#252e24");
    ctx.fillStyle = "#23160c";
    ctx.fillRect(0, 134, W, 13);
    ctx.fillStyle = "#cfa954";
    ctx.fillRect(W * 0.5 - 12, 132, 24, 17);
    ctx.fillStyle = "#23160c";
    ctx.fillRect(W * 0.5 - 7, 135, 14, 11);
  }

  /* ================= ПОЛОСА 1: РУКИ И КИСТИ (y = 192..304) =================
     ВАЖНО: в одежде верх плеча (y = 192..238) ВСЕГДА закрыт рукавом того же цвета,
     что и рубаха/поддоспешник — никаких голых пятен на плечах! */
  softVBand(ctx, 0, 192, W, 112, skinBase, skinMid, skinBase);

  if (outfit === "villager") {
    if (fem) {
      /* Аккуратный рукав льняной блузы чуть выше локтя */
      softVBand(ctx, 0, 192, W, 38, "#dfd9d0", "#c8c1b7", "#aba49a");
      ctx.fillStyle = "#9c958c";
      ctx.fillRect(0, 228, W, 3);
    } else {
      /* Закатанный по предплечье рукав мужской северной рубахи */
      softVBand(ctx, 0, 192, W, 58, "#687666", "#556254", "#424d41");
      ctx.fillStyle = "#364035";
      ctx.fillRect(0, 247, W, 4);
    }
  } else if (outfit === "warrior") {
    /* Полный плотный рукав зелёного поддоспешника + кожаные наручи на предплечье */
    softVBand(ctx, 0, 192, W, 56, "#495748", "#3b473a", "#2e382d");
    softVBand(ctx, 0, 246, W, 38, "#664329", "#50331e", "#3b2414");
    ctx.fillStyle = "#23140a";
    ctx.fillRect(0, 255, W, 4);
    ctx.fillRect(0, 272, W, 4);
  }

  /* Тень между пальцами на кончиках кисти */
  ctx.fillStyle = skinDark;
  ctx.fillRect(0, 296, W, 8);

  /* ================= ПОЛОСА 2: НОГИ (y = 304..432) ================= */
  if (outfit === "underwear") {
    softVBand(ctx, 0, 304, W, 128, skinBase, skinMid, skinBase);
    softRadial(ctx, W * 0.5, 366, 20, "rgba(155, 96, 56, 0.26)", "rgba(155, 96, 56, 0)");
    if (!fem) {
      softVBand(ctx, 0, 304, W, 28, "#3b3f45", "#34383e", "#2f3237");
    }
  } else {
    const pL = outfit === "warrior" ? "#454c55" : "#545860";
    const pM = outfit === "warrior" ? "#373d45" : "#484c53";
    const pD = outfit === "warrior" ? "#2a2f36" : "#3b3f45";
    softVBand(ctx, 0, 304, W, 128, pL, pM, pD);

    /* Мягкая полутень под коленом */
    softRadial(ctx, W * 0.5, 368, 36, "rgba(18, 20, 24, 0.24)", "rgba(18, 20, 24, 0)");

    if (outfit === "warrior") {
      softVBand(ctx, 0, 374, W, 58, "#593b24", "#462e1b", "#332012");
      ctx.fillStyle = "#23140a";
      ctx.fillRect(0, 376, W, 5);
    }
  }

  /* ================= ПОЛОСА 3: ОБУВЬ (y = 432..512) ================= */
  const bootTop = outfit === "warrior" ? "#4a301c" : "#25272b";
  const bootBot = outfit === "warrior" ? "#2b1b0f" : "#151619";
  softVBand(ctx, 0, 432, W, 80, bootTop, bootBot, "#0e0f12");

  return cv;
}

/* ---------- 4. АТЛАС КАМНЯ, ТЁСАНОГО ДЕРЕВА, СТАЛИ И СНЕГА ДЛЯ 3D-ОБЪЕКТА ---------- */
export function buildPropAtlasCanvas(canvasFactory = null) {
  const W = 512;
  const H = 512;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");

  /* Квадрант 1 (0..256, 0..256): Тёсаная каменная кладка */
  ctx.fillStyle = "#2b3138";
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
      if (xEnd <= x) continue;
      const shade = ((r * 7 + c * 13) % 5) * 9 - 16;
      const base = 104 + shade;
      ctx.fillStyle = `rgb(${base}, ${base + 8}, ${base + 16})`;
      ctx.fillRect(x, y + 3, xEnd - x, rowH - 6);
      ctx.fillStyle = "rgba(225, 238, 250, 0.26)";
      ctx.fillRect(x + 2, y + 3, Math.max(0, xEnd - x - 4), 4);
      ctx.fillStyle = "rgba(20, 26, 32, 0.34)";
      ctx.fillRect(x + 2, y + rowH - 7, Math.max(0, xEnd - x - 4), 4);
    }
  }

  /* Квадрант 2 (256..512, 0..256): Натуральное состаренное северное дерево (широкие плахи без «трубных полосок»!) */
  softVBand(ctx, 256, 0, 256, 256, "#7b5c3e", "#694d33", "#563e28");
  const plankCount = 4; // широкие добротные доски вместо узкого частокола!
  const plankW = 256 / plankCount;
  for (let p = 0; p < plankCount; p++) {
    const px = 256 + p * plankW;
    ctx.fillStyle = p % 2 === 0 ? "rgba(245, 210, 168, 0.07)" : "rgba(28, 16, 7, 0.11)";
    ctx.fillRect(px + 2, 0, plankW - 3, 256);

    /* Тонкий паз между досками */
    ctx.fillStyle = "rgba(32, 18, 8, 0.55)";
    ctx.fillRect(px, 0, 2, 256);

    /* Мягкий светлый скос кромки доски */
    ctx.fillStyle = "rgba(255, 225, 190, 0.10)";
    ctx.fillRect(px + 2, 0, 3, 256);

    /* Естественные редкие волокна и сучок дерева */
    const knotY = 48 + ((p * 67) % 160);
    softRadial(ctx, px + plankW * 0.52, knotY, 12, "rgba(42, 24, 10, 0.32)", "rgba(42, 24, 10, 0)");
    ctx.fillStyle = "rgba(36, 20, 8, 0.45)";
    ctx.beginPath();
    ctx.ellipse(px + plankW * 0.52, knotY, 3.5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  /* Лёгкое потемнение от сырости у торцов бруса */
  softVBand(ctx, 256, 0, 256, 36, "rgba(24, 14, 6, 0.28)", "rgba(24, 14, 6, 0.08)", "rgba(24, 14, 6, 0)");
  softVBand(ctx, 256, 220, 256, 36, "rgba(24, 14, 6, 0)", "rgba(24, 14, 6, 0.10)", "rgba(24, 14, 6, 0.32)");

  /* Квадрант 3 (0..256, 256..512): Кованое железо и сталь */
  softVBand(ctx, 0, 256, 256, 256, "#9eaab8", "#6b7682", "#3e464f");
  ctx.fillStyle = "#d8e2ec";
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
