/* ============================================================================
   CHISELED ACTOR 2.5D — Полигональная гранёная рисовка персонажей и куклы
   строго по художественному эталону владельца (image-49.png):
   - Цельный силуэт из сомкнутых светотеневых многоугольников (никаких 3D-трубок!)
   - Свет слева-сверху, матовая тень справа, 0px чёрной мультяшной обводки
   - Скульптурная голова и борода без глаз-бусинок, алый ворот-шарф, ламельная
     куртка с заклёпками, диагональная портупея, пояс с латунной пряжкой и
     подсумками, складчатый зелёный подол, заломы на штанах, гранёные сапоги,
     клинок с долом и деревянный щит с железной оковкой и умбоном.
   - Полная поддержка 8 изометрических направлений, шага, удара, женской фигуры,
     честного раздевания Kenshi до белья и перевязанных культей при отрубании!
   ============================================================================ */

function poly(ctx, pts, fill) {
  if (!pts || pts.length < 3) { return; }
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.closePath();
  ctx.fill();
}

function quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

/* Сегмент конечности в стиле эталона: плоская двухгранная призма (светлая и теневая половины) без зазоров */
function facetedLimb(ctx, x0, y0, w0, x1, y1, w1, colLight, colDark, splitRatio = 0.52) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  const l0x = x0 - nx * w0 * 0.5;
  const l0y = y0 - ny * w0 * 0.5;
  const r0x = x0 + nx * w0 * 0.5;
  const r0y = y0 + ny * w0 * 0.5;

  const l1x = x1 - nx * w1 * 0.5;
  const l1y = y1 - ny * w1 * 0.5;
  const r1x = x1 + nx * w1 * 0.5;
  const r1y = y1 + ny * w1 * 0.5;

  const m0x = l0x + (r0x - l0x) * splitRatio;
  const m0y = l0y + (r0y - l0y) * splitRatio;
  const m1x = l1x + (r1x - l1x) * splitRatio;
  const m1y = l1y + (r1y - l1y) * splitRatio;

  quad(ctx, l0x, l0y, m0x, m0y, m1x, m1y, l1x, l1y, colLight);
  quad(ctx, m0x, m0y, r0x, r0y, r1x, r1y, m1x, m1y, colDark);
}

function cleanItemKey(raw) {
  if (!raw) { return ""; }
  return String(raw).replace(/^item:/, "");
}

/* Палитра по ролям и предметам в тонах эталона image-49 */
function resolvePalette(spec) {
  const role = spec.roleKey || "player";
  const female = !!(spec.female || spec.sex === "f");
  const armorId = cleanItemKey(spec.armor);
  const headId = cleanItemKey(spec.headGear);
  const handsId = cleanItemKey(spec.handsGear);
  const legsId = cleanItemKey(spec.legsGear);
  const bootsId = cleanItemKey(spec.bootsGear);

  const skinL = female ? "#d4ab84" : "#c79b71";
  const skinD = female ? "#a67d58" : "#966d48";
  const skinDeep = "#63442b";

  let hairL = "#46301e";
  let hairD = "#26190f";
  if (role === "innkeeper") { hairL = "#7c4a2b"; hairD = "#4c2b17"; }
  else if (role === "villager") { hairL = "#6e5338"; hairD = "#43311f"; }
  else if (role === "hunter") { hairL = "#3a2d22"; hairD = "#1f1812"; }
  else if (role === "smith") { hairL = "#2d241e"; hairD = "#17120f"; }

  /* Поддевка / туника / подол (хвойно-зелёный на эталоне, либо по роли) */
  let tunicL = "#465542";
  let tunicD = "#2c3729";
  let scarfL = "#7d2022";
  let scarfD = "#4c1214";

  if (role === "guard") {
    tunicL = "#35495e"; tunicD = "#212e3d";
    scarfL = "#8a2929"; scarfD = "#541818";
  } else if (role === "smith") {
    tunicL = "#4d4239"; tunicD = "#302923";
    scarfL = "#6b3a24"; scarfD = "#422214";
  } else if (role === "hunter") {
    tunicL = "#3d4d38"; tunicD = "#253022";
    scarfL = "#5e462c"; scarfD = "#3b2b1a";
  } else if (role === "villager") {
    tunicL = "#3f5364"; tunicD = "#283642";
    scarfL = "#7a3b36"; scarfD = "#4d2320";
  } else if (role === "innkeeper") {
    tunicL = "#663932"; tunicD = "#42231e";
    scarfL = "#c8b79c"; scarfD = "#8e7e66";
  } else if (role === "robber") {
    tunicL = "#3f3b37"; tunicD = "#262320";
    scarfL = "#632222"; scarfD = "#3b1313";
  }

  return {
    female,
    role,
    armorId,
    headId,
    handsId,
    legsId,
    bootsId,
    skinL,
    skinD,
    skinDeep,
    hairL,
    hairD,
    tunicL,
    tunicD,
    scarfL,
    scarfD,
    leatherL: "#8c5b34",
    leatherD: "#5a381e",
    leatherSeam: "#362010",
    strapL: "#6d4425",
    strapD: "#3d2412",
    belt: "#2a190d",
    buckleL: "#c2a858",
    buckleD: "#8a7436",
    pantsL: legsId === "wool_trousers" ? "#4b5561" : (legsId === "greaves" ? "#464d56" : "#545b65"),
    pantsD: legsId === "wool_trousers" ? "#323942" : (legsId === "greaves" ? "#2e333a" : "#383e46"),
    pantsCrease: "#2c3138",
    bootL: bootsId === "iron_boots" ? "#5d6670" : "#6c4829",
    bootD: bootsId === "iron_boots" ? "#3b424a" : "#422b17",
    steelL: "#bac5d0",
    steelM: "#8894a0",
    steelD: "#56616d",
    mailL: "#7b8692",
    mailD: "#4d5660",
    underL: "#a99c88",
    underD: "#7b705f"
  };
}

/* Перевязанная культя на месте отрубленной конечности */
function drawBandagedStump(ctx, x, y, r) {
  quad(ctx, x - r, y - r * 0.8, x + r, y - r * 0.8, x + r * 0.88, y + r * 0.85, x - r * 0.88, y + r * 0.85, "#cbbba2");
  quad(ctx, x, y - r * 0.8, x + r, y - r * 0.8, x + r * 0.88, y + r * 0.85, x, y + r * 0.85, "#9c8d77");
  poly(ctx, [[x - r * 0.65, y + r * 0.25], [x + r * 0.55, y + r * 0.15], [x + r * 0.45, y + r * 0.82], [x - r * 0.5, y + r * 0.82]], "#7f1d1d");
}

/* Клинок / топор / копьё / дубина в стиле эталона (двухгранное лезвие с долом) */
function drawWeapon25D(ctx, kind, hx, hy, angle, scale = 1) {
  if (!kind || kind === "none") { return; }
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  if (kind === "axe" || kind === "two_handed_axe") {
    const len = kind === "two_handed_axe" ? 74 : 52;
    facetedLimb(ctx, 0, -10, 4.5, 0, len, 4.0, "#754c29", "#472c16");
    /* Гранёное лезвие секиры */
    poly(ctx, [[0, len - 18], [18, len - 26], [22, len - 6], [16, len + 8], [0, len - 2]], "#b8c4d0");
    poly(ctx, [[0, len - 10], [16, len - 8], [16, len + 8], [0, len - 2]], "#687480");
  } else if (kind === "spear") {
    facetedLimb(ctx, 0, -26, 4.2, 0, 78, 3.8, "#78502d", "#4a2f18");
    poly(ctx, [[0, 76], [-5.5, 82], [0, 102], [0, 76]], "#c6d2de");
    poly(ctx, [[0, 76], [5.5, 82], [0, 102], [0, 76]], "#64707c");
  } else if (kind === "club" || kind === "mace") {
    facetedLimb(ctx, 0, -8, 4.2, 0, 46, 7.5, "#6e4726", "#422914");
    if (kind === "mace") {
      quad(ctx, -6, 36, 0, 34, 0, 50, -6, 48, "#9aa6b2");
      quad(ctx, 0, 34, 6, 36, 6, 48, 0, 50, "#596470");
    }
  } else if (kind === "bow" || kind === "crossbow") {
    ctx.strokeStyle = "#6e4726";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(-6, 18, 28, -1.05, 1.05);
    ctx.stroke();
    ctx.strokeStyle = "#cbd3dc";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-6 + Math.cos(-1.05) * 28, 18 + Math.sin(-1.05) * 28);
    ctx.lineTo(-6 + Math.cos(1.05) * 28, 18 + Math.sin(1.05) * 28);
    ctx.stroke();
  } else {
    /* Меч / полуторный меч / нож — ТОЧНО как на эталоне image-49! */
    const bladeLen = kind === "knife" ? 30 : (kind === "greatsword" ? 78 : 58);
    const guardW = kind === "knife" ? 9 : 15;
    /* Рукоять и гранёное яблоко-навершие */
    facetedLimb(ctx, 0, -14, 4.4, 0, 0, 4.8, "#59371c", "#331e0e");
    poly(ctx, [[-4, -18], [0, -20], [4, -18], [3, -13], [-3, -13]], "#cfd8e2");
    poly(ctx, [[0, -20], [4, -18], [3, -13], [0, -13]], "#727e8a");
    /* Стальная крестовина */
    quad(ctx, -guardW, -2.5, 0, -3.2, 0, 2.2, -guardW, 1.5, "#cfd8e2");
    quad(ctx, 0, -3.2, guardW, -2.5, guardW, 1.5, 0, 2.2, "#76828e");
    /* Двухгранный клинок с центральным ребром и ласточкиным скосом острия */
    poly(ctx, [[-4.5, 2], [0, 2], [0, bladeLen + 4], [-3.8, bladeLen - 3]], "#b9c5d1");
    poly(ctx, [[0, 2], [4.5, 2], [3.8, bladeLen - 3], [0, bladeLen + 4]], "#596572");
  }

  ctx.restore();
}

/* Щит эталона image-49: гранёный утюговый деревянный щит с косой сшивкой, стальной кромкой и умбоном */
function drawHeaterShield25D(ctx, cx, cy, scale = 1, kind = "heater_shield") {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  if (kind === "buckler") {
    poly(ctx, [[-14, -10], [0, -16], [14, -10], [16, 4], [0, 16], [-16, 4]], "#8d99a6");
    poly(ctx, [[0, -16], [14, -10], [16, 4], [0, 16]], "#58636e");
    poly(ctx, [[-5, -4], [0, -7], [5, -4], [5, 3], [0, 6], [-5, 3]], "#dce4ec");
    ctx.restore();
    return;
  }

  /* Стальная оковка по внешнему контуру */
  const outer = [[-19, -25], [19, -20], [18, 8], [0, 31], [-18, 10]];
  poly(ctx, outer, "#9ba7b3");
  poly(ctx, [[0, -22.5], [19, -20], [18, 8], [0, 31]], "#697480");

  /* Деревянное поле щита из вертикальных досок */
  poly(ctx, [[-15, -21], [-5, -19.7], [-5, 16], [-14.5, 7]], "#774d29");
  poly(ctx, [[-5, -19.7], [5, -18.4], [5, 20], [-5, 24], [-5, 16]], "#643f20");
  poly(ctx, [[5, -18.4], [15, -17], [14.2, 6], [5, 20]], "#4d2f17");

  /* Диагональная кожаная/деревянная стяжка на поле щита (деталь с эталона!) */
  poly(ctx, [[-14, 6], [12, -14], [14, -10], [-13, 10]], "#8f6238");

  /* Тёмные щели между досками */
  ctx.fillStyle = "#2b190b";
  ctx.fillRect(-5.6, -19.5, 1.2, 41);
  ctx.fillRect(4.4, -18.2, 1.2, 38);

  /* Шестигранный гранёный стальной умбон в центре */
  poly(ctx, [[-7, -2], [-2, -8], [5, -6], [0, 1], [-5, 5]], "#dce5ee");
  poly(ctx, [[5, -6], [8, 1], [3, 8], [-5, 5], [0, 1]], "#7c8894");

  ctx.restore();
}

/* Главная функция полигональной отрисовки человека в локальных координатах (стопы в (0, 0), рост ~196 ед.) */
export function drawChiseledPerson(ctx, spec = {}) {
  const pal = resolvePalette(spec);
  const sev = spec.severed || {};
  const bareTorso = spec.bareTorso !== undefined ? !!spec.bareTorso : !pal.armorId;
  const bareLegs = spec.bareLegs !== undefined ? !!spec.bareLegs : !pal.legsId;
  const bareFeet = spec.bareFeet !== undefined ? !!spec.bareFeet : !pal.bootsId;

  /* Определяем ракурс из yaw или facing: зеркалирование влево/вправо и вид со спины */
  let yaw = typeof spec.yaw === "number" ? spec.yaw : 0.45;
  while (yaw > Math.PI) { yaw -= Math.PI * 2; }
  while (yaw < -Math.PI) { yaw += Math.PI * 2; }

  /* На эталоне воин слегка развёрнут вправо-к-камере; при движении влево зеркалим по X */
  const flipX = (spec.facing === "NW" || spec.facing === "SW") || (spec.facing === undefined && yaw < -0.25);
  const isBack = Math.abs(yaw) > 2.15 && !spec.paperdoll;

  const walkPhase = spec.pose === "walk" ? (spec.walkPhase || 0) : 0;
  const stride = Math.sin(walkPhase) * 9.5;
  const liftL = Math.max(0, -Math.cos(walkPhase)) * 5.5;
  const liftR = Math.max(0, Math.cos(walkPhase)) * 5.5;
  const bob = Math.abs(Math.sin(walkPhase)) * 2.4;

  const isDown = !!(spec.down || spec.dead);

  ctx.save();

  /* Плотная мягкая эллиптическая тень на снегу под ногами (без чёрной обводки!) */
  if (!spec.noGroundShadow) {
    const shGrad = ctx.createRadialGradient(0, 0, 3, 0, 0, isDown ? 44 : 26);
    shGrad.addColorStop(0, "rgba(8, 12, 18, 0.58)");
    shGrad.addColorStop(0.6, "rgba(10, 16, 24, 0.26)");
    shGrad.addColorStop(1, "rgba(10, 16, 24, 0)");
    ctx.fillStyle = shGrad;
    ctx.beginPath();
    ctx.ellipse(0, 2, isDown ? 46 : 26, isDown ? 15 : 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (isDown) {
    ctx.translate(0, -8);
    ctx.rotate(spec.dead ? 1.48 : 1.32);
    ctx.translate(0, 92);
  }

  if (flipX) {
    ctx.scale(-1, 1);
  }

  const fem = pal.female;
  const shoulderW = fem ? 20.5 : (pal.role === "smith" ? 27.5 : 24.5);
  const waistW = fem ? 13.0 : 15.8;
  const hipW = fem ? 18.2 : 16.8;
  const torsoTopY = -144 + bob;
  const waistY = -92 + bob;
  const hipY = -80 + bob;

  /* 0. ЗАПАСНОЕ ОРУЖИЕ ЗА СПИНОЙ (2-й комплект оружия в ножнах) */
  const holstered = cleanItemKey(spec.holsteredWeapon);
  if (holstered && holstered !== "none") {
    drawWeapon25D(ctx, holstered, -8, torsoTopY - 8, 2.55, 0.92);
  }

  /* 1. НОГИ, ЗАЛОМЫ НА ШТАНАХ, НАКОЛЕННИКИ И ВЫСОКИЕ ГРАНЁНЫЕ САПОГИ */
  function renderLeg(isLeft) {
    const sign = isLeft ? -1 : 1;
    const baseX = sign * (fem ? 8.2 : 9.2);
    const stepX = isLeft ? -stride * 0.45 : stride * 0.45;
    const stepLift = isLeft ? liftL : liftR;
    const hx = baseX;
    const hy = hipY;
    const kx = baseX + stepX * 0.55 + sign * 0.6;
    const ky = -46 + bob - stepLift * 0.5;
    const fx = baseX + stepX + sign * 1.2;
    const fy = -4 - stepLift;

    const limbKey = isLeft ? "left_leg" : "right_leg";
    const isSevered = !!sev[limbKey];

    /* Бедро */
    const thighL = bareLegs ? pal.skinL : pal.pantsL;
    const thighD = bareLegs ? pal.skinD : pal.pantsD;
    facetedLimb(ctx, hx, hy, fem ? 13.2 : 13.8, kx, ky, 10.6, thighL, thighD, 0.54);

    /* Диагональные заломы-складки на штанах (фирменный штрих с эталона image-49!) */
    if (!bareLegs) {
      poly(ctx, [
        [hx - 4, hy + 12], [hx + 3, hy + 18], [hx + 2, hy + 21], [hx - 5, hy + 15]
      ], pal.pantsCrease);
      poly(ctx, [
        [hx - 3, hy + 22], [hx + 4, hy + 27], [hx + 3, hy + 30], [hx - 4, hy + 25]
      ], pal.pantsCrease);
    }

    if (isSevered) {
      drawBandagedStump(ctx, kx, ky + 2, 6.2);
      return;
    }

    /* Наколенник (если надет доспех/поножи или кожаный комплект) */
    if (!bareLegs && (pal.armorId && pal.armorId !== "linen_shirt" || pal.legsId === "greaves")) {
      const knL = pal.legsId === "greaves" ? pal.steelL : "#a37244";
      const knD = pal.legsId === "greaves" ? pal.steelD : "#664425";
      quad(ctx, kx - 5.8, ky - 5, kx, ky - 6, kx, ky + 5, kx - 5.5, ky + 4, knL);
      quad(ctx, kx, ky - 6, kx + 5.8, ky - 5, kx + 5.5, ky + 4, kx, ky + 5, knD);
      ctx.fillStyle = pal.belt;
      ctx.fillRect(kx - 5.8, ky - 1.2, 11.6, 2.2);
    }

    /* Голень и сапог */
    if (bareFeet) {
      facetedLimb(ctx, kx, ky + 2, 9.8, fx, fy - 3, 7.2, pal.skinL, pal.skinD, 0.52);
      poly(ctx, [[fx - 5, fy - 4], [fx + 6, fy - 4], [fx + 9 * (isLeft ? -0.3 : 1), fy + 2], [fx - 5, fy + 2]], pal.skinD);
    } else {
      facetedLimb(ctx, kx, ky + 3, 11.0, fx, fy - 5, 8.8, pal.bootL, pal.bootD, 0.52);
      /* Верхний ремешок-отворот сапога под коленом */
      quad(ctx, kx - 6.0, ky + 4, kx + 6.0, ky + 4, kx + 5.8, ky + 8, kx - 5.8, ky + 8, pal.belt);
      /* Гранёная ступня с каблуком и острым носком */
      if (isLeft) {
        poly(ctx, [[fx - 5, fy - 6], [fx + 4.5, fy - 6], [fx + 4.5, fy + 2], [fx - 10, fy + 2], [fx - 11, fy - 1]], pal.bootL);
        poly(ctx, [[fx, fy - 6], [fx + 4.5, fy - 6], [fx + 4.5, fy + 2], [fx, fy + 2]], pal.bootD);
      } else {
        poly(ctx, [[fx - 4.5, fy - 6], [fx + 5, fy - 6], [fx + 12, fy - 1], [fx + 11, fy + 2], [fx - 4.5, fy + 2]], pal.bootL);
        poly(ctx, [[fx - 1, fy - 6], [fx + 5, fy - 6], [fx + 12, fy - 1], [fx + 11, fy + 2], [fx - 1, fy + 2]], pal.bootD);
      }
    }
  }

  renderLeg(true);
  renderLeg(false);

  /* 2. ТАЗ / ИСПОДНЕЕ ИЛИ СКЛАДЧАТЫЙ ПОДОЛ ТУНИКИ (как на эталоне image-49) */
  const isNpcSkirt = fem && !spec.isPlayer && (pal.role === "villager" || pal.role === "innkeeper") && !bareLegs;

  if (bareLegs && bareTorso) {
    /* Честный режим Kenshi: снята вся одежда — простая льняная набедренная повязка / исподнее */
    poly(ctx, [[-hipW, waistY], [0, waistY + 1], [0, hipY + 9], [-hipW * 0.85, hipY + 6]], pal.underL);
    poly(ctx, [[0, waistY + 1], [hipW, waistY], [hipW * 0.85, hipY + 6], [0, hipY + 9]], pal.underD);
    if (fem) {
      /* Простая льняная грудная перевязь для женской фигуры без брони */
      quad(ctx, -shoulderW * 0.72, torsoTopY + 18, 0, torsoTopY + 19, 0, torsoTopY + 34, -waistW * 0.88, torsoTopY + 33, pal.underL);
      quad(ctx, 0, torsoTopY + 19, shoulderW * 0.72, torsoTopY + 18, waistW * 0.88, torsoTopY + 33, 0, torsoTopY + 34, pal.underD);
    }
  } else if (isNpcSkirt) {
    /* Длинная северная шерстяная юбка с передником у жительниц Студёного Брода */
    poly(ctx, [[-waistW, waistY], [0, waistY], [0, -18 + bob], [-hipW * 1.28, -20 + bob]], pal.tunicL);
    poly(ctx, [[0, waistY], [waistW, waistY], [hipW * 1.28, -20 + bob], [0, -18 + bob]], pal.tunicD);
    if (pal.role === "innkeeper") {
      poly(ctx, [[-9, waistY + 2], [9, waistY + 2], [11, -26 + bob], [-11, -26 + bob]], "#cfc2ab");
      poly(ctx, [[0, waistY + 2], [9, waistY + 2], [11, -26 + bob], [0, -26 + bob]], "#a89a82");
    }
  } else if (!bareTorso) {
    /* Хвойно-зелёный складчатый подол туники с разрезом по центру (1-в-1 с image-49!) */
    const skirtBottomY = hipY + 15;
    poly(ctx, [[-waistW - 1, waistY], [-2, waistY], [-3.5, skirtBottomY], [-hipW - 2.5, skirtBottomY - 1]], pal.tunicL);
    poly(ctx, [[2, waistY], [waistW + 1, waistY], [hipW + 2.5, skirtBottomY - 1], [3.5, skirtBottomY]], pal.tunicD);
    /* Вертикальные теневые грани складок подола */
    ctx.fillStyle = "#1f271d";
    ctx.fillRect(-13, waistY + 2, 1.5, 23);
    ctx.fillRect(-8, waistY + 2, 1.5, 24);
    ctx.fillRect(7, waistY + 2, 1.5, 24);
    ctx.fillRect(12, waistY + 2, 1.5, 23);
  }

  /* 3. ТОРС (обнажённый / посконная рубаха / стёганка / ламельная броня эталона / кольчуга) */
  if (bareTorso) {
    /* Гранёный анатомический торс со светотеневыми плоскостями груди и пресса */
    poly(ctx, [[-shoulderW * 0.92, torsoTopY], [0, torsoTopY], [0, waistY + 2], [-waistW, waistY]], pal.skinL);
    poly(ctx, [[0, torsoTopY], [shoulderW * 0.92, torsoTopY], [waistW, waistY], [0, waistY + 2]], pal.skinD);
    if (fem) {
      quad(ctx, -shoulderW * 0.72, torsoTopY + 17, 0, torsoTopY + 18, 0, torsoTopY + 34, -waistW * 0.88, torsoTopY + 33, pal.underL);
      quad(ctx, 0, torsoTopY + 18, shoulderW * 0.72, torsoTopY + 17, waistW * 0.88, torsoTopY + 33, 0, torsoTopY + 34, pal.underD);
    } else {
      /* Гранёная подсечка грудных мышц и ключиц у мужского торса */
      poly(ctx, [[-shoulderW * 0.76, torsoTopY + 18], [-1.5, torsoTopY + 19], [-2, torsoTopY + 22], [-shoulderW * 0.72, torsoTopY + 20.5]], pal.skinD);
      poly(ctx, [[1.5, torsoTopY + 19], [shoulderW * 0.76, torsoTopY + 18], [shoulderW * 0.72, torsoTopY + 20.5], [2, torsoTopY + 22]], pal.skinDeep);
    }
  } else if (pal.armorId === "chainmail") {
    /* Северная стальная кольчуга с кожаной оторочкой и ремнями */
    poly(ctx, [[-shoulderW, torsoTopY], [0, torsoTopY], [0, waistY + 2], [-waistW - 1, waistY]], pal.mailL);
    poly(ctx, [[0, torsoTopY], [shoulderW, torsoTopY], [waistW + 1, waistY], [0, waistY + 2]], pal.mailD);
    ctx.fillStyle = "rgba(22, 28, 36, 0.32)";
    for (let ry = torsoTopY + 8; ry < waistY - 2; ry += 7) {
      ctx.fillRect(-shoulderW * 0.82, ry, shoulderW * 1.64, 1.6);
    }
  } else if (pal.armorId === "linen_shirt" && !spec.forceBrigandine) {
    /* Добротная северная рубаха / куртка жителя с вертикальными складками и ремнём */
    const shL = spec.isPlayer ? "#7f7768" : pal.tunicL;
    const shD = spec.isPlayer ? "#575145" : pal.tunicD;
    poly(ctx, [[-shoulderW * 0.96, torsoTopY], [0, torsoTopY], [0, waistY + 2], [-waistW, waistY]], shL);
    poly(ctx, [[0, torsoTopY], [shoulderW * 0.96, torsoTopY], [waistW, waistY], [0, waistY + 2]], shD);
    /* Ворот со шнуровкой */
    poly(ctx, [[-6, torsoTopY], [6, torsoTopY], [2, torsoTopY + 15], [-2, torsoTopY + 15]], "#2b241d");
  } else {
    /* ФИРМЕННАЯ ЛАМЕЛЬНАЯ / ПЛАСТИНЧАТАЯ КОЖАНАЯ БРОНЯ ЭТАЛОНА image-49!
       Горизонтальные сегменты с подсечкой тени и квадратными стальными заклёпками */
    const bands = 6;
    const bandH = (waistY - torsoTopY) / bands;
    for (let b = 0; b < bands; b++) {
      const y0 = torsoTopY + b * bandH;
      const y1 = y0 + bandH;
      const t0 = b / bands;
      const t1 = (b + 1) / bands;
      const w0 = shoulderW * (1 - t0) + (waistW + 1.5) * t0;
      const w1 = shoulderW * (1 - t1) + (waistW + 1.5) * t1;

      quad(ctx, -w0, y0, 0, y0, 0, y1, -w1, y1, pal.leatherL);
      quad(ctx, 0, y0, w0, y0, w1, y1, 0, y1, pal.leatherD);
      /* Тёмная подсечка под каждой кожаной полосой */
      quad(ctx, -w1, y1 - 1.6, w1, y1 - 1.6, w1, y1, -w1, y1, pal.leatherSeam);

      /* Ряд квадратных стальных заклёпок */
      if (b >= 1 && b <= 4) {
        const ry = y0 + bandH * 0.42;
        ctx.fillStyle = pal.steelL;
        ctx.fillRect(-w0 * 0.68, ry, 2.5, 2.5);
        ctx.fillRect(-w0 * 0.25, ry, 2.5, 2.5);
        ctx.fillStyle = pal.steelM;
        ctx.fillRect(w0 * 0.20, ry, 2.5, 2.5);
        ctx.fillRect(w0 * 0.62, ry, 2.5, 2.5);
      }
    }
  }

  /* Подчёркивание женского силуэта груди аккуратной светотеневой гранью */
  if (fem && !bareTorso) {
    poly(ctx, [[-12, torsoTopY + 23], [-2, torsoTopY + 25], [-3, torsoTopY + 29], [-11, torsoTopY + 27]], "rgba(0,0,0,0.22)");
    poly(ctx, [[2, torsoTopY + 25], [12, torsoTopY + 23], [11, torsoTopY + 27], [3, torsoTopY + 29]], "rgba(0,0,0,0.28)");
  }

  /* Диагональная плечевая портупея и пояс с пряжкой и подсумками (если не раздет) */
  if (!bareTorso) {
    if (!isBack) {
      poly(ctx, [
        [-shoulderW * 0.56, torsoTopY + 2],
        [-shoulderW * 0.34, torsoTopY + 2],
        [waistW * 0.68, waistY],
        [waistW * 0.42, waistY]
      ], pal.strapD);
      poly(ctx, [
        [-shoulderW * 0.56, torsoTopY + 2],
        [-shoulderW * 0.46, torsoTopY + 2],
        [waistW * 0.52, waistY],
        [waistW * 0.42, waistY]
      ], pal.strapL);
    }

    /* Кожаный ремень и прямоугольная латунная пряжка (1-в-1 с эталона!) */
    quad(ctx, -waistW - 2, waistY - 3, waistW + 2, waistY - 3, waistW + 2, waistY + 4, -waistW - 2, waistY + 4, pal.belt);
    if (!isBack) {
      /* Два поясных подсумка по бокам с клапанами и заклёпкой */
      quad(ctx, -waistW - 0.5, waistY + 3, -4.5, waistY + 3, -5, waistY + 18, -waistW + 0.5, waistY + 18, pal.leatherL);
      quad(ctx, -waistW - 0.5, waistY + 15, -5, waistY + 15, -5, waistY + 18, -waistW + 0.5, waistY + 18, pal.leatherSeam);
      ctx.fillStyle = pal.steelM;
      ctx.fillRect(-waistW + 2.5, waistY + 5, 2, 2);

      quad(ctx, 4.5, waistY + 3, waistW + 0.5, waistY + 3, waistW - 0.5, waistY + 18, 5, waistY + 18, pal.leatherD);
      quad(ctx, 5, waistY + 15, waistW - 0.5, waistY + 15, waistW - 0.5, waistY + 18, 5, waistY + 18, pal.leatherSeam);
      ctx.fillStyle = pal.steelD;
      ctx.fillRect(waistW - 5, waistY + 5, 2, 2);

      /* Латунная пряжка по центру */
      quad(ctx, -5, waistY - 4.5, 5, waistY - 4.5, 5, waistY + 5.5, -5, waistY + 5.5, pal.buckleL);
      quad(ctx, 0, waistY - 4.5, 5, waistY - 4.5, 5, waistY + 5.5, 0, waistY + 5.5, pal.buckleD);
      quad(ctx, -2.4, waistY - 2, 2.4, waistY - 2, 2.4, waistY + 3, -2.4, waistY + 3, pal.belt);
    }

    /* Алый / тёмно-багровый шейный платок-горжет поверх ворота (эталон image-49!) */
    poly(ctx, [[-11, torsoTopY - 4], [0, torsoTopY - 2], [0, torsoTopY + 8], [-13, torsoTopY + 3]], pal.scarfL);
    poly(ctx, [[0, torsoTopY - 2], [11, torsoTopY - 4], [13, torsoTopY + 3], [0, torsoTopY + 8]], pal.scarfD);
  }

  /* 4. ПЛЕЧИ, РУКИ, НАРУЧИ, ОРУЖИЕ И ЩИТ */
  const swingProg = spec.pose === "attack" ? Math.sin((spec.attackProgress || 0.5) * Math.PI) : 0;
  const isBlock = spec.pose === "block";
  const armSwing = Math.sin(walkPhase) * 6;

  /* ПРАВАЯ РУКА С ОРУЖИЕМ (слева на экране при взгляде спереди, как на эталоне!) */
  {
    const shX = -shoulderW + 1;
    const shY = torsoTopY + 6;
    const elbX = shX - 6 - swingProg * 4;
    const elbY = shY + 24 - swingProg * 14 + armSwing * 0.4;
    const handX = elbX + 4 + swingProg * 10;
    const handY = elbY + 22 - swingProg * 18;

    /* Рукав туники или кожа руки */
    facetedLimb(ctx, shX, shY, 10.5, elbX, elbY, 8.8, bareTorso ? pal.skinL : pal.tunicL, bareTorso ? pal.skinD : pal.tunicD, 0.55);

    /* Наплечник (если есть броня кроме рубахи) */
    if (!bareTorso && pal.armorId !== "linen_shirt") {
      const pL = pal.armorId === "chainmail" ? pal.steelL : pal.leatherL;
      const pD = pal.armorId === "chainmail" ? pal.steelD : pal.leatherD;
      poly(ctx, [[shX - 8, shY - 7], [shX + 7, shY - 8], [shX + 6, shY + 9], [shX - 10, shY + 8]], pL);
      poly(ctx, [[shX + 1, shY - 8], [shX + 7, shY - 8], [shX + 6, shY + 9], [shX + 1, shY + 8.5]], pD);
      ctx.fillStyle = pal.steelL;
      ctx.fillRect(shX - 2.5, shY + 1, 3, 3);
    }

    if (sev.right_arm) {
      drawBandagedStump(ctx, elbX, elbY + 2, 5.5);
    } else {
      /* Предплечье с кожаным наручем и косыми ремнями */
      const brL = bareTorso && !pal.handsId ? pal.skinL : (pal.handsId === "splint_bracers" ? pal.steelM : pal.leatherL);
      const brD = bareTorso && !pal.handsId ? pal.skinD : (pal.handsId === "splint_bracers" ? pal.steelD : pal.leatherD);
      facetedLimb(ctx, elbX, elbY, 8.8, handX, handY, 6.8, brL, brD, 0.55);
      if (!bareTorso || pal.handsId) {
        poly(ctx, [[elbX - 4, elbY + 6], [elbX + 4, elbY + 9], [elbX + 3.5, elbY + 11], [elbX - 4.2, elbY + 8]], pal.belt);
        poly(ctx, [[elbX - 3.5, elbY + 13], [elbX + 4, elbY + 16], [elbX + 3.5, elbY + 18], [elbX - 3.8, elbY + 15]], pal.belt);
      }
      /* Перчатка / кулак */
      quad(ctx, handX - 4, handY - 2, handX + 4, handY - 2, handX + 3.5, handY + 5, handX - 3.5, handY + 5, pal.leatherD);

      /* Оружие в правой руке (наклон клинка вниз-влево, как на эталоне image-49!) */
      const wepKind = cleanItemKey(spec.weapon);
      const wepAngle = swingProg > 0.05 ? (0.55 - swingProg * 1.65) : (spec.ready ? 0.42 : 0.56);
      drawWeapon25D(ctx, wepKind, handX, handY + 2, wepAngle, 1.0);
    }
  }

  /* ЛЕВАЯ РУКА И ЩИТ (справа на экране при взгляде спереди, как на эталоне!) */
  {
    const shX = shoulderW - 1;
    const shY = torsoTopY + 6;
    const elbX = shX + 5;
    const elbY = shY + 23 - (isBlock ? 7 : 0) - armSwing * 0.4;
    const handX = elbX - 3 - (isBlock ? 5 : 0);
    const handY = elbY + 20 - (isBlock ? 6 : 0);

    facetedLimb(ctx, shX, shY, 10.5, elbX, elbY, 8.8, bareTorso ? pal.skinL : pal.tunicL, bareTorso ? pal.skinD : pal.tunicD, 0.42);

    if (!bareTorso && pal.armorId !== "linen_shirt") {
      const pL = pal.armorId === "chainmail" ? pal.steelM : pal.leatherL;
      const pD = pal.armorId === "chainmail" ? pal.steelD : pal.leatherD;
      poly(ctx, [[shX - 6, shY - 8], [shX + 8, shY - 7], [shX + 10, shY + 8], [shX - 5, shY + 9]], pD);
      poly(ctx, [[shX - 6, shY - 8], [shX + 2, shY - 7.5], [shX + 2, shY + 2], [shX - 6, shY + 2]], pL);
    }

    if (sev.left_arm) {
      drawBandagedStump(ctx, elbX, elbY + 2, 5.5);
    } else {
      const brL = bareTorso && !pal.handsId ? pal.skinL : pal.leatherL;
      const brD = bareTorso && !pal.handsId ? pal.skinD : pal.leatherD;
      facetedLimb(ctx, elbX, elbY, 8.6, handX, handY, 6.6, brL, brD, 0.45);
      quad(ctx, handX - 3.5, handY - 2, handX + 3.5, handY - 2, handX + 3, handY + 5, handX - 3, handY + 5, pal.leatherD);

      const shieldKind = cleanItemKey(spec.shield || spec.offhand);
      if (shieldKind === "heater_shield" || shieldKind === "buckler" || shieldKind === "shield") {
        drawHeaterShield25D(ctx, handX - 3, elbY + 6, 1.0, shieldKind === "buckler" ? "buckler" : "heater_shield");
      }
    }
  }

  /* 5. ШЕЯ, СКУЛЬПТУРНАЯ ГОЛОВА, БОРОДА / ЖЕНСКАЯ КОСА И ШЛЕМ (1-в-1 с эталона image-49!) */
  const neckTopY = torsoTopY - 12;
  quad(ctx, -5.5, neckTopY, 0, neckTopY, 0, torsoTopY + 1, -6.5, torsoTopY + 1, pal.skinL);
  quad(ctx, 0, neckTopY, 5.5, neckTopY, 6.5, torsoTopY + 1, 0, torsoTopY + 1, pal.skinD);

  const headCY = neckTopY - 14;

  if (isBack) {
    /* Вид со спины — конический купол шлема с бармицей или гранёный затылок шевелюры */
    if (pal.headId === "iron_helm") {
      poly(ctx, [[-12, headCY + 4], [12, headCY + 4], [13, headCY + 13], [-13, headCY + 13]], pal.mailD);
      poly(ctx, [[-13, headCY - 4], [0, headCY - 19], [0, headCY + 4], [-12.5, headCY + 4]], pal.steelL);
      poly(ctx, [[0, headCY - 19], [13, headCY - 4], [12.5, headCY + 4], [0, headCY + 4]], pal.steelD);
      quad(ctx, -13.5, headCY - 5, 13.5, headCY - 5, 13.5, headCY - 2, -13.5, headCY - 2, pal.steelM);
    } else {
      poly(ctx, [[-12, headCY - 9], [0, headCY - 16], [12, headCY - 9], [12, headCY + 9], [0, headCY + 13], [-12, headCY + 9]], pal.hairL);
      poly(ctx, [[0, headCY - 16], [12, headCY - 9], [12, headCY + 9], [0, headCY + 13]], pal.hairD);
      if (fem) {
        facetedLimb(ctx, 0, headCY + 6, 6.5, 0, headCY + 36, 3.2, pal.hairL, pal.hairD);
      }
    }
  } else {
    /* Череп и шапка волос сзади/сверху */
    poly(ctx, [[-12.5, headCY - 8], [-4, headCY - 16], [6, headCY - 15], [13.5, headCY - 7], [13, headCY + 8], [-12, headCY + 6]], pal.hairD);
    poly(ctx, [[-12.5, headCY - 8], [-4, headCY - 16], [1, headCY - 15.5], [0, headCY - 7], [-12, headCY + 4]], pal.hairL);

    /* Лоб и скулы (две чёткие рубленные грани без мультяшных глаз!) */
    quad(ctx, -9.5, headCY - 8.5, -0.5, headCY - 8.5, -0.5, headCY + 8, -9.0, headCY + 7, pal.skinL);
    quad(ctx, -0.5, headCY - 8.5, 8.5, headCY - 8.5, 8.0, headCY + 7, -0.5, headCY + 8, pal.skinD);

    /* Глубокие горизонтальные теневые ниши под надбровьем (как на эталоне!) */
    quad(ctx, -9.2, headCY - 2.8, -1.8, headCY - 2.4, -1.8, headCY + 0.6, -9.0, headCY + 0.3, pal.skinDeep);
    quad(ctx, 0.8, headCY - 2.4, 8.2, headCY - 2.8, 8.0, headCY + 0.3, 0.8, headCY + 0.6, "#4d331e");

    /* Трёхгранный прямой нос по центру */
    poly(ctx, [[-2.0, headCY - 2.5], [-0.3, headCY - 2.5], [-0.3, headCY + 4.5], [-2.6, headCY + 4.2]], "#d8ae84");
    poly(ctx, [[-0.3, headCY - 2.5], [1.6, headCY - 2.2], [2.0, headCY + 4.2], [-0.3, headCY + 4.5]], "#855e3c");

    /* Боковое ухо в полутени */
    quad(ctx, 8.5, headCY - 1.5, 11.2, headCY - 1, 10.8, headCY + 4.5, 8.2, headCY + 4.5, pal.skinD);

    if (fem) {
      /* Аккуратный женский подбородок и коса через плечо / платок */
      poly(ctx, [[-9.0, headCY + 6.5], [-0.5, headCY + 7], [-0.5, headCY + 13.5], [-5.5, headCY + 11.5]], pal.skinL);
      poly(ctx, [[-0.5, headCY + 7], [8.0, headCY + 6.5], [5.0, headCY + 11.5], [-0.5, headCY + 13.5]], pal.skinD);
      /* Губы мягким тёплым полутоном */
      ctx.fillStyle = "#9c6854";
      ctx.fillRect(-3.0, headCY + 7.5, 5.2, 1.8);
      /* Длинная гранёная коса через плечо */
      facetedLimb(ctx, 9.5, headCY + 5, 5.6, 12.5, headCY + 34, 3.0, pal.hairL, pal.hairD);
      if (pal.role === "innkeeper" && !pal.headId) {
        poly(ctx, [[-12.5, headCY - 8], [0, headCY - 16.5], [13, headCY - 8], [11, headCY - 3], [-11, headCY - 3]], "#d9ccb4");
      }
    } else {
      /* Гранёная мужская борода и усы клином — ТОЧНО с эталона image-49! */
      poly(ctx, [[-9.5, headCY + 4.5], [-0.5, headCY + 5.2], [-0.5, headCY + 15.5], [-8.5, headCY + 10.5]], pal.hairL);
      poly(ctx, [[-0.5, headCY + 5.2], [8.8, headCY + 4.5], [8.0, headCY + 10.5], [-0.5, headCY + 15.5]], pal.hairD);
      /* Тёплый штрих нижней губы в прорези усов */
      ctx.fillStyle = "#9d724e";
      ctx.fillRect(-2.6, headCY + 6.6, 4.4, 1.8);
    }

    /* Головной убор / шлем поверх головы */
    if (pal.headId === "iron_helm") {
      /* Северный конический шлем с наносником */
      poly(ctx, [[-13, headCY - 5], [0, headCY - 19], [0, headCY - 4]], pal.steelL);
      poly(ctx, [[0, headCY - 19], [13, headCY - 5], [0, headCY - 4]], pal.steelD);
      quad(ctx, -13.5, headCY - 6, 13.5, headCY - 6, 13.5, headCY - 3, -13.5, headCY - 3, pal.steelM);
      /* Наносник */
      quad(ctx, -1.6, headCY - 5, 1.4, headCY - 5, 1.2, headCY + 4.5, -1.4, headCY + 4.5, pal.steelL);
    } else if (pal.headId === "fur_cap" || pal.headId === "padded_coif") {
      poly(ctx, [[-13, headCY - 5], [0, headCY - 17], [13, headCY - 5], [12, headCY - 2], [-12, headCY - 2]], "#6d5038");
      quad(ctx, -13.5, headCY - 6.5, 13.5, headCY - 6.5, 13, headCY - 2, -13, headCY - 2, "#3f2c1d");
    }
  }

  /* Ярко-белый гранёный росчерк клинка в момент удара */
  if (swingProg > 0.18) {
    ctx.strokeStyle = "rgba(226, 238, 250, " + (swingProg * 0.72).toFixed(2) + ")";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(-10, torsoTopY + 26, 46, 0.3, 2.2);
    ctx.stroke();
  }

  ctx.restore();
}

/* Кэш отрендеренных HiDPI-спрайтов персонажей (мгновенные 60–120 FPS без перерисовки полигонов каждый кадр!) */
const actorSpriteCache = new Map();

export function getCachedActorCanvas(spec = {}, dpr = 2) {
  const quantWalk = spec.pose === "walk" ? Math.round(((spec.walkPhase || 0) % (Math.PI * 2)) * 3) : 0;
  const quantAtk = spec.pose === "attack" ? Math.round((spec.attackProgress || 0) * 6) : 0;
  const quantYaw = Math.round((spec.yaw || 0) * 2);
  const sev = spec.severed || {};

  const key = [
    dpr.toFixed(2),
    spec.roleKey || "",
    spec.female ? "F" : "M",
    spec.isPlayer ? "P" : "N",
    spec.facing || "",
    quantYaw,
    spec.pose || "idle",
    quantWalk,
    quantAtk,
    spec.ready ? "R" : "0",
    spec.down ? "D" : "0",
    spec.dead ? "X" : "0",
    spec.armor || "",
    spec.headGear || "",
    spec.handsGear || "",
    spec.legsGear || "",
    spec.bootsGear || "",
    spec.weapon || "",
    spec.holsteredWeapon || "",
    spec.shield || spec.offhand || "",
    spec.bareTorso ? "1" : "0",
    spec.bareLegs ? "1" : "0",
    spec.bareFeet ? "1" : "0",
    sev.left_arm ? "1" : "0",
    sev.right_arm ? "1" : "0",
    sev.left_leg ? "1" : "0",
    sev.right_leg ? "1" : "0"
  ].join("|");

  if (actorSpriteCache.has(key)) {
    return actorSpriteCache.get(key);
  }

  if (actorSpriteCache.size > 360) {
    const firstKey = actorSpriteCache.keys().next().value;
    actorSpriteCache.delete(firstKey);
  }

  const logicalW = 156;
  const logicalH = 190;
  const cv = document.createElement("canvas");
  cv.width = Math.round(logicalW * dpr);
  cv.height = Math.round(logicalH * dpr);
  cv._logicalW = logicalW;
  cv._logicalH = logicalH;
  cv._anchorX = logicalW * 0.5;
  cv._anchorY = logicalH - 22;

  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.translate(cv._anchorX, cv._anchorY);
  /* На изометрической сцене рост человека ~92px (соразмерно дверям трактира и колодцу!) */
  ctx.scale(0.48, 0.48);
  drawChiseledPerson(ctx, spec);

  actorSpriteCache.set(key, cv);
  return cv;
}
