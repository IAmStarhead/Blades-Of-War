/* ============================================================================
   BLADES OF WAR — ПРОЦЕДУРНЫЕ 3D-ТЕКСТУРЫ ПЕРСОНАЖЕЙ И ОКРУЖЕНИЯ
   - Два народа Земли Эдема на контрасте:
     1) Королевство Хладных Ветров ("north", Север): бледная сибирская кожа
        холодного подтона, тёмно-русые/каштановые волосы и густые бороды,
        суровые северные одежды, кожаная бригантина и мех.
     2) Королевство Златодвор ("eden", Центр Эдема): свежий светло-телесный тон
        умеренных широт (без южного загара), русые и золотисто-русые волосы,
        гладко выбритые мужчины, женственный средневековый макияж у горожанок,
        благородное сукно, золотая отделка, кольчуга и гербовое сюрко.
   - Полное разделение текстуры базового тела (кожа + исподнее) и текстуры
     верхней одежды/доспехов/сапог + отключение мипмапов на персонажах (0% размытия).
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

/* Палитра кожи и волос по происхождению:
   - Север ("north"): бледная северная («сибирская») кожа малосолнечного края с лёгким морозным румянцем.
   - Центр ("eden"): здоровый светло-телесный тон умеренной полосы (теплее Севера, но без южного загара) + русые волосы. */
export function getKingdomAppearance(kingdom = "north", female = false) {
  if (kingdom === "eden") {
    return female
      ? {
          skinBase: "#f0d4bc",
          skinMid:  "#e2bfa2",
          skinDark: "#c99f7e",
          blush:    "rgba(208, 108, 102, 0.22)",
          hairBase: "#9a7449", // золотисто-русый
          hairLight:"#b58d5e",
          hairDark: "#694b2c"
        }
      : {
          skinBase: "#ead0b6",
          skinMid:  "#dab899",
          skinDark: "#bf9675",
          blush:    "rgba(186, 106, 90, 0.10)",
          hairBase: "#87643e", // благородный средне-русый
          hairLight:"#a17b50",
          hairDark: "#593f24"
        };
  }
  /* Королевство Хладных Ветров (Север) */
  return female
    ? {
        skinBase: "#efe0d6", // светлая бледная северная кожа
        skinMid:  "#dfcbc0",
        skinDark: "#c4aba0",
        blush:    "rgba(192, 118, 112, 0.16)", // лёгкий морозный румянец с сухого ветра
        hairBase: "#5a3d28", // тёмно-русый / каштановый
        hairLight:"#704e35",
        hairDark: "#362214"
      }
    : {
        skinBase: "#ead8cc",
        skinMid:  "#d8c2b4",
        skinDark: "#bca293",
        blush:    "rgba(178, 104, 96, 0.14)",
        hairBase: "#4d321f",
        hairLight:"#63422b",
        hairDark: "#2d1b0f"
      };
}

/* ---------- 1. ТЕКСТУРА ГОЛОВЫ И ЛИЦА (512×512) ----------
   Возвращена живая пропорциональная основа лиц и доработана под характер двух народов:
   - живые человеческие глаза с приглушённой (не светящейся) склерой и чёткой радужкой;
   - женственные лица у женщин (в Златодворе — с аккуратным средневековым макияжем);
   - гладко выбритые благородные мужчины в Златодворе и густая северная борода без щели рта на Севере. */
export function buildHeadTextureCanvas(opts = {}, canvasFactory = null) {
  const W = 512;
  const H = 512;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");

  const fem = !!opts.female;
  const kingdom = normalizeKingdomKey(opts.kingdom);
  const isEden = kingdom === "eden";
  const pal = getKingdomAppearance(kingdom, fem);

  const hairBase = opts.hairColor || pal.hairBase;
  const hairDark = pal.hairDark;
  /* Мужчины Златодвора по канону гладко выбриты, северяне — с густой бородой */
  const hasBeard = !fem && (opts.beard !== undefined ? !!opts.beard : !isEden);

  /* 1. Чистая живая кожа с мягким естественным объёмом к затылку и под подбородком (без серой грязи!) */
  softVBand(ctx, 0, 0, W, H, pal.skinBase, pal.skinBase, pal.skinMid);
  softRadial(ctx, 0, H * 0.5, 130, "rgba(110, 74, 52, 0.16)", "rgba(110, 74, 52, 0)");
  softRadial(ctx, W, H * 0.5, 130, "rgba(110, 74, 52, 0.16)", "rgba(110, 74, 52, 0)");
  softVBand(
    ctx,
    0,
    H * 0.83,
    W,
    H * 0.17,
    "rgba(140, 96, 72, 0)",
    fem ? "rgba(148, 102, 80, 0.10)" : "rgba(120, 82, 60, 0.16)",
    fem ? "rgba(136, 92, 70, 0.18)"  : "rgba(105, 70, 50, 0.24)"
  );

  /* Живой румянец: на Севере — сухой морозный на скулах и кончике носа, в Златодворе у женщин — нежные румяна */
  softRadial(ctx, W * 0.405, H * 0.555, fem ? 36 : 30, pal.blush, "rgba(0,0,0,0)");
  softRadial(ctx, W * 0.595, H * 0.555, fem ? 36 : 30, pal.blush, "rgba(0,0,0,0)");
  if (!isEden) {
    softRadial(ctx, W * 0.50, H * 0.585, 18, "rgba(188, 112, 104, 0.13)", "rgba(0,0,0,0)");
  }

  /* ПОРОДА ДВУХ НАРОДОВ (до прорисовки глаз, чтобы брови и веки легли поверх):
     Север — тяжёлая нависающая надбровная дуга и широкая переносица;
     Златодвор — высокие точёные скулы и тонкий нос аристократа */
  if (!fem && !isEden) {
    /* Тень под тяжёлой надбровной дугой северянина */
    softRadial(ctx, W * 0.5 - 37, H * 0.470, 30, "rgba(96, 62, 42, 0.20)", "rgba(96, 62, 42, 0)");
    softRadial(ctx, W * 0.5 + 37, H * 0.470, 30, "rgba(96, 62, 42, 0.20)", "rgba(96, 62, 42, 0)");
    /* Широкая грубая переносица */
    softRadial(ctx, W * 0.5 - 13, H * 0.520, 15, "rgba(118, 76, 50, 0.18)", "rgba(118, 76, 50, 0)");
    softRadial(ctx, W * 0.5 + 13, H * 0.520, 15, "rgba(118, 76, 50, 0.18)", "rgba(118, 76, 50, 0)");
  } else if (!fem && isEden) {
    /* Светлый блик высоких скул и лёгкая подскуловая тень златодворца */
    softRadial(ctx, W * 0.395, H * 0.530, 22, "rgba(255, 238, 216, 0.16)", "rgba(255, 238, 216, 0)");
    softRadial(ctx, W * 0.605, H * 0.530, 22, "rgba(255, 238, 216, 0.16)", "rgba(255, 238, 216, 0)");
    softRadial(ctx, W * 0.400, H * 0.585, 18, "rgba(118, 76, 52, 0.13)", "rgba(118, 76, 52, 0)");
    softRadial(ctx, W * 0.600, H * 0.585, 18, "rgba(118, 76, 52, 0.13)", "rgba(118, 76, 52, 0)");
  }

  /* 2. ЖИВЫЕ ЧЕЛОВЕЧЕСКИЕ ГЛАЗА И БРОВИ (основа прошлого удачного варианта, улучшенная:
     глаза КРУПНЕЕ, с читаемым верхним веком и мягкой линией нижнего века) */
  const eyeY = H * 0.495;
  const eyeDX = fem ? 35 : 37;

  [-1, 1].forEach((side) => {
    const ex = W * 0.5 + side * eyeDX;

    /* Деликатная тёплая тень верхнего века (у женщин Златодвора — чуть мягкого дымчатого тона век) */
    softRadial(
      ctx,
      ex,
      eyeY - 2,
      fem ? 22 : 25,
      fem
        ? (isEden ? "rgba(128, 84, 72, 0.28)" : "rgba(132, 94, 76, 0.24)")
        : "rgba(116, 78, 56, 0.32)",
      "rgba(120, 80, 60, 0)"
    );

    /* Приглушённая естественная склера в тени ресниц (не ярко-белая, но даёт живой человеческий взгляд!) */
    ctx.fillStyle = isEden ? "#d8cec2" : "#d3c9be";
    ctx.beginPath();
    ctx.ellipse(ex, eyeY + 2.4, fem ? 14.3 : 13.8, fem ? 5.6 : 5.0, 0, 0, Math.PI * 2);
    ctx.fill();

    /* Радужка: у северян серо-ледяная / тёмно-серая, у златодворцев орехово-каряя / сине-зелёная */
    ctx.fillStyle = isEden
      ? (fem ? "#3c4c3e" : "#473524")
      : (fem ? "#42525e" : "#38454f");
    ctx.beginPath();
    ctx.ellipse(ex - side * 0.7, eyeY + 2.2, fem ? 7.3 : 7.0, fem ? 5.4 : 4.9, 0, 0, Math.PI * 2);
    ctx.fill();

    /* Зрачок + живой блик */
    ctx.fillStyle = "#120d0a";
    ctx.beginPath();
    ctx.arc(ex - side * 0.7, eyeY + 2.2, 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 252, 244, 0.65)";
    ctx.beginPath();
    ctx.arc(ex - side * 0.7 - 1.6, eyeY + 0.8, 1.1, 0, Math.PI * 2);
    ctx.fill();

    /* Складка верхнего века (чёткое человеческое веко над ресницами) */
    ctx.strokeStyle = fem ? "rgba(112, 72, 52, 0.38)" : "rgba(104, 66, 46, 0.42)";
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(ex - 13.6, eyeY - 4.6);
    ctx.quadraticCurveTo(ex, eyeY - (fem ? 10.4 : 9.2), ex + 13.6, eyeY - 4.6);
    ctx.stroke();

    /* Мягкая линия нижнего века */
    ctx.strokeStyle = "rgba(126, 82, 60, 0.30)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ex - 11.5, eyeY + 6.6);
    ctx.quadraticCurveTo(ex, eyeY + (fem ? 9.6 : 8.8), ex + 11.5, eyeY + 6.6);
    ctx.stroke();

    /* Ресничный контур верхнего века (у женщин Златодвора — тонкая подводка сурьмой с ресничкой у края) */
    ctx.fillStyle = fem && isEden ? "#19100d" : "#261810";
    ctx.beginPath();
    const outerWing = fem && isEden ? side * 3.2 : 0;
    ctx.moveTo(ex - 14.5, eyeY + 2.8);
    ctx.quadraticCurveTo(ex, eyeY - (fem ? 4.6 : 3.4), ex + 14.5, eyeY + 2.8);
    if (fem && isEden) {
      ctx.lineTo(ex + side * 16.8, eyeY + 0.6);
    }
    ctx.lineTo(ex + 13.8 + outerWing * 0.4, eyeY - (fem ? 0.5 : 0.1));
    ctx.quadraticCurveTo(ex, eyeY - (fem ? 7.2 : 5.8), ex - 13.8, eyeY - (fem ? 0.5 : 0.1));
    ctx.closePath();
    ctx.fill();

    /* Брови: у женщин тонкие, плавные и женственные; у мужчин спокойные выразительные (у северян чуть суровее) */
    ctx.fillStyle = hairDark;
    ctx.beginPath();
    if (fem) {
      const browLift = isEden ? 1.2 : 0.0;
      ctx.moveTo(ex - side * 16, eyeY - 9.2 - browLift * 0.4);
      ctx.quadraticCurveTo(ex - side * 1, eyeY - 15.2 - browLift, ex + side * 18, eyeY - 10.2 - browLift * 0.6);
      ctx.lineTo(ex + side * 17, eyeY - 7.4 - browLift * 0.5);
      ctx.quadraticCurveTo(ex - side * 1, eyeY - 11.6 - browLift, ex - side * 15, eyeY - 6.4 - browLift * 0.3);
    } else {
      const sternShift = isEden ? 0.0 : 1.6;
      ctx.moveTo(ex - side * 18, eyeY - 6.8 + sternShift);
      ctx.quadraticCurveTo(ex, eyeY - 13.2 + sternShift * 0.4, ex + side * 20, eyeY - 9.6);
      ctx.lineTo(ex + side * 19, eyeY - 4.2);
      ctx.quadraticCurveTo(ex, eyeY - 7.6 + sternShift * 0.4, ex - side * 17, eyeY - 2.6 + sternShift);
    }
    ctx.closePath();
    ctx.fill();
  });

  /* 3. АККУРАТНЫЙ НОС (без старческих носогубных складок!) */
  softRadial(ctx, W * 0.5 - 10, H * 0.545, 13, "rgba(132, 86, 58, 0.16)", "rgba(132, 86, 58, 0)");
  softRadial(ctx, W * 0.5 + 10, H * 0.545, 13, "rgba(132, 86, 58, 0.16)", "rgba(132, 86, 58, 0)");
  softRadial(ctx, W * 0.5, H * 0.604, fem ? 13 : 15, "rgba(120, 74, 48, 0.32)", "rgba(120, 74, 48, 0)");
  ctx.fillStyle = "rgba(82, 48, 30, 0.48)";
  ctx.beginPath();
  ctx.ellipse(W * 0.5 - (fem ? 5.4 : 6.2), H * 0.598, fem ? 2.6 : 3.1, 1.6, 0.22, 0, Math.PI * 2);
  ctx.ellipse(W * 0.5 + (fem ? 5.4 : 6.2), H * 0.598, fem ? 2.6 : 3.1, 1.6, -0.22, 0, Math.PI * 2);
  ctx.fill();

  /* 4. ГУБЫ И СЕВЕРНАЯ БОРОДА */
  const mouthY = H * 0.676;
  if (hasBeard) {
    /* Северянин Хладных Ветров: густая опрятная борода с сомкнутыми усами —
       БЕЗ розовой губы И БЕЗ огромной чёрной щели рта! */
    ctx.fillStyle = hairBase;
    ctx.beginPath();
    ctx.moveTo(W * 0.27, H * 0.49);
    ctx.quadraticCurveTo(W * 0.34, H * 0.635, W * 0.41, H * 0.632);
    ctx.quadraticCurveTo(W * 0.50, H * 0.602, W * 0.59, H * 0.632);
    ctx.quadraticCurveTo(W * 0.66, H * 0.635, W * 0.73, H * 0.49);
    ctx.lineTo(W * 0.75, H * 0.92);
    ctx.quadraticCurveTo(W * 0.50, H * 0.99, W * 0.25, H * 0.92);
    ctx.closePath();
    ctx.fill();

    /* Объёмные усы над губой и мягкая короткая тень сомкнутого рта прямо под усами */
    ctx.fillStyle = hairDark;
    ctx.beginPath();
    ctx.moveTo(W * 0.41, mouthY + 1.5);
    ctx.quadraticCurveTo(W * 0.50, mouthY - 12.5, W * 0.59, mouthY + 1.5);
    ctx.quadraticCurveTo(W * 0.50, mouthY - 1.5, W * 0.41, mouthY + 1.5);
    ctx.closePath();
    ctx.fill();

    /* Лишь короткая деликатная ложбинка под центром усов (не широкий рот во всю бороду!) */
    ctx.fillStyle = "rgba(26, 15, 8, 0.65)";
    ctx.beginPath();
    ctx.ellipse(W * 0.5, mouthY + 2.2, 10.5, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();

    /* Едва заметная фактура прядей бороды (деликатные полупрозрачные штрихи, не «зубья») */
    for (let i = 0; i < 38; i++) {
      const bx = W * 0.31 + (i * 37 % Math.floor(W * 0.38));
      const by = mouthY + 8 + (i * 19 % 75);
      ctx.strokeStyle = i % 3 === 0 ? "rgba(215, 173, 125, 0.18)" : "rgba(24, 13, 7, 0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + (bx - W * 0.5) * 0.04, by + 8, bx + (bx - W * 0.5) * 0.08, by + 16);
      ctx.stroke();
    }
  } else if (fem) {
    /* Женственные мягкие губы:
       - в Златодворе — благородный ягодно-розовый тинт средневековой красавицы;
       - на Севере — натуральные мягкие губы спокойного тёпло-розового тона. */
    const upperLipCol = isEden ? "#b66268" : "#b8827b";
    const lowerLipCol = isEden ? "#c87378" : "#c69189";

    /* Верхняя губа с «галочкой» Купидона */
    ctx.fillStyle = upperLipCol;
    ctx.beginPath();
    ctx.moveTo(W * 0.5 - 19.0, mouthY + 1.2);
    ctx.quadraticCurveTo(W * 0.5 - 6, mouthY - 5.2, W * 0.5, mouthY - 3.2);
    ctx.quadraticCurveTo(W * 0.5 + 6, mouthY - 5.2, W * 0.5 + 19.0, mouthY + 1.2);
    ctx.closePath();
    ctx.fill();

    /* Более полная мягкая нижняя губа */
    ctx.fillStyle = lowerLipCol;
    ctx.beginPath();
    ctx.moveTo(W * 0.5 - 18.5, mouthY + 1.2);
    ctx.quadraticCurveTo(W * 0.5, mouthY + 9.2, W * 0.5 + 18.5, mouthY + 1.2);
    ctx.closePath();
    ctx.fill();

    /* Мягкая естественная линия смыкания губ */
    ctx.fillStyle = isEden ? "rgba(86, 34, 38, 0.62)" : "rgba(92, 48, 42, 0.55)";
    ctx.beginPath();
    ctx.ellipse(W * 0.5, mouthY + 1.2, 18.0, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    /* Гладко выбритый мужчина Златодвора (или безбородый северянин):
       БЛЕДНЫЕ мужские губы почти в тон кожи (никакого коричневого пятна!) —
       рот читается главным образом по тёмной линии смыкания */
    ctx.fillStyle = isEden ? "rgba(197, 140, 118, 0.52)" : "rgba(188, 134, 114, 0.48)";
    ctx.beginPath();
    ctx.moveTo(W * 0.5 - 19.0, mouthY + 0.8);
    ctx.quadraticCurveTo(W * 0.5, mouthY - 3.8, W * 0.5 + 19.0, mouthY + 0.8);
    ctx.quadraticCurveTo(W * 0.5, mouthY + 5.8, W * 0.5 - 19.0, mouthY + 0.8);
    ctx.closePath();
    ctx.fill();

    /* Тёмная линия смыкания губ с лёгким изгибом */
    ctx.strokeStyle = "rgba(74, 38, 28, 0.60)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(W * 0.5 - 18.0, mouthY + 0.6);
    ctx.quadraticCurveTo(W * 0.5, mouthY + 2.4, W * 0.5 + 18.0, mouthY + 0.6);
    ctx.stroke();
    /* Лёгкая благородная ямочка/тень под нижней губой */
    softRadial(ctx, W * 0.5, mouthY + 11, 9, "rgba(116, 74, 52, 0.22)", "rgba(116, 74, 52, 0)");
  }

  /* Подложка волос по темени и за ушами (в цвет причёски народа!) */
  ctx.fillStyle = hairBase;
  ctx.fillRect(0, 0, W, H * 0.22);

  return cv;
}

/* ---------- 2. ТЕКСТУРА ПРИЧЁСОК И ГОЛОВНЫХ УБОРОВ ДВУХ НАРОДОВ (256×256) ---------- */
export function buildHairTextureCanvas(hairColor = null, styleKey = "classic", female = false, kingdom = "north", canvasFactory = null) {
  const W = 256;
  const H = 256;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");
  const normKingdom = normalizeKingdomKey(kingdom);
  const isEden = normKingdom === "eden";
  const pal = getKingdomAppearance(normKingdom, female);
  const baseCol = hairColor || pal.hairBase;

  if (styleKey === "headwear") {
    if (isEden) {
      if (female) {
        /* Златодвор (жен.): изящный средневековый парчовый чепец-эскофьон с золотым венцом и светлой вуалью */
        softVBand(ctx, 0, 0, W, H * 0.64, "#8a2f3b", "#70222d", "#561822");
        ctx.fillStyle = "#dcb65c";
        ctx.fillRect(0, H * 0.58, W, 11);
        ctx.fillStyle = "#982532";
        for (let x = 16; x < W; x += 32) {
          ctx.fillRect(x, H * 0.595, 7, 6);
        }
        softVBand(ctx, 0, H * 0.64, W, H * 0.36, "#f2eadc", "#e3d6c2", "#cbbba2");
      } else {
        /* Златодвор (муж.): благородный бархатный берет/шаперон цвета бордо и золота */
        softVBand(ctx, 0, 0, W, H * 0.72, "#782632", "#5c1b25", "#43121a");
        ctx.fillStyle = "#d8b256";
        ctx.fillRect(0, H * 0.68, W, 8);
        ctx.fillStyle = "#261a14";
        ctx.fillRect(0, H * 0.72, W, H * 0.28);
      }
    } else if (female) {
      /* Север (жен.): плотный тёплый льняной плат-убрус с северной вышивкой по очелью */
      softVBand(ctx, 0, 0, W, H, "#e4ddd0", "#cfc6b6", "#b2a896");
      ctx.fillStyle = "#6e3128";
      ctx.fillRect(0, H * 0.34, W, 6);
      ctx.fillRect(0, H * 0.88, W, 7);
    } else {
      /* Север (муж.): тёплая суконная шапка с густой меховой опушкой */
      softVBand(ctx, 0, 0, W, H * 0.58, "#5c4230", "#493323", "#382619");
      softVBand(ctx, 0, H * 0.58, W, H * 0.42, "#332419", "#241911", "#18100a");
      for (let x = 0; x < W; x += 8) {
        ctx.fillStyle = x % 16 === 0 ? "rgba(255,235,210,0.09)" : "rgba(0,0,0,0.20)";
        ctx.fillRect(x, H * 0.58, 4, H * 0.42);
      }
    }
    return cv;
  }

  /* Волосы: живые пряди с естественным переливом. Полосы ДЕЛИКАТНЫЕ —
     прежние alpha 0.11/0.14 читались как «древесные волокна», приглушено */
  ctx.fillStyle = baseCol;
  ctx.fillRect(0, 0, W, H);
  softVBand(ctx, 0, 0, W, H, "rgba(255, 240, 215, 0.14)", "rgba(0, 0, 0, 0.04)", "rgba(18, 10, 4, 0.32)");

  // Короткие изогнутые пучки, а не одинаковые полосы от макушки до края.
  for (let i = 0; i < 76; i++) {
    const x = (i * 67 + 13) % W;
    const y = (i * 47 + 9) % 220;
    const length = 22 + (i * 17 % 36);
    const bend = (i % 3 - 1) * 7 + (female ? 3 : -3);
    ctx.strokeStyle = i % 3 === 0 ? "rgba(255, 226, 181, 0.10)" : "rgba(20, 10, 4, 0.12)";
    ctx.lineWidth = i % 4 === 0 ? 1.4 : 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + bend, y + length * 0.48, x + bend * 0.6, y + length);
    ctx.stroke();
  }

  /* У жительниц Златодвора на классической причёске — тонкий золочёный обруч/лента в русых волосах */
  if (isEden && female && styleKey === "classic") {
    ctx.fillStyle = "#d6b054";
    ctx.fillRect(0, H * 0.30, W, 6);
  }

  return cv;
}

/* ---------- 3. ТЕКСТУРА БАЗОВОГО ТЕЛА ЧЕЛОВЕКА (512×512) ----------
   Используется ТОЛЬКО для гладкого анатомического тела (кожа + нательное бельё в режиме "underwear").
   Зоны разнесены с большим отступом (padding >= 16px), мипмапы отключены:
   - cy = 0..220:   чистая кожа (шея, грудь/живот, руки, ноги и босые ступни!)
   - cy = 240..360: льняной бюстье/топ или мужская нательная рубаха (если нужна)
   - cy = 380..500: исподние шортики / брэ */
export function buildBaseBodyTextureCanvas(opts = {}, canvasFactory = null) {
  const W = 512;
  const H = 512;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");

  const fem = !!opts.female;
  const kingdom = normalizeKingdomKey(opts.kingdom);
  const isEden = kingdom === "eden";
  const outfit = normalizeOutfitKey(opts.outfit);
  const pal = getKingdomAppearance(kingdom, fem);

  /* Зона 1 (cy = 0..232): чистая гладкая кожа с лёгким естественным объёмом по бокам */
  // Единый тон без вертикального градиента: UV щиколотки и стопы не должны
  // давать границу цвета, похожую на край носка. Объём создают нормали и свет.
  ctx.fillStyle = pal.skinBase;
  ctx.fillRect(0, 0, W, 232);

  /* Лёгкая тень под челюстью и подбородком на верху шеи (cy 0..22 — самый верх зоны кожи):
     голова перестаёт выглядеть «приставленной» к шее */
  softVBand(ctx, 0, 0, W, 22, "rgba(88, 56, 38, 0.26)", "rgba(88, 56, 38, 0.10)", "rgba(88, 56, 38, 0)");

  /* Волосы на теле временно отключены: кожа без равномерного крапа. */
  // Кожа конечностей и торса использует одну UV-зону. Нарисованные на ней
  // ключицы и тени груди повторялись на руках и ногах как тёмные полосы.
  // Их нельзя размещать в общей зоне; объём задаётся геометрией и светом.

  // Очень короткие намёки на разделение пальцев только в нижних рядах UV
  // передка стопы. Без отдельных шариков и без тёмного контура.
  ctx.strokeStyle = "rgba(100, 67, 53, 0.28)";
  ctx.lineWidth = 1.6;
  for (const u of [0.39, 0.46, 0.53, 0.60]) {
    ctx.beginPath();
    ctx.moveTo(W * u, 223);
    ctx.quadraticCurveTo(W * u + 0.7, 226, W * u, 229);
    ctx.stroke();
  }

  /* Зона 2 (cy = 236..368): верх исподнего (льняная повязка/бюстье у женщин, льняная майка или торс у мужчин) */
  const linenTop  = isEden ? "#ece4d4" : "#d8d2c7";
  const linenMid  = isEden ? "#dcd2be" : "#c6bfb3";
  const linenDark = isEden ? "#c8bc9e" : "#b0a89b";
  softVBand(ctx, 0, 236, W, 132, linenTop, linenMid, linenDark);
  /* Мягкие складки льняной ткани */
  for (let x = 16; x < W; x += 32) {
    ctx.fillStyle = "rgba(60, 46, 30, 0.05)";
    ctx.fillRect(x, 236, 6, 132);
  }

  /* Зона 3 (cy = 376..512): низ исподнего (аккуратные тканевые шортики / средневековые брэ) */
  const briefTop = isEden ? "#5b483a" : "#444950";
  const briefBot = isEden ? "#46362b" : "#33373d";
  softVBand(ctx, 0, 376, W, 136, briefTop, briefBot, briefBot);

  /* Если поверх тела надета верхняя одежда ("villager" / "warrior"), зоны белья не мешают,
     но для полной чистоты у шеи/рук всегда используется зона 1 (чистая кожа cy = 12..210). */
  void outfit;
  return cv;
}

/* ---------- 4. ТЕКСТУРА ВЕРХНЕЙ ОДЕЖДЫ, ДОСПЕХОВ И САПОГ (512×512) ----------
   Каждая деталь одежды лежит в СВОЕЙ изолированной полосе с отступом >= 16px!
   Никакой кожи рядом с рукавами, наручами или сапогами — размазываться физически нечему!
   Карта изолированных полос (v = 1 - cy / 512):
   - Полоса А (cy =   0..168): ТОРС (рубаха / котарди / кожаная бригантина / рыцарское сюрко)
   - Полоса Б (cy = 176..216): ПОЯС И ПРЯЖКА
   - Полоса В (cy = 224..304): ВЕРХНИЙ РУКАВ (ткань рубахи / котарди / стёганка / кольчуга)
   - Полоса Г (cy = 312..376): НИЖНИЙ РУКАВ ИЛИ НАРУЧ (узкий рукав Златодвора / кожаный наруч Севера / стальной наруч Златодвора)
   - Полоса Д (cy = 384..448): ШТАНЫ / ШОССЫ (единый чистый цвет для таза и штанин!)
   - Полоса Е (cy = 456..512): ОБУВЬ / ВЫСОКИЕ САПОГИ */
export function buildGarmentTextureCanvas(opts = {}, canvasFactory = null) {
  const W = 512;
  const H = 512;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");

  const fem = !!opts.female;
  const kingdom = normalizeKingdomKey(opts.kingdom);
  const isEden = kingdom === "eden";
  const outfit = normalizeOutfitKey(opts.outfit);
  const pal = getKingdomAppearance(kingdom, fem);

  ctx.fillStyle = "#2a2d32";
  ctx.fillRect(0, 0, W, H);

  /* Вспомогательное боковое затенение цилиндра торса (u=0/1 спина, u=0.25/0.75 бока, u=0.5 грудь) */
  function shadeTorsoSides(y0, h, alpha = 0.18) {
    softRadial(ctx, W * 0.25, y0 + h * 0.5, 88, `rgba(12, 10, 8, ${alpha})`, "rgba(0,0,0,0)");
    softRadial(ctx, W * 0.75, y0 + h * 0.5, 88, `rgba(12, 10, 8, ${alpha})`, "rgba(0,0,0,0)");
  }

  if (outfit === "villager") {
    if (isEden) {
      /* === МИРНЫЙ ЖИТЕЛЬ ЗЛАТОДВОРА (ЦЕНТРАЛЬНОЕ КОРОЛЕВСТВО) ===
         Благородное приталенное котарди: у женщины — глубокий винно-рубиновый с золотистой вышивкой
         и кремовыми нижними рукавами; у мужчины — статной сапфирово-синий дублет с золотым кантом. */
      const topL = fem ? "#882c38" : "#2b425e";
      const topM = fem ? "#6f212c" : "#21344b";
      const topD = fem ? "#561821" : "#182638";
      const hoseL = fem ? "#4b2229" : "#322d29";
      const hoseD = fem ? "#38181e" : "#24201d";

      /* А. Торс (cy = 0..168) */
      softVBand(ctx, 0, 0, W, 168, topL, topM, topD);
      shadeTorsoSides(0, 168, 0.20);
      /* Золотая тесьма по горловине, подолу и центральная планка с пуговицами */
      ctx.fillStyle = "#d4af56";
      ctx.fillRect(0, 0, W, 8);
      ctx.fillRect(0, 158, W, 8);
      ctx.fillRect(W * 0.5 - 3, 0, 6, 168);
      if (fem) {
        /* Изящный фигурный вырез у ключиц (в цвет кожи лишь у самого ворота спереди) */
        ctx.fillStyle = pal.skinBase;
        ctx.fillRect(W * 0.44, 0, W * 0.12, 22);
        ctx.fillStyle = "#d4af56";
        ctx.fillRect(W * 0.44, 20, W * 0.12, 5);
      }

      /* Б. Пояс с золочёной пряжкой (cy = 176..216) */
      softVBand(ctx, 0, 176, W, 40, "#3a2518", "#2b1b11", "#20130b");
      ctx.fillStyle = "#dfcba0";
      ctx.fillStyle = "#dbb65c";
      ctx.fillRect(W * 0.5 - 15, 180, 30, 32);
      ctx.fillStyle = "#2b1b11";
      ctx.fillRect(W * 0.5 - 8, 187, 16, 18);

      /* В. Верхний рукав (cy = 224..304) */
      softVBand(ctx, 0, 224, W, 80, topL, topM, topD);
      ctx.fillStyle = "#d4af56";
      ctx.fillRect(0, 294, W, 8);

      /* Г. Нижний узкий рукав Златодвора (cy = 312..376) */
      if (fem) {
        softVBand(ctx, 0, 312, W, 64, "#efe6d5", "#dfd3be", "#cbbda6");
        ctx.fillStyle = "#d4af56";
        ctx.fillRect(0, 368, W, 6);
      } else {
        softVBand(ctx, 0, 312, W, 64, "#4a3323", "#3b281b", "#2d1e14");
        ctx.fillStyle = "#d4af56";
        ctx.fillRect(0, 368, W, 6);
      }

      /* Д. Шоссы / брюки (cy = 384..448) */
      softVBand(ctx, 0, 384, W, 64, hoseL, hoseL, hoseD);

      /* Е. Кожаные туфли/полусапожки Златодвора (cy = 456..512) */
      softVBand(ctx, 0, 456, W, 56, "#4d311f", "#3a2416", "#26170d");
    } else {
      /* === МИРНЫЙ ЖИТЕЛЬ ХЛАДНЫХ ВЕТРОВ (СЕВЕР) ===
         Практичная плотная северная рубаха (у женщины — тёплый небеленый лён с тёмно-северной тесьмой,
         у мужчины — суровая хвойно-зелёная шерсть), плотные походные порты и крепкие кожаные башмаки. */
      const topL = fem ? "#cfc8bc" : "#516150";
      const topM = fem ? "#bdb5a8" : "#435142";
      const topD = fem ? "#a69e91" : "#354135";
      const pantsL = fem ? "#4b525c" : "#4d535c";
      const pantsD = fem ? "#3a4048" : "#3b4047";

      /* А. Торс (cy = 0..168) */
      softVBand(ctx, 0, 0, W, 168, topL, topM, topD);
      shadeTorsoSides(0, 168, 0.20);
      ctx.fillStyle = fem ? "#5a3c2e" : "#2b241c";
      ctx.fillRect(0, 0, W, 7);
      ctx.fillRect(0, 160, W, 6);
      /* Небольшой треугольный ворот-разрез со шнуровкой */
      ctx.fillStyle = pal.skinMid;
      ctx.beginPath();
      ctx.moveTo(W * 0.47, 0);
      ctx.lineTo(W * 0.53, 0);
      ctx.lineTo(W * 0.50, 34);
      ctx.closePath();
      ctx.fill();

      /* Б. Кожаный северный ремень с железной пряжкой (cy = 176..216) */
      softVBand(ctx, 0, 176, W, 40, "#2c2017", "#211710", "#17100b");
      ctx.fillStyle = "#9aa3ad";
      ctx.fillRect(W * 0.5 - 14, 180, 28, 32);
      ctx.fillStyle = "#211710";
      ctx.fillRect(W * 0.5 - 8, 187, 16, 18);

      /* В. Рукав 3/4 с плотным тканевым отворотом (cy = 224..304) */
      softVBand(ctx, 0, 224, W, 80, topL, topM, topD);
      ctx.fillStyle = fem ? "#7a6f62" : "#2f392e";
      ctx.fillRect(0, 292, W, 12);

      /* Г. Запасная полоса (у мирных северян предплечье открыто — чистое базовое тело!) */
      softVBand(ctx, 0, 312, W, 64, topM, topD, topD);

      /* Д. Северные шерстяные штаны (cy = 384..448) */
      softVBand(ctx, 0, 384, W, 64, pantsL, pantsL, pantsD);

      /* Е. Крепкие тёмно-кожаные башмаки (cy = 456..512) */
      softVBand(ctx, 0, 456, W, 56, "#3b2c20", "#2b2017", "#1d150f");
    }
    return cv;
  }

  /* === БОЕВОЕ СНАРЯЖЕНИЕ ("warrior") — СЕВЕР vs ЗЛАТОДВОР === */
  if (isEden) {
    /* РАТНИК ЗЛАТОДВОРА:
       Гербовый сюрко цвета пурпура и слоновой кости с золотым крестом поверх кольчуги,
       отдельные стальные латные наручи с тонким золотым кантом и высокие рыцарские сапоги. */
    /* А. Торс сюрко (cy = 0..168) */
    softVBand(ctx, 0, 0, W, 168, "#7e222e", "#661a24", "#4d121a");
    shadeTorsoSides(0, 168, 0.20);
    /* Светлое гербовое поле на груди и спине */
    softVBand(ctx, W * 0.37, 0, W * 0.26, 168, "#ede4d2", "#dfd3bc", "#cdc0a6");
    softVBand(ctx, 0, 0, W * 0.11, 168, "#e6dcc8", "#d6cab2", "#c4b79e");
    softVBand(ctx, W * 0.89, 0, W * 0.11, 168, "#e6dcc8", "#d6cab2", "#c4b79e");
    /* Золотой крест Златодвора на груди */
    ctx.fillStyle = "#cfa544";
    ctx.fillRect(W * 0.5 - 9, 10, 18, 154);
    ctx.fillRect(W * 0.42, 48, W * 0.16, 16);
    /* Кольчужное ожерелье у горловины */
    ctx.fillStyle = "#7a8490";
    ctx.fillRect(0, 0, W, 9);

    /* Б. Рыцарский пояс (cy = 176..216) */
    softVBand(ctx, 0, 176, W, 40, "#342014", "#26170e", "#1a0f09");
    ctx.fillStyle = "#dcb658";
    ctx.fillRect(W * 0.5 - 15, 180, 30, 32);
    ctx.fillStyle = "#26170e";
    ctx.fillRect(W * 0.5 - 8, 187, 16, 18);

    /* В. Кольчужный верхний рукав (cy = 224..304) */
    softVBand(ctx, 0, 224, W, 80, "#757f8c", "#606975", "#4c545e");
    for (let y = 228; y < 302; y += 8) {
      ctx.fillStyle = y % 16 === 0 ? "rgba(235, 244, 255, 0.14)" : "rgba(15, 20, 26, 0.22)";
      ctx.fillRect(0, y, W, 3);
    }

    /* Г. Отдельный стальной наруч (cy = 312..376) — изолированная полоса! */
    softVBand(ctx, 0, 312, W, 64, "#96a1ae", "#737d89", "#555d67");
    ctx.fillStyle = "#d4ad4e";
    ctx.fillRect(0, 312, W, 6);
    ctx.fillRect(0, 370, W, 6);

    /* Д. Тёмные стёганые поножи/шоссы (cy = 384..448) */
    softVBand(ctx, 0, 384, W, 64, "#2d323a", "#252a31", "#1e2228");

    /* Е. Отдельные высокие кожаные сапоги всадника (cy = 456..512) — изолированная полоса! */
    softVBand(ctx, 0, 456, W, 56, "#4d3220", "#3b2618", "#27180f");
    ctx.fillStyle = "#cfa544";
    ctx.fillRect(0, 456, W, 5);
  } else {
    /* ВОИН ХЛАДНЫХ ВЕТРОВ (СЕВЕР):
       Тяжёлая кожано-ламельная бригантина со стальными заклёпками и тёмным меховым оплечьем,
       стёганые хвойные рукава, отдельные толстые кожаные наручи на ремнях и северные сапоги с мехом. */
    /* А. Торс бригантины (cy = 0..168) */
    softVBand(ctx, 0, 0, W, 168, "#63442e", "#4e3523", "#3b2719");
    shadeTorsoSides(0, 168, 0.22);
    /* Меховой воротник сверху */
    ctx.fillStyle = "#33251b";
    ctx.fillRect(0, 0, W, 14);
    /* Полосы кожаных пластин и стальные заклёпки */
    for (let y = 34; y <= 146; y += 28) {
      ctx.fillStyle = "rgba(18, 10, 4, 0.46)";
      ctx.fillRect(0, y, W, 4);
      ctx.fillStyle = "#a3acb6";
      for (let rx = W * 0.35; rx <= W * 0.65; rx += 28) {
        ctx.fillRect(rx - 2, y - 15, 5, 5);
      }
    }

    /* Б. Широкий воинский пояс Севера (cy = 176..216) */
    softVBand(ctx, 0, 176, W, 40, "#241911", "#1b120c", "#120c08");
    ctx.fillStyle = "#9fa8b2";
    ctx.fillRect(W * 0.5 - 15, 180, 30, 32);
    ctx.fillStyle = "#1b120c";
    ctx.fillRect(W * 0.5 - 8, 187, 16, 18);

    /* В. Стёганый поддоспешный рукав (cy = 224..304) */
    softVBand(ctx, 0, 224, W, 80, "#414e40", "#343f33", "#293228");

    /* Г. Отдельный кожаный наруч с тёмными ремнями (cy = 312..376) — изолированная полоса! */
    softVBand(ctx, 0, 312, W, 64, "#5c3d26", "#492f1c", "#382314");
    ctx.fillStyle = "#21130a";
    ctx.fillRect(0, 314, W, 6);
    ctx.fillRect(0, 341, W, 6);
    ctx.fillRect(0, 368, W, 6);

    /* Д. Тёмно-сланцевые утеплённые штаны (cy = 384..448) */
    softVBand(ctx, 0, 384, W, 64, "#3b4149", "#32373e", "#292d33");

    /* Е. Высокие северные сапоги с меховой опушкой сверху (cy = 456..512) — изолированная полоса! */
    softVBand(ctx, 0, 456, W, 56, "#4b321f", "#3a2617", "#26180e");
    ctx.fillStyle = "#2b2017";
    ctx.fillRect(0, 456, W, 8);
  }

  return cv;
}

/* ---------- 5. АТЛАС КАМНЯ, ТЁСАНОГО ДЕРЕВА, СТАЛИ И СНЕГА ДЛЯ КОЛОДЦА (10/10 — НЕ ТРОГАЕМ!) ---------- */
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

/* Конвертация холста в текстуру Three.js.
   По умолчанию для атласов персонажей отключаем mipmaps, чтобы WebGL НИКОГДА
   не смешивал соседние полосы на границах UV (0% размытия краёв!). */
export function canvasToThreeTexture(cv, useMipmaps = false) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  if (!useMipmaps) {
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
  }
  tex.needsUpdate = true;
  return tex;
}
