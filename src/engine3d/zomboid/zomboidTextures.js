/* ============================================================================
   ПРОЦЕДУРНЫЙ ГЕНЕРАТОР UV-ТЕКСТУР В СТИЛЕ PROJECT ZOMBOID (BUILD 41+ 3D)
   - Суровые мрачные лица без кукольных белых белков и без светлого пятна на бороде
   - Чёткие резкие границы цветовых зон одежды (под парные UV-кольца без размытия)
   - Два народа Земли Эдема на контрасте:
     1) "north" — Королевство Хладных Ветров (бледные обветренные северяне-хладцы)
     2) "eden"  — Королевство Златодвор (центральное королевство Эдемских земель)
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

export function normalizeOutfitKey(outfit) {
  if (outfit === "underwear") return "underwear";
  if (outfit === "warrior" || outfit === "armor") return "warrior";
  return "villager";
}

export function normalizeKingdomKey(kingdom) {
  return kingdom === "eden" ? "eden" : "north";
}

export function getSkinPalette(kingdom = "north", female = false) {
  const isEden = normalizeKingdomKey(kingdom) === "eden";
  if (isEden) {
    /* Центральное королевство Златодвор: более тёплый оливково-пшеничный тон южных трактов */
    return female
      ? { base: "#dec09d", mid: "#cca882", dark: "#ad8660", windburn: "rgba(155, 88, 66, 0.12)" }
      : { base: "#d2af88", mid: "#be966d", dark: "#9e7650", windburn: "rgba(140, 78, 56, 0.12)" };
  }
  /* Королевство Хладных Ветров: бледная, обветренная холодом северная кожа с прохладным подтоном */
  return female
    ? { base: "#d9c3b0", mid: "#c4ab96", dark: "#a38873", windburn: "rgba(148, 86, 78, 0.18)" }
    : { base: "#cdb49e", mid: "#b69a82", dark: "#947862", windburn: "rgba(138, 76, 68, 0.22)" };
}

/* ---------- 1. МРАЧНАЯ СУРОВАЯ ТЕКСТУРА ГОЛОВЫ В ДУХЕ PROJECT ZOMBOID (512×512) ----------
   Главный принцип (как на оригинальных моделях Zomboid B41 / Kenshi):
   - НИКАКИХ белых глазных яблок и кукольных зрачков!
   - Глубокая надбровная тень в глазницах + узкий тёмный штрих прищура под низкими бровями.
   - Осунувшиеся скулы, обветренная переносица, сухие сжатые губы без красноты.
   - У северянина глухая тёмная борода без «высунутого языка»; у златодворца — аккуратная
     клиновидная бородка и тонкие усы с лёгкой тенью щетины на щеках. */
export function buildHeadTextureCanvas(opts = {}, canvasFactory = null) {
  const W = 512;
  const H = 512;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");

  const fem = !!opts.female;
  const kingdom = normalizeKingdomKey(opts.kingdom);
  const isEden = kingdom === "eden";
  const skin = getSkinPalette(kingdom, fem);

  const hairBase = opts.hairColor || (isEden
    ? (fem ? "#302018" : "#281b14")
    : (fem ? "#4c3222" : "#4a2e1b"));
  const hairDark = "#1a100a";

  /* 1. База кожи с тенью к затылку и под челюстью */
  softVBand(ctx, 0, 0, W, H, skin.base, skin.base, skin.mid);
  softRadial(ctx, 0, H * 0.5, 140, "rgba(58, 38, 26, 0.24)", "rgba(58, 38, 26, 0)");
  softRadial(ctx, W, H * 0.5, 140, "rgba(58, 38, 26, 0.24)", "rgba(58, 38, 26, 0)");
  softVBand(
    ctx,
    0,
    H * 0.80,
    W,
    H * 0.20,
    "rgba(96, 62, 44, 0)",
    fem ? "rgba(104, 68, 50, 0.14)" : "rgba(68, 44, 30, 0.22)",
    fem ? "rgba(92, 58, 42, 0.24)" : "rgba(52, 34, 22, 0.34)"
  );

  /* Следы стужи / ветра на переносице и скулах + впадины под скулами (суровое осунувшееся лицо!) */
  softRadial(ctx, W * 0.50, H * 0.53, 26, skin.windburn, "rgba(0,0,0,0)");
  softRadial(ctx, W * 0.39, H * 0.55, 28, skin.windburn, "rgba(0,0,0,0)");
  softRadial(ctx, W * 0.61, H * 0.55, 28, skin.windburn, "rgba(0,0,0,0)");
  /* Подскуловая тень худобы */
  softRadial(ctx, W * 0.37, H * 0.65, 28, fem ? "rgba(92, 58, 42, 0.16)" : "rgba(68, 44, 28, 0.22)", "rgba(68, 44, 28, 0)");
  softRadial(ctx, W * 0.63, H * 0.65, 28, fem ? "rgba(92, 58, 42, 0.16)" : "rgba(68, 44, 28, 0.22)", "rgba(68, 44, 28, 0)");

  /* Уши по бокам */
  [W * 0.25, W * 0.75].forEach((ex) => {
    softRadial(ctx, ex, H * 0.50, 20, "rgba(88, 54, 34, 0.36)", "rgba(88, 54, 34, 0)");
    ctx.fillStyle = skin.dark;
    ctx.beginPath();
    ctx.ellipse(ex, H * 0.50, 5.5, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  /* 2. ГЛУБОКИЕ ТЕНЕВЫЕ ГЛАЗНИЦЫ И ТЁМНЫЙ ПРИЩУР ZOMBOID (БЕЗ БЕЛЫХ ЯБЛОК!) */
  const eyeY = H * 0.495;
  const eyeDX = fem ? 33 : 35;

  /* Хмурая складка на переносице между бровями */
  softRadial(ctx, W * 0.50, eyeY - 10, 16, "rgba(68, 42, 26, 0.28)", "rgba(68, 42, 26, 0)");
  if (!fem) {
    ctx.fillStyle = "rgba(58, 34, 20, 0.36)";
    ctx.fillRect(W * 0.5 - 4.5, eyeY - 16, 2.2, 9);
    ctx.fillRect(W * 0.5 + 2.3, eyeY - 16, 2.2, 9);
  }

  [-1, 1].forEach((side) => {
    const ex = W * 0.5 + side * eyeDX;

    /* Мягкая мрачная тень глазницы под бровью и усталая тень нижнего века */
    softRadial(ctx, ex, eyeY - 1, 28, fem ? "rgba(68, 42, 28, 0.42)" : "rgba(54, 32, 20, 0.52)", "rgba(54, 32, 20, 0)");
    softRadial(ctx, ex, eyeY + 8, 18, "rgba(64, 40, 28, 0.24)", "rgba(64, 40, 28, 0)");

    /* Никакого белого яблока: чёткий тёмный прищур разреза глаз в масштабе 512×512 */
    ctx.fillStyle = "rgba(26, 15, 9, 0.92)";
    ctx.beginPath();
    ctx.moveTo(ex - 18, eyeY + 2.4);
    ctx.quadraticCurveTo(ex, eyeY - (fem ? 4.4 : 3.4), ex + 18, eyeY + 2.0);
    ctx.quadraticCurveTo(ex, eyeY + (fem ? 5.8 : 4.8), ex - 18, eyeY + 2.4);
    ctx.closePath();
    ctx.fill();

    /* Едва заметный тёмно-пепельный полутон внутри века (не белый!) и глубокий тёмный зрачок */
    ctx.fillStyle = "rgba(146, 128, 112, 0.30)";
    ctx.fillRect(ex - 12, eyeY + 0.2, 24, 2.2);
    ctx.fillStyle = "#120a06";
    ctx.beginPath();
    ctx.ellipse(ex - side * 0.8, eyeY + 1.2, 7.2, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();

    /* Чёткие выразительные низко посаженные брови в духе Zomboid (масштаб 512×512!) */
    ctx.fillStyle = fem ? hairBase : hairDark;
    ctx.beginPath();
    if (fem) {
      /* Строгие плотные брови суровой женщины без удивлённой дуги */
      ctx.moveTo(ex - side * 20, eyeY - 6.5);
      ctx.quadraticCurveTo(ex - side * 2, eyeY - 12.2, ex + side * 22, eyeY - 8.5);
      ctx.lineTo(ex + side * 21, eyeY - 4.0);
      ctx.quadraticCurveTo(ex - side * 2, eyeY - 6.8, ex - side * 19, eyeY - 2.2);
    } else {
      /* Густые тяжёлые мужские брови, нависшие над глазами */
      ctx.moveTo(ex - side * 22, eyeY - 3.8);
      ctx.quadraticCurveTo(ex - side * 3, eyeY - 12.5, ex + side * 24, eyeY - 8.8);
      ctx.lineTo(ex + side * 22, eyeY - 1.8);
      ctx.quadraticCurveTo(ex - side * 3, eyeY - 4.8, ex - side * 20, eyeY + 1.4);
    }
    ctx.closePath();
    ctx.fill();
  });

  /* 3. НОС И НОСОГУБНЫЕ СКЛАДКИ */
  softRadial(ctx, W * 0.5 - 12, H * 0.555, 14, "rgba(78, 46, 28, 0.24)", "rgba(78, 46, 28, 0)");
  softRadial(ctx, W * 0.5 + 12, H * 0.555, 14, "rgba(78, 46, 28, 0.24)", "rgba(78, 46, 28, 0)");
  softRadial(ctx, W * 0.5, H * 0.606, 16, "rgba(68, 38, 22, 0.42)", "rgba(68, 38, 22, 0)");
  ctx.fillStyle = "rgba(42, 22, 12, 0.68)";
  ctx.beginPath();
  ctx.ellipse(W * 0.5 - 6.8, H * 0.598, 3.6, 2.0, 0.25, 0, Math.PI * 2);
  ctx.ellipse(W * 0.5 + 6.8, H * 0.598, 3.6, 2.0, -0.25, 0, Math.PI * 2);
  ctx.fill();

  /* Суровые носогубные тени усталости */
  ctx.fillStyle = "rgba(68, 40, 24, 0.20)";
  ctx.beginPath();
  ctx.moveTo(W * 0.452, H * 0.595);
  ctx.lineTo(W * 0.418, H * 0.688);
  ctx.lineTo(W * 0.430, H * 0.688);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W * 0.548, H * 0.595);
  ctx.lineTo(W * 0.582, H * 0.688);
  ctx.lineTo(W * 0.570, H * 0.688);
  ctx.closePath();
  ctx.fill();

  /* 4. СУХИЕ СЖАТЫЕ ГУБЫ И БОРОДА (БЕЗ РОЗОВОГО «ЯЗЫКА» И БЕЗ РЕЗКОЙ МАСКИ ЩЕТИНЫ!) */
  const mouthY = H * 0.680;
  if (!fem && opts.beard !== false) {
    if (isEden) {
      /* Златодворец: мягкая растушёванная щетина на скулах + чёткие усы и бородка-эспаньолка */
      softRadial(ctx, W * 0.37, H * 0.72, 46, "rgba(38, 25, 16, 0.26)", "rgba(38, 25, 16, 0)");
      softRadial(ctx, W * 0.63, H * 0.72, 46, "rgba(38, 25, 16, 0.26)", "rgba(38, 25, 16, 0)");
      softRadial(ctx, W * 0.50, H * 0.82, 54, "rgba(38, 25, 16, 0.28)", "rgba(38, 25, 16, 0)");

      /* Чёткая эспаньолка по подбородку и усы */
      ctx.fillStyle = hairBase;
      ctx.beginPath();
      ctx.moveTo(W * 0.40, mouthY + 1);
      ctx.quadraticCurveTo(W * 0.50, mouthY - 17, W * 0.60, mouthY + 1);
      ctx.lineTo(W * 0.565, H * 0.91);
      ctx.quadraticCurveTo(W * 0.50, H * 0.97, W * 0.435, H * 0.91);
      ctx.closePath();
      ctx.fill();

      /* Сухая сомкнутая тень рта (никакого светлого языка!) */
      ctx.fillStyle = "#120a05";
      ctx.fillRect(W * 0.5 - 18, mouthY + 0.8, 36, 2.8);
    } else {
      /* Северянин Хладных Ветров: мягкая тень щетины на щеках + густая цельная северная борода! */
      softRadial(ctx, W * 0.36, H * 0.69, 48, "rgba(46, 28, 16, 0.28)", "rgba(46, 28, 16, 0)");
      softRadial(ctx, W * 0.64, H * 0.69, 48, "rgba(46, 28, 16, 0.28)", "rgba(46, 28, 16, 0)");

      ctx.fillStyle = hairBase;
      ctx.beginPath();
      ctx.moveTo(W * 0.25, H * 0.49);
      ctx.quadraticCurveTo(W * 0.34, H * 0.635, W * 0.40, H * 0.635);
      ctx.quadraticCurveTo(W * 0.50, H * 0.602, W * 0.60, H * 0.635);
      ctx.quadraticCurveTo(W * 0.66, H * 0.635, W * 0.75, H * 0.49);
      ctx.lineTo(W * 0.76, H * 0.93);
      ctx.quadraticCurveTo(W * 0.50, H * 0.995, W * 0.24, H * 0.93);
      ctx.closePath();
      ctx.fill();

      /* Густые усы и тёмная борозда сжатого рта — БЕЗ светлой нижней губы! */
      ctx.fillStyle = hairDark;
      ctx.beginPath();
      ctx.moveTo(W * 0.38, mouthY + 3);
      ctx.quadraticCurveTo(W * 0.50, mouthY - 16, W * 0.62, mouthY + 3);
      ctx.quadraticCurveTo(W * 0.50, mouthY + 6, W * 0.38, mouthY + 3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#0f0804";
      ctx.fillRect(W * 0.5 - 19, mouthY + 1.4, 38, 3.0);
    }
  } else {
    /* Строгие сухие губы приглушённого оттенка в масштабе 512×512 (без яркой помады!) */
    ctx.fillStyle = isEden
      ? (fem ? "#a27262" : "#966c58")
      : (fem ? "#9a7568" : "#8d6b5e");
    ctx.beginPath();
    ctx.moveTo(W * 0.5 - 22, mouthY + 1.2);
    ctx.quadraticCurveTo(W * 0.5, mouthY - 5.2, W * 0.5 + 22, mouthY + 1.2);
    ctx.quadraticCurveTo(W * 0.5, mouthY + 7.2, W * 0.5 - 22, mouthY + 1.2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(44, 22, 16, 0.80)";
    ctx.fillRect(W * 0.5 - 22, mouthY + 0.4, 44, 2.4);
    ctx.fillRect(W * 0.5 - 23.5, mouthY + 1.4, 2.8, 2.4);
    ctx.fillRect(W * 0.5 + 20.7, mouthY + 1.4, 2.8, 2.4);
  }

  /* Небольшой шрам на брови у северного мужчины — живая деталь сурового края */
  if (!fem && !isEden) {
    ctx.fillStyle = "rgba(150, 96, 82, 0.52)";
    ctx.beginPath();
    ctx.moveTo(W * 0.5 + eyeDX + 6, eyeY - 16);
    ctx.lineTo(W * 0.5 + eyeDX + 9, eyeY - 16);
    ctx.lineTo(W * 0.5 + eyeDX + 4, eyeY + 8);
    ctx.lineTo(W * 0.5 + eyeDX + 1, eyeY + 8);
    ctx.closePath();
    ctx.fill();
  }

  /* Подложка волос на темени и висках */
  ctx.fillStyle = hairBase;
  ctx.fillRect(0, 0, W, H * 0.23);
  ctx.fillRect(0, 0, W * 0.28, H * 0.56);
  ctx.fillRect(W * 0.72, 0, W * 0.28, H * 0.56);

  return cv;
}

/* ---------- 2. UV-КАРТА ЦЕЛЬНОЙ ШАПКИ ВОЛОС / УБОРОВ ДВУХ КОРОЛЕВСТВ (256×256) ---------- */
export function buildHairTextureCanvas(hairColor = "#4a2e1b", styleKey = "classic", female = false, kingdom = "north", canvasFactory = null) {
  const W = 256;
  const H = 256;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");
  const isEden = normalizeKingdomKey(kingdom) === "eden";

  if (styleKey === "headwear") {
    if (isEden) {
      if (female) {
        /* Златодвор: благородный бордово-парчовый чепец с золотым обручем и светлой вуалью */
        softVBand(ctx, 0, 0, W, H * 0.65, "#6b232b", "#541a21", "#3e1218");
        softVBand(ctx, 0, H * 0.65, W, H * 0.35, "#ded6c8", "#c8beae", "#aba08f");
        /* Золотой венец/обруч на границе чепца */
        ctx.fillStyle = "#c9a44c";
        ctx.fillRect(0, H * 0.62, W, 11);
        ctx.fillStyle = "#8a242c";
        for (let x = 12; x < W; x += 32) {
          ctx.fillRect(x, H * 0.635, 7, 6);
        }
      } else {
        /* Златодвор: суконный придворный шаперон / берет тёмно-пурпурного сукна с золотым кантом */
        softVBand(ctx, 0, 0, W, H * 0.74, "#5c1f28", "#47161e", "#340f15");
        softVBand(ctx, 0, H * 0.74, W, H * 0.26, "#282320", "#1e1a18", "#151210");
        ctx.fillStyle = "#c8a24a";
        ctx.fillRect(0, H * 0.72, W, 7);
      }
    } else {
      if (female) {
        /* Хладные Ветра: суровый северный небелёный льняной убрус с тёмно-брусничной вышивкой */
        softVBand(ctx, 0, 0, W, H, "#d8d1c5", "#c2baac", "#a69e90");
        ctx.fillStyle = "#692822";
        ctx.fillRect(0, H - 22, W, 8);
        ctx.fillStyle = "#b89a62";
        for (let x = 8; x < W; x += 16) {
          ctx.fillRect(x, H - 20, 6, 4);
        }
      } else {
        /* Хладные Ветра: тёплая таёжная шапка с густым меховым околышем */
        softVBand(ctx, 0, 0, W, H * 0.68, "#4f3d2d", "#3f3023", "#302419");
        softVBand(ctx, 0, H * 0.68, W, H * 0.32, "#2c2017", "#211710", "#17100b");
      }
    }
    return cv;
  }

  /* Цельная шапка волос без полосатых «штор» */
  ctx.fillStyle = hairColor;
  ctx.fillRect(0, 0, W, H);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.00, "rgba(14, 8, 4, 0.36)");
  g.addColorStop(0.30, "rgba(255, 220, 185, 0.11)");
  g.addColorStop(0.70, "rgba(0, 0, 0, 0.06)");
  g.addColorStop(1.00, "rgba(12, 6, 3, 0.34)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  /* У жительницы Златодвора в собранной причёске тонкий золочёный шнур/обруч вокруг пучка */
  if (isEden && female && styleKey === "classic") {
    ctx.fillStyle = "#c49e48";
    ctx.fillRect(0, H * 0.76, W, 6);
  }

  return cv;
}

/* ---------- 3. АТЛАС ТЕЛА И ОДЕЖДЫ С ЧЁТКИМИ ЗОНАМИ БЕЗ РАЗМЫТИЯ (512×512) ----------
   ВАЖНО: каждая цветовая зона одежды выровнена по чётким пиксельным координатам Y,
   а геометрия в zomboidCharacter.js ставит парные UV-кольца ДО и ПОСЛЕ каждого шва —
   поэтому края рукавов, наручей, шорт и сапог АБСОЛЮТНО ЧЁТКИЕ, без размазни!

   Карта зон по cy (где v = 1 - cy / 512):
   - cy =   0 ..  28 : шея и ключицы (чистая кожа)
   - cy =  28 .. 136 : верх торса (рубаха / дублет / бригантина / сюрко / майка)
   - cy = 136 .. 150 : ремень / пояс
   - cy = 150 .. 192 : таз и развилка штанов (СТРОГО один цвет с верхом штанин cy = 304..380!)
   - cy = 192 .. 244 : верх руки (рукав / плечо)
   - cy = 244 .. 284 : предплечье (кожа / нижний рукав / наруч)
   - cy = 284 .. 304 : кисть и пальцы (чистая кожа)
   - cy = 304 .. 380 : бедро и колено (штаны / шоссы / шорты / кожа)
   - cy = 380 .. 432 : голень (штаны или высокое голенище сапога воина!)
   - cy = 432 .. 512 : стопа / башмак / сапог */
export function buildBodyTextureCanvas(opts = {}, canvasFactory = null) {
  const W = 512;
  const H = 512;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");

  const fem = !!opts.female;
  const outfit = normalizeOutfitKey(opts.outfit);
  const kingdom = normalizeKingdomKey(opts.kingdom);
  const isEden = kingdom === "eden";
  const skin = getSkinPalette(kingdom, fem);

  ctx.fillStyle = skin.base;
  ctx.fillRect(0, 0, W, H);

  function paintSubtleSideShade(y0, h, alpha = 0.16) {
    softRadial(ctx, W * 0.25, y0 + h * 0.5, h * 0.55, `rgba(12, 12, 14, ${alpha})`, "rgba(0,0,0,0)");
    softRadial(ctx, W * 0.75, y0 + h * 0.5, h * 0.55, `rgba(12, 12, 14, ${alpha})`, "rgba(0,0,0,0)");
  }

  /* =========================================================================
     ВАРИАНТ 1: ИСПОДНЕЕ / СИЛУЭТ АНАТОМИИ ("underwear")
     ========================================================================= */
  if (outfit === "underwear") {
    softVBand(ctx, 0, 0, W, 192, skin.base, skin.mid, skin.base);
    const clothTop = isEden ? "#cfc6b4" : "#aeb8c4";
    const clothBot = isEden ? "#b3a894" : "#8f9aa8";
    const briefCol = isEden ? "#4a3c34" : "#3a3e45";

    if (fem) {
      /* Бандо / льняная нагрудная повязка (cy = 56..96) и нижнее бельё на тазу (cy = 150..192) */
      softVBand(ctx, 0, 56, W, 40, clothTop, clothBot, clothBot);
      ctx.fillStyle = clothTop;
      ctx.fillRect(W * 0.40, 28, 8, 30);
      ctx.fillRect(W * 0.58, 28, 8, 30);
      ctx.fillStyle = briefCol;
      ctx.fillRect(0, 150, W, 42);
      /* Ноги полностью кожа (cy = 304..432) */
      softVBand(ctx, 0, 304, W, 128, skin.base, skin.mid, skin.base);
    } else {
      /* Мужская нательная майка (cy = 28..150) и боксеры на тазу + верху бедра (cy = 150..192 и 304..336) */
      softVBand(ctx, 0, 28, W, 122, clothTop, clothBot, clothBot);
      ctx.fillStyle = skin.base;
      ctx.beginPath();
      ctx.ellipse(W * 0.5, 28, 42, 18, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = briefCol;
      ctx.fillRect(0, 150, W, 42);
      softVBand(ctx, 0, 304, W, 128, skin.base, skin.mid, skin.base);
      ctx.fillStyle = briefCol;
      ctx.fillRect(0, 304, W, 32); // чёткая граница шорт на cy = 336!
    }

    softVBand(ctx, 0, 192, W, 112, skin.base, skin.mid, skin.base);
    ctx.fillStyle = skin.dark;
    ctx.fillRect(0, 297, W, 7);
    /* Босые стопы в режиме исподнего (чистая базовая модель тела, как в эталоне Project Zomboid!) */
    softVBand(ctx, 0, 432, W, 80, skin.base, skin.mid, skin.dark);
    return cv;
  }

  /* =========================================================================
     ВАРИАНТ 2: МИРНЫЙ ЖИТЕЛЬ ("villager") — СЕВЕР vs ЗЛАТОДВОР
     ========================================================================= */
  if (outfit === "villager") {
    if (isEden) {
      /* ЦЕНТРАЛЬНОЕ КОРОЛЕВСТВО ЗЛАТОДВОР:
         Благородное пурпурно-винно-красное / тёмно-синее суконное котарди с золотой отделкой,
         у женщины светлые льняные нижние рукава, у мужчины золочёные пуговицы и тёмные шоссы. */
      const topL = fem ? "#7a2932" : "#283a52";
      const topM = fem ? "#632028" : "#1f2e42";
      const topD = fem ? "#4b171e" : "#172333";
      const pantsL = fem ? "#4a2026" : "#2c2826";
      const pantsD = fem ? "#36161b" : "#1e1b1a";

      softVBand(ctx, 0, 0, W, 28, skin.base, skin.base, skin.mid);
      softVBand(ctx, 0, 28, W, 108, topL, topM, topD);
      paintSubtleSideShade(28, 108, 0.20);

      /* Аккуратный вырез с золотистой вышивкой Златодвора */
      ctx.fillStyle = "#c8a349";
      ctx.fillRect(0, 28, W, 5);
      ctx.fillRect(W * 0.5 - 3, 28, 6, 108); // вертикальная золотая планка котарди!
      if (fem) {
        ctx.fillStyle = skin.base;
        ctx.fillRect(W * 0.43, 24, W * 0.14, 16);
        ctx.fillStyle = "#c8a349";
        ctx.fillRect(W * 0.43, 39, W * 0.14, 4);
      }

      /* Пояс с золочёной пряжкой Златодвора (cy = 136..150) */
      ctx.fillStyle = "#2b1c12";
      ctx.fillRect(0, 136, W, 14);
      ctx.fillStyle = "#d4af53";
      ctx.fillRect(W * 0.5 - 13, 134, 26, 18);
      ctx.fillStyle = "#2b1c12";
      ctx.fillRect(W * 0.5 - 7, 138, 14, 10);

      /* Таз и ноги ЕДИНОГО цвета (cy = 150..192 и cy = 304..432) — 0 швов! */
      softVBand(ctx, 0, 150, W, 42, pantsL, pantsL, pantsD);
      softVBand(ctx, 0, 304, W, 128, pantsD, pantsL, pantsD);

      /* Рукава: верх cy = 192..244 в цвет котарди + золотая тесьма, предплечье cy = 244..284 узкий нижний рукав! */
      softVBand(ctx, 0, 192, W, 52, topL, topM, topD);
      ctx.fillStyle = "#c8a349";
      ctx.fillRect(0, 239, W, 5);
      if (fem) {
        softVBand(ctx, 0, 244, W, 40, "#dfd7c8", "#cdc4b4", "#b8ae9d");
      } else {
        softVBand(ctx, 0, 244, W, 40, "#3b2820", "#2f2019", "#241812");
      }
      softVBand(ctx, 0, 284, W, 20, skin.base, skin.mid, skin.dark);

      /* Остроносые кожаные туфли/сапожки Златодвора (cy = 432..512) */
      softVBand(ctx, 0, 432, W, 80, "#3d2618", "#2b1a10", "#1a100a");
    } else {
      /* КОРОЛЕВСТВО ХЛАДНЫХ ВЕТРОВ (СЕВЕР):
         Суровая приглушённая таёжная шерсть и лён, грубый ремень с железной пряжкой, тёмное сукно портов */
      const topL = fem ? "#b9b2a6" : "#566355";
      const topM = fem ? "#a39c90" : "#465245";
      const topD = fem ? "#8a8378" : "#374136";
      const pantsL = "#464a50";
      const pantsD = "#383b40";

      softVBand(ctx, 0, 0, W, 28, skin.base, skin.base, skin.mid);
      softVBand(ctx, 0, 28, W, 108, topL, topM, topD);
      paintSubtleSideShade(28, 108, 0.20);

      /* Северный V-ворот с тёмной обшивкой */
      ctx.fillStyle = "#2d2823";
      ctx.fillRect(0, 28, W, 4);
      ctx.fillStyle = skin.base;
      ctx.beginPath();
      ctx.moveTo(W * 0.45, 27);
      ctx.lineTo(W * 0.55, 27);
      ctx.lineTo(W * 0.50, 48);
      ctx.closePath();
      ctx.fill();

      /* Кожаный ремень с кованой железной пряжкой (cy = 136..150) */
      ctx.fillStyle = "#221e1b";
      ctx.fillRect(0, 136, W, 14);
      ctx.fillStyle = "#aeb6bf";
      ctx.fillRect(W * 0.5 - 12, 134, 24, 18);
      ctx.fillStyle = "#221e1b";
      ctx.fillRect(W * 0.5 - 7, 138, 14, 10);

      /* Таз (cy = 150..192) и штанины (cy = 304..432) одного плотного серо-бурого сукна! */
      ctx.fillStyle = pantsL;
      ctx.fillRect(0, 150, W, 42);
      softVBand(ctx, 0, 304, W, 128, pantsL, pantsD, "#2e3136");

      /* Рукав строго до cy = 244, дальше чистая кожа предплечья cy = 244..304 (резкий край без размытия!) */
      softVBand(ctx, 0, 192, W, 52, topL, topM, topD);
      ctx.fillStyle = fem ? "#756e64" : "#2c342b";
      ctx.fillRect(0, 239, W, 5);
      softVBand(ctx, 0, 244, W, 60, skin.base, skin.mid, skin.dark);

      /* Крепкие северные кожаные башмаки (cy = 432..512) */
      softVBand(ctx, 0, 432, W, 80, "#262320", "#191715", "#100f0e");
    }
    return cv;
  }

  /* =========================================================================
     ВАРИАНТ 3: ВОИН ("warrior") — ХЛАДНЫЕ ВЕТРА vs РАТНИК ЗЛАТОДВОРА
     ========================================================================= */
  if (isEden) {
    /* РАТНИК ЗЛАТОДВОРА: стальная кольчуга под пурпурно-белым королевским сюрко с золотым гербовым столбом,
       стальные наручи на предплечьях и стальные/кожаные поножи! */
    softVBand(ctx, 0, 0, W, 28, skin.base, skin.base, skin.mid);
    /* Кольчужный воротник у ключиц */
    ctx.fillStyle = "#6c747d";
    ctx.fillRect(0, 24, W, 8);

    /* Пурпурно-кремовый гербовый табард Златодвора (cy = 28..136) */
    softVBand(ctx, 0, 28, W, 108, "#6e222b", "#591b23", "#43141a");
    /* Светло-кремовая передняя полоса с золотым королевским столбом */
    ctx.fillStyle = "#d8cfc0";
    ctx.fillRect(W * 0.38, 30, W * 0.24, 106);
    ctx.fillStyle = "#c9a246";
    ctx.fillRect(W * 0.48, 30, W * 0.04, 106);
    ctx.fillRect(W * 0.43, 56, W * 0.14, 7); // золотой крест/перекладина знамени Златодвора

    /* Воинский пояс с золочёной пряжкой (cy = 136..150) */
    ctx.fillStyle = "#261910";
    ctx.fillRect(0, 136, W, 14);
    ctx.fillStyle = "#d8b254";
    ctx.fillRect(W * 0.5 - 13, 134, 26, 18);
    ctx.fillStyle = "#261910";
    ctx.fillRect(W * 0.5 - 7, 138, 14, 10);

    /* Низ таза и бёдра ЕДИНОГО тёмно-стального цвета стеганых шосс (cy = 150..192 и 304..380) — без зелёного памперса! */
    ctx.fillStyle = "#363a42";
    ctx.fillRect(0, 150, W, 42);
    softVBand(ctx, 0, 304, W, 76, "#363a42", "#2e3239", "#262a30");

    /* Кольчужный рукав (cy = 192..244) + воронёный стальной наруч с латунной кромкой (cy = 244..284) + кисть (284..304) */
    softVBand(ctx, 0, 192, W, 52, "#78818b", "#636b74", "#4f565e");
    for (let ry = 198; ry < 242; ry += 6) {
      ctx.fillStyle = "rgba(24, 28, 34, 0.28)";
      ctx.fillRect(0, ry, W, 2);
    }
    softVBand(ctx, 0, 244, W, 40, "#8d97a3", "#68717c", "#4c535c");
    ctx.fillStyle = "#c9a246";
    ctx.fillRect(0, 244, W, 4);
    ctx.fillRect(0, 280, W, 4);
    softVBand(ctx, 0, 284, W, 20, skin.base, skin.mid, skin.dark);

    /* Высокие латно-кожаные рыцарские сапоги Златодвора (строго с cy = 380 до 512!) */
    softVBand(ctx, 0, 380, W, 52, "#4a3120", "#3a2518", "#2b1b11");
    ctx.fillStyle = "#c9a246";
    ctx.fillRect(0, 380, W, 5);
    softVBand(ctx, 0, 432, W, 80, "#2b1b11", "#1f130c", "#140c07");
  } else {
    /* ВОИН СЕВЕРА (ХЛАДНЫЕ ВЕТРА):
       Клёпаная кожано-ламельная бригантина поверх тёмного таёжного поддоспешника,
       меховая оторочка по плечам, чёткие кожаные наручи и высокие северные сапоги (БЕЗ размытия и БЕЗ зелёного клина в паху!) */
    softVBand(ctx, 0, 0, W, 28, skin.base, skin.base, skin.mid);
    /* Тёмно-бурый меховой воротник у ключиц */
    ctx.fillStyle = "#33261c";
    ctx.fillRect(0, 23, W, 8);

    softVBand(ctx, 0, 28, W, 108, "#63442e", "#4f3523", "#3b2719");
    for (let y = 48; y <= 118; y += 23) {
      ctx.fillStyle = "rgba(18, 10, 4, 0.48)";
      ctx.fillRect(0, y, W, 3);
      ctx.fillStyle = "#9da6b0";
      for (let rx = W * 0.36; rx <= W * 0.64; rx += 28) {
        ctx.fillRect(rx - 2, y - 12, 4, 4);
      }
    }

    /* Тяжёлый северный пояс (cy = 136..150) */
    ctx.fillStyle = "#1f150d";
    ctx.fillRect(0, 136, W, 14);
    ctx.fillStyle = "#9ca5ae";
    ctx.fillRect(W * 0.5 - 13, 134, 26, 18);
    ctx.fillStyle = "#1f150d";
    ctx.fillRect(W * 0.5 - 7, 138, 14, 10);

    /* ВАЖНО: Таз (cy = 150..192) и бёдра (cy = 304..380) СТРОГО ОДНОГО цвета тёмно-серых походных штанов! */
    ctx.fillStyle = "#3a4047";
    ctx.fillRect(0, 150, W, 42);
    softVBand(ctx, 0, 304, W, 76, "#3a4047", "#31363d", "#282c32");

    /* Рукав тёмно-хвойного стёганого поддоспешника (cy = 192..244) + чёткий кожаный наруч с ремнями (cy = 244..284) */
    softVBand(ctx, 0, 192, W, 52, "#3f4b3e", "#333d32", "#283027");
    softVBand(ctx, 0, 244, W, 40, "#593b24", "#472e1b", "#362213");
    ctx.fillStyle = "#1f1209";
    ctx.fillRect(0, 244, W, 4);
    ctx.fillRect(0, 262, W, 4);
    ctx.fillRect(0, 280, W, 4);
    softVBand(ctx, 0, 284, W, 20, skin.base, skin.mid, skin.dark);

    /* Высокие кожаные сапоги хладцев с меховой опушкой сверху (строго с cy = 380 до 512!) */
    softVBand(ctx, 0, 380, W, 52, "#4d331f", "#3d2818", "#2d1d11");
    ctx.fillStyle = "#2b2017";
    ctx.fillRect(0, 380, W, 7); // тёмная меховая/кожаная оторочка верха голенища!
    softVBand(ctx, 0, 432, W, 80, "#2d1d11", "#20140b", "#140c07");
  }

  return cv;
}

/* ---------- 4. АТЛАС КАМНЯ, ТЁСАНОГО ДЕРЕВА, СТАЛИ И СНЕГА ДЛЯ 3D-ОБЪЕКТА (ЭТАЛОН 10/10 — НЕ ТРОГАЕМ!) ---------- */
export function buildPropAtlasCanvas(canvasFactory = null) {
  const W = 512;
  const H = 512;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");

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

  softVBand(ctx, 256, 0, 256, 256, "#7b5c3e", "#694d33", "#563e28");
  const plankCount = 4;
  const plankW = 256 / plankCount;
  for (let p = 0; p < plankCount; p++) {
    const px = 256 + p * plankW;
    ctx.fillStyle = p % 2 === 0 ? "rgba(245, 210, 168, 0.07)" : "rgba(28, 16, 7, 0.11)";
    ctx.fillRect(px + 2, 0, plankW - 3, 256);
    ctx.fillStyle = "rgba(32, 18, 8, 0.55)";
    ctx.fillRect(px, 0, 2, 256);
    ctx.fillStyle = "rgba(255, 225, 190, 0.10)";
    ctx.fillRect(px + 2, 0, 3, 256);
    const knotY = 48 + ((p * 67) % 160);
    softRadial(ctx, px + plankW * 0.52, knotY, 12, "rgba(42, 24, 10, 0.32)", "rgba(42, 24, 10, 0)");
    ctx.fillStyle = "rgba(36, 20, 8, 0.45)";
    ctx.beginPath();
    ctx.ellipse(px + plankW * 0.52, knotY, 3.5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  softVBand(ctx, 256, 0, 256, 36, "rgba(24, 14, 6, 0.28)", "rgba(24, 14, 6, 0.08)", "rgba(24, 14, 6, 0)");
  softVBand(ctx, 256, 220, 256, 36, "rgba(24, 14, 6, 0)", "rgba(24, 14, 6, 0.10)", "rgba(24, 14, 6, 0.32)");

  softVBand(ctx, 0, 256, 256, 256, "#9eaab8", "#6b7682", "#3e464f");
  ctx.fillStyle = "#d8e2ec";
  for (let rx = 24; rx < 240; rx += 48) {
    ctx.beginPath();
    ctx.arc(rx, 320, 5, 0, Math.PI * 2);
    ctx.arc(rx, 440, 5, 0, Math.PI * 2);
    ctx.fill();
  }

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
