/* ============================================================================
   SQUARE SCENE 2.5D — Художественная изометрическая сцена Студёного Брода
   в стиле «Классическая изометрия старых времён на новый лад · Рубленные грани»
   - Бесшовный северный наст и рельефные сугробы (без шахматной клеточной сетки!)
   - Оба фасада (Трактир на СЗ и Кузница на СВ) развёрнуты ЛИЦОМ к зрителю и площади!
   - Честная 2.5D Z-сортировка (колодец, доска общины, лавка, фонари, ели).
   ============================================================================ */

const ORIGIN_X = 590;
const ORIGIN_Y = 122;
const TILE_W = 86;
const TILE_H = 43;

export function isoPt(col, row, z = 0) {
  return [
    ORIGIN_X + (col - row) * (TILE_W * 0.5),
    ORIGIN_Y + (col + row) * (TILE_H * 0.5) - z
  ];
}

function poly(ctx, pts, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.closePath();
  ctx.fill();
}

/* Гранёный изометрический параллелепипед строго по осям 2:1:
   - грань row = r1 смотрит влево-вниз (ЮЗ, освещённая)
   - грань col = c1 смотрит вправо-вниз (ЮВ, полутень) */
function isoBox(ctx, c0, r0, c1, r1, z0, z1, colTop, colSW, colSE) {
  const tNW = isoPt(c0, r0, z1);
  const tNE = isoPt(c1, r0, z1);
  const tSE = isoPt(c1, r1, z1);
  const tSW = isoPt(c0, r1, z1);

  const bNE = isoPt(c1, r0, z0);
  const bSE = isoPt(c1, r1, z0);
  const bSW = isoPt(c0, r1, z0);

  poly(ctx, [tSW, tSE, bSE, bSW], colSW);
  poly(ctx, [tSE, tNE, bNE, bSE], colSE);
  poly(ctx, [tNW, tNE, tSE, tSW], colTop);
}

function hash2(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/* Мягкий многогранный сугроб снега с освещённым наветренным склоном и голубой тенью */
function drawSnowDrift(ctx, col, row, radC, radR, heightPx, skyPhase = "day") {
  const pPeak = isoPt(col - 0.12, row - 0.08, heightPx);
  const pRidge = isoPt(col + radC * 0.28, row + radR * 0.18, heightPx * 0.72);
  const pN = isoPt(col - radC * 0.75, row - radR * 0.85, 0);
  const pNE = isoPt(col + radC * 0.80, row - radR * 0.65, 0);
  const pE = isoPt(col + radC * 1.05, row + radR * 0.25, 0);
  const pSE = isoPt(col + radC * 0.50, row + radR * 0.98, 0);
  const pSW = isoPt(col - radC * 0.65, row + radR * 0.88, 0);
  const pW = isoPt(col - radC * 1.02, row + radR * 0.08, 0);

  const isNight = skyPhase === "night";
  const isDusk = skyPhase === "dusk" || skyPhase === "dawn";

  const cBright = isNight ? "#6e869f" : (isDusk ? "#a8bcd0" : "#e5eef7");
  const cLight  = isNight ? "#607890" : (isDusk ? "#98adc2" : "#d5e2ee");
  const cMid    = isNight ? "#4f657c" : (isDusk ? "#849ab0" : "#bacbd9");
  const cShade  = isNight ? "#3f5368" : (isDusk ? "#70869c" : "#9cb0c4");
  const cDeep   = isNight ? "#334558" : (isDusk ? "#5f748a" : "#879db3");

  poly(ctx, [pPeak, pN, pW], cBright);
  poly(ctx, [pPeak, pW, pSW], cLight);
  poly(ctx, [pPeak, pSW, pRidge], cMid);
  poly(ctx, [pRidge, pSW, pSE], cShade);
  poly(ctx, [pRidge, pSE, pE], cDeep);
  poly(ctx, [pPeak, pRidge, pE, pNE], cShade);
  poly(ctx, [pPeak, pNE, pN], cLight);
}

/* Поленница колотых дров под шапкой снега */
function drawWoodpile25D(ctx, col, row, skyPhase = "day") {
  const snowL = skyPhase === "night" ? "#778fa8" : "#e2ecf6";
  const snowD = skyPhase === "night" ? "#546a82" : "#a3b7cc";
  isoBox(ctx, col - 0.55, row - 0.35, col + 0.55, row + 0.35, 0, 20, snowL, "#6a4728", "#422a15");
  /* Торцы поленьев */
  const p0 = isoPt(col - 0.4, row + 0.36, 5);
  const p1 = isoPt(col + 0.35, row + 0.36, 5);
  ctx.fillStyle = "#9e774d";
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const lx = p0[0] + (p1[0] - p0[0]) * t;
    const ly = p0[1] + (p1[1] - p0[1]) * t;
    ctx.beginPath();
    ctx.arc(lx, ly, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx + 2, ly - 6.5, 3.1, 0, Math.PI * 2);
    ctx.fill();
  }
  /* Снежная шапка сверху */
  const sNW = isoPt(col - 0.6, row - 0.4, 21);
  const sNE = isoPt(col + 0.6, row - 0.4, 21);
  const sSE = isoPt(col + 0.6, row + 0.4, 19);
  const sSW = isoPt(col - 0.6, row + 0.4, 19);
  poly(ctx, [sNW, sNE, sSE, sSW], snowL);
  poly(ctx, [sSE, sNE, [sNE[0], sNE[1] + 4], [sSE[0], sSE[1] + 4]], snowD);
}

/* Вековая заснеженная северная ель в стиле рубленных граней */
export function drawPineTree25D(ctx, cx, cy, scale = 1, nightDim = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  const g = ctx.createRadialGradient(8, 2, 4, 10, 4, 48);
  g.addColorStop(0, "rgba(12, 18, 26, 0.46)");
  g.addColorStop(1, "rgba(12, 18, 26, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(10, 4, 46, 19, 0, 0, Math.PI * 2);
  ctx.fill();

  poly(ctx, [[-6.5, 2], [0, 3], [0, -34], [-5, -34]], "#523823");
  poly(ctx, [[0, 3], [6.5, 2], [5, -34], [0, -34]], "#2f1e11");

  const pineL = nightDim < 0.75 ? "#20362e" : "#2d4a3d";
  const pineD = nightDim < 0.75 ? "#13221d" : "#1a2f26";
  const snowL = nightDim < 0.75 ? "#7f96ad" : "#e4eef8";
  const snowD = nightDim < 0.75 ? "#566b81" : "#9eb3c8";

  const tiers = [
    { y: -24, w: 46, h: 42 },
    { y: -54, w: 38, h: 38 },
    { y: -82, w: 29, h: 35 },
    { y: -108, w: 19, h: 30 }
  ];

  tiers.forEach((t) => {
    poly(ctx, [[0, t.y - t.h], [-t.w, t.y], [-t.w * 0.35, t.y + 7], [0, t.y + 4]], pineL);
    poly(ctx, [[0, t.y - t.h], [0, t.y + 4], [t.w * 0.35, t.y + 7], [t.w, t.y]], pineD);
    poly(ctx, [[0, t.y - t.h], [-t.w * 0.84, t.y - 5], [-t.w * 0.32, t.y - 1], [0, t.y - 6]], snowL);
    poly(ctx, [[0, t.y - t.h], [0, t.y - 6], [t.w * 0.32, t.y - 1], [t.w * 0.84, t.y - 5]], snowD);
  });

  ctx.restore();
}

/* ЭТАЛОННЫЙ 2.5D КАМЕННЫЙ КОЛОДЕЦ СТУДЁНОГО БРОДА */
export function drawStoneWell25D(ctx, cx, cy, nightDim = 1) {
  ctx.save();
  ctx.translate(cx, cy);

  const sh = ctx.createRadialGradient(14, 5, 8, 20, 8, 66);
  sh.addColorStop(0, "rgba(10, 15, 22, 0.54)");
  sh.addColorStop(0.65, "rgba(12, 18, 26, 0.22)");
  sh.addColorStop(1, "rgba(12, 18, 26, 0)");
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(16, 6, 62, 27, 0.12, 0, Math.PI * 2);
  ctx.fill();

  const snowL = nightDim < 0.75 ? "#849bb3" : "#e5eef7";
  const snowD = nightDim < 0.75 ? "#5b7188" : "#9eb3c8";

  poly(ctx, [[-45, 4], [-20, 17], [8, 19], [42, 7], [46, -2], [18, -13], [-24, -11]], snowD);
  poly(ctx, [[-45, 4], [-20, 17], [2, 18], [-6, 4], [-34, -5]], snowL);

  const wRx = 36;
  const wRy = 17;
  const wallH = 28;
  const segs = 8;
  const stoneCols = ["#828c97", "#707a85", "#5d6670", "#4b535c", "#3e454e", "#525b65", "#6a747f", "#7b8590"];

  for (let row = 0; row < 3; row++) {
    const yBot = -row * (wallH / 3);
    const yTop = -(row + 1) * (wallH / 3);
    for (let i = 0; i < segs; i++) {
      const ang0 = Math.PI - (i / segs) * Math.PI;
      const ang1 = Math.PI - ((i + 1) / segs) * Math.PI;
      const x0 = Math.cos(ang0) * wRx;
      const z0 = Math.sin(ang0) * wRy;
      const x1 = Math.cos(ang1) * wRx;
      const z1 = Math.sin(ang1) * wRy;
      poly(ctx, [[x0, yTop + z0], [x1, yTop + z1], [x1, yBot + z1], [x0, yBot + z0]], stoneCols[(i + row * 2) % stoneCols.length]);
      ctx.strokeStyle = "rgba(18, 23, 29, 0.52)";
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }
  }

  ctx.fillStyle = "#0b1017";
  ctx.beginPath();
  ctx.ellipse(0, -wallH, wRx - 6, wRy - 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#8d98a4";
  ctx.lineWidth = 6.0;
  ctx.beginPath();
  ctx.ellipse(0, -wallH, wRx - 2, wRy - 1, 0, 0, Math.PI * 2);
  ctx.stroke();

  poly(ctx, [[-36, -wallH + 2], [-16, -wallH + 13], [4, -wallH + 15], [-10, -wallH + 8], [-30, -wallH - 2]], snowL);

  /* Задняя стойка */
  poly(ctx, [[21, -wallH - 7], [27, -wallH - 5], [27, -wallH - 70], [21, -wallH - 72]], "#4c331e");
  poly(ctx, [[24, -wallH - 6], [27, -wallH - 5], [27, -wallH - 70], [24, -wallH - 71]], "#2f1e10");

  /* Ворот, верёвка, цепь и бадья */
  poly(ctx, [[-22, -wallH - 54], [24, -wallH - 65], [24, -wallH - 59], [-22, -wallH - 48]], "#6d4829");
  poly(ctx, [[-4, -wallH - 59], [8, -wallH - 62], [8, -wallH - 53], [-4, -wallH - 50]], "#946f47");
  ctx.strokeStyle = "#909ca8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(2, -wallH - 53);
  ctx.lineTo(2, -wallH - 21);
  ctx.stroke();
  poly(ctx, [[-6, -wallH - 23], [10, -wallH - 23], [8, -wallH - 9], [-4, -wallH - 9]], "#6c4727");
  poly(ctx, [[2, -wallH - 23], [10, -wallH - 23], [8, -wallH - 9], [2, -wallH - 9]], "#442b15");

  /* Передняя стойка и железная рукоять */
  poly(ctx, [[-27, -wallH + 6], [-20, -wallH + 8], [-20, -wallH - 59], [-27, -wallH - 61]], "#714b2a");
  poly(ctx, [[-23, -wallH + 7], [-20, -wallH + 8], [-20, -wallH - 59], [-23, -wallH - 60]], "#442c16");
  ctx.strokeStyle = "#9da9b5";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-24, -wallH - 50);
  ctx.lineTo(-33, -wallH - 47);
  ctx.lineTo(-33, -wallH - 37);
  ctx.stroke();

  /* Двускатная тесовая крыша колодца под шапкой снега */
  const rApexW = [-26, -wallH - 85];
  const rApexE = [26, -wallH - 98];
  const rEaveSW = [-47, -wallH - 51];
  const rEaveSE = [5, -wallH - 64];
  const rEaveNE = [45, -wallH - 72];

  poly(ctx, [rApexW, rApexE, rEaveNE, [0, -wallH - 60]], "#2b1c10");
  poly(ctx, [rApexW, rApexE, rEaveSE, rEaveSW], "#5e3e23");
  poly(ctx, [rApexE, rEaveNE, rEaveSE], "#382413");

  poly(ctx, [
    [rApexW[0] - 2, rApexW[1] - 5],
    [rApexE[0] + 2, rApexE[1] - 5],
    [rEaveSE[0] + 1, rEaveSE[1] - 4],
    [-20, rEaveSW[1] - 10],
    [rEaveSW[0] - 2, rEaveSW[1] - 3]
  ], snowL);
  poly(ctx, [
    [rApexE[0] + 2, rApexE[1] - 5],
    [rEaveNE[0] + 2, rEaveNE[1] - 3],
    [rEaveSE[0] + 1, rEaveSE[1] - 4]
  ], snowD);

  [[-39, -50, 7], [-27, -54, 10], [-13, -58, 7], [-2, -61, 9]].forEach(([ix, iy, ih]) => {
    poly(ctx, [[ix - 1.5, -wallH + iy], [ix + 1.5, -wallH + iy], [ix, -wallH + iy + ih]], "rgba(196, 224, 248, 0.84)");
  });

  ctx.restore();
}

export function drawNoticeBoard25D(ctx, cx, cy, nightDim = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "rgba(10, 15, 22, 0.44)";
  ctx.beginPath();
  ctx.ellipse(5, 3, 26, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  poly(ctx, [[-17, 2], [-12, 3], [-12, -52], [-17, -53]], "#5c3c21");
  poly(ctx, [[11, -4], [16, -3], [16, -58], [11, -59]], "#3e2815");
  poly(ctx, [[-19, -47], [18, -55], [18, -22], [-19, -14]], "#6e4928");
  poly(ctx, [[-16, -44], [15, -51], [15, -25], [-16, -18]], "#4f331b");
  poly(ctx, [[-12, -41], [-3, -43], [-3, -29], [-12, -27]], "#d8c9ad");
  poly(ctx, [[1, -44], [10, -46], [10, -34], [1, -32]], "#c7b697");
  const sCol = nightDim < 0.75 ? "#7e95ad" : "#e3edf7";
  poly(ctx, [[-22, -50], [21, -59], [23, -54], [-20, -45]], sCol);
  ctx.restore();
}

export function drawMarketStall25D(ctx, cx, cy, nightDim = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "rgba(10, 15, 22, 0.46)";
  ctx.beginPath();
  ctx.ellipse(6, 4, 42, 17, 0, 0, Math.PI * 2);
  ctx.fill();

  /* Прилавок + навес на двух жердях с рогожей и снегом */
  poly(ctx, [[-30, -4], [6, 11], [6, -13], [-30, -28]], "#704b2a");
  poly(ctx, [[6, 11], [32, -2], [32, -26], [6, -13]], "#482e17");
  poly(ctx, [[-32, -28], [-6, -41], [34, -26], [6, -13]], "#895d36");

  /* Товары на прилавке: меха, вяленая рыба, кувшины */
  poly(ctx, [[-20, -27], [-6, -34], [6, -28], [-8, -21]], "#594739");
  poly(ctx, [[4, -22], [15, -27], [22, -23], [11, -18]], "#b5854d");

  /* Стойки навеса лавки */
  poly(ctx, [[-28, -28], [-24, -28], [-24, -66], [-28, -66]], "#5b3b20");
  poly(ctx, [[26, -25], [30, -25], [30, -64], [26, -64]], "#3f2814");
  const sCol = nightDim < 0.75 ? "#7e95ad" : "#e2ecf6";
  poly(ctx, [[-34, -64], [-4, -77], [36, -62], [6, -49]], "#8e6c49");
  poly(ctx, [[-35, -66], [-4, -79], [36, -64], [6, -53]], sCol);
  ctx.restore();
}

export function drawLanternPost25D(ctx, cx, cy, lit = true) {
  ctx.save();
  ctx.translate(cx, cy);
  poly(ctx, [[-4, 2], [0, 3], [0, -76], [-4, -77]], "#5d3e22");
  poly(ctx, [[0, 3], [4, 2], [4, -77], [0, -76]], "#382412");
  poly(ctx, [[-2, -74], [15, -70], [15, -66], [-2, -70]], "#4a3019");
  poly(ctx, [[9, -66], [17, -66], [16, -53], [10, -53]], lit ? "#f7cb7c" : "#788694");
  poly(ctx, [[7, -69], [13, -73], [19, -69]], "#2c333b");

  if (lit) {
    const glow = ctx.createRadialGradient(13, -59, 2, 13, -59, 58);
    glow.addColorStop(0, "rgba(255, 206, 120, 0.56)");
    glow.addColorStop(0.45, "rgba(242, 162, 74, 0.18)");
    glow.addColorStop(1, "rgba(242, 162, 74, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(13, -59, 58, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* 1. ФАСАД ТРАКТИРА «ХРОМОЙ ОЛЕНЬ» на северо-западной границе (col = -1.7..0.1, row = 0.8..5.1)
   Его главный фасад (грань col = 0.1) развёрнут ЛИЦОМ К ЗРИТЕЛЮ И КОЛОДЦУ! */
function drawTavernOnNW(ctx, nightDim, lampsOn) {
  const snowL = nightDim < 0.75 ? "#8097af" : "#e6eff8";
  const snowD = nightDim < 0.75 ? "#5d738a" : "#acc0d4";

  /* Каменный фундамент и бревенчатый сруб */
  isoBox(ctx, -1.7, 0.8, 0.12, 5.1, 0, 18, "#606b77", "#4f5863", "#697480");
  isoBox(ctx, -1.65, 0.85, 0.08, 5.05, 18, 98, "#52361f", "#3d2715", "#6d492a");

  /* Венцы тёсаных брёвен на лицевом фасаде (грань col = 0.08) */
  ctx.strokeStyle = "rgba(28, 16, 8, 0.62)";
  ctx.lineWidth = 1.5;
  for (let z = 29; z <= 90; z += 12) {
    const a = isoPt(0.09, 0.85, z);
    const b = isoPt(0.09, 5.05, z);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  /* Выступающие торцы брёвен по углам сруба */
  for (let z = 24; z <= 92; z += 14) {
    isoBox(ctx, 0.08, 0.82, 0.25, 1.04, z, z + 8, "#7c5432", "#4b311b", "#644225");
    isoBox(ctx, 0.08, 4.86, 0.25, 5.08, z, z + 8, "#7c5432", "#4b311b", "#644225");
  }

  /* Массивное каменное крыльцо со ступенями перед дверью (col = 0.1..0.75, row = 2.45..3.55) */
  isoBox(ctx, 0.08, 2.45, 0.72, 3.55, 0, 9, "#75808c", "#545e68", "#68737f");
  isoBox(ctx, 0.08, 2.58, 0.46, 3.42, 9, 16, "#808b97", "#5c6671", "#707b87");

  /* Арочная дубовая дверь трактира (вход в col = 0, row = 3) */
  const d1 = isoPt(0.10, 2.66, 16);
  const d2 = isoPt(0.10, 3.34, 16);
  const d3 = isoPt(0.10, 3.34, 72);
  const d4 = isoPt(0.10, 2.66, 72);
  poly(ctx, [d4, d3, d2, d1], "#3b2312");
  /* Наличник и кованые петли */
  ctx.strokeStyle = "#8f9ba8";
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(d4[0] - 2, d4[1] + 15);
  ctx.lineTo(d3[0] + 5, d3[1] + 15);
  ctx.moveTo(d4[0] - 2, d4[1] + 38);
  ctx.lineTo(d3[0] + 5, d3[1] + 38);
  ctx.stroke();

  /* Два тёплых янтарных окна со слюдяным переплётом по бокам от двери! */
  [[1.35, 2.15], [3.75, 4.55]].forEach(([rA, rB]) => {
    const w1 = isoPt(0.10, rA, 42);
    const w2 = isoPt(0.10, rB, 42);
    const w3 = isoPt(0.10, rB, 74);
    const w4 = isoPt(0.10, rA, 74);
    poly(ctx, [w4, w3, w2, w1], lampsOn ? "#f7be68" : "#ebb25c");
    poly(ctx, [w4, [(w4[0] + w3[0]) * 0.5, (w4[1] + w3[1]) * 0.5], [(w1[0] + w2[0]) * 0.5, (w1[1] + w2[1]) * 0.5], w1],
      lampsOn ? "#ffd489" : "#f4c274");
    ctx.strokeStyle = "#2d1a0c";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(w4[0], w4[1]); ctx.lineTo(w3[0], w3[1]); ctx.lineTo(w2[0], w2[1]); ctx.lineTo(w1[0], w1[1]); ctx.closePath();
    ctx.moveTo((w4[0] + w3[0]) * 0.5, (w4[1] + w3[1]) * 0.5);
    ctx.lineTo((w1[0] + w2[0]) * 0.5, (w1[1] + w2[1]) * 0.5);
    ctx.moveTo((w4[0] + w1[0]) * 0.5, (w4[1] + w1[1]) * 0.5);
    ctx.lineTo((w3[0] + w2[0]) * 0.5, (w3[1] + w2[1]) * 0.5);
    ctx.stroke();
  });

  /* Деревянный козырёк над крыльцом под шапкой снега + вывеска «Хромой олень» */
  const cNW = isoPt(0.08, 2.32, 82);
  const cSW = isoPt(0.08, 3.68, 82);
  const cSE = isoPt(0.82, 3.68, 69);
  const cNE = isoPt(0.82, 2.32, 69);
  poly(ctx, [cNW, cNE, cSE, cSW], snowL);
  poly(ctx, [cSW, cSE, [cSE[0], cSE[1] + 5], [cSW[0], cSW[1] + 5]], "#492f19");

  /* Высокая двускатная крыша трактира под пухлым сугробом снега и каменная труба с дымком */
  const rRidgeN = isoPt(-0.8, 0.65, 144);
  const rRidgeS = isoPt(-0.8, 5.25, 144);
  const rEaveNE = isoPt(0.32, 0.65, 96);
  const rEaveSE = isoPt(0.32, 5.25, 96);
  const rEaveSW = isoPt(-1.85, 5.25, 98);

  /* ЮЗ торцевой фронтон сруба */
  poly(ctx, [isoPt(-1.65, 5.05, 98), rRidgeS, isoPt(0.08, 5.05, 98)], "#422a16");
  poly(ctx, [rRidgeS, rEaveSE, rEaveSW], "#2d1d0f");
  /* Главный видимый заснеженный скат крыши (смотрит прямо на площадь!) */
  poly(ctx, [rRidgeN, rEaveNE, rEaveSE, rRidgeS], snowL);
  poly(ctx, [rEaveNE, rEaveSE, [rEaveSE[0], rEaveSE[1] + 6], [rEaveNE[0], rEaveNE[1] + 6]], snowD);

  /* Каменная печная труба на крыше */
  isoBox(ctx, -0.65, 1.6, -0.15, 2.15, 126, 162, "#747f8b", "#545d67", "#646f7b");

  /* Деревянная бочка у крыльца */
  isoBox(ctx, 0.22, 4.15, 0.68, 4.62, 0, 22, snowL, "#684425", "#472d17");

  /* Тёплый золотистый отсвет окон и фонаря на снегу перед крыльцом */
  const glowPt = isoPt(1.05, 3.0, 0);
  const g = ctx.createRadialGradient(glowPt[0], glowPt[1], 8, glowPt[0], glowPt[1], 130);
  g.addColorStop(0, lampsOn ? "rgba(255, 194, 102, 0.36)" : "rgba(255, 204, 124, 0.20)");
  g.addColorStop(1, "rgba(255, 194, 102, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(glowPt[0], glowPt[1], 128, 62, -0.32, 0, Math.PI * 2);
  ctx.fill();
}

/* 2. ФАСАД КУЗНИЦЫ ТАРНА на северо-восточной границе (col = 6.2..10.4, row = -1.6..0.12)
   Его главный фасад (грань row = 0.12) развёрнут ЛИЦОМ К ЗРИТЕЛЮ И КОЛОДЦУ! */
function drawSmithyOnNE(ctx, nightDim) {
  const snowL = nightDim < 0.75 ? "#7d94ac" : "#e2ecf6";
  const snowD = nightDim < 0.75 ? "#586e85" : "#a1b5ca";

  /* Каменные стены кузницы с контрфорсами */
  isoBox(ctx, 6.2, -1.65, 10.3, 0.10, 0, 88, "#58626d", "#6d7885", "#434b55");

  /* Горизонтальные швы тёсаной каменной кладки на лицевой стене (row = 0.10) */
  ctx.strokeStyle = "rgba(22, 27, 33, 0.48)";
  ctx.lineWidth = 1.3;
  for (let z = 16; z <= 78; z += 15) {
    const a = isoPt(6.2, 0.11, z);
    const b = isoPt(10.3, 0.11, z);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  /* Широкий кованый вход кузницы (col = 8, row = 0) с каменным порогом */
  isoBox(ctx, 7.35, 0.08, 8.65, 0.62, 0, 8, "#76818d", "#67727e", "#49525c");
  const d1 = isoPt(7.52, 0.12, 8);
  const d2 = isoPt(8.48, 0.12, 8);
  const d3 = isoPt(8.48, 0.12, 66);
  const d4 = isoPt(7.52, 0.12, 66);
  poly(ctx, [d4, d3, d2, d1], "#2a3037");
  /* Багровый жар горна изнутри полуоткрытой кузни */
  const g1 = isoPt(7.82, 0.13, 8);
  const g2 = isoPt(8.22, 0.13, 8);
  const g3 = isoPt(8.22, 0.13, 62);
  const g4 = isoPt(7.82, 0.13, 62);
  poly(ctx, [g4, g3, g2, g1], "rgba(238, 106, 42, 0.55)");

  /* Навес кузнеца справа от входа с уличной наковальней */
  isoBox(ctx, 9.0, 0.18, 9.55, 0.65, 0, 18, "#454d56", "#58626d", "#323840");

  /* Заснеженная скатная крыша кузницы и могучая каменная труба горна */
  const rNW = isoPt(6.0, -1.8, 122);
  const rNE = isoPt(10.5, -1.8, 122);
  const rSE = isoPt(10.5, 0.35, 86);
  const rSW = isoPt(6.0, 0.35, 86);
  poly(ctx, [rNW, rNE, rSE, rSW], snowL);
  poly(ctx, [rSW, rSE, [rSE[0], rSE[1] + 6], [rSW[0], rSW[1] + 6]], "#452d18");
  poly(ctx, [rSE, rNE, [rNE[0], rNE[1] + 6], [rSE[0], rSE[1] + 6]], snowD);

  isoBox(ctx, 6.65, -1.15, 7.45, -0.35, 98, 148, "#6f7a86", "#646f7b", "#434b54");

  /* Кованая жаровня с раскалёнными углями перед кузницей (col = 6.9, row = 0.85) */
  const br = isoPt(6.85, 0.85, 0);
  poly(ctx, [[br[0] - 13, br[1] - 14], [br[0] + 13, br[1] - 14], [br[0] + 9, br[1] - 2], [br[0] - 9, br[1] - 2]], "#2d333b");
  poly(ctx, [[br[0] - 10, br[1] - 15], [br[0], br[1] - 20], [br[0] + 10, br[1] - 15], [br[0], br[1] - 11]], "#f57634");

  const fg = ctx.createRadialGradient(br[0], br[1] - 4, 4, br[0], br[1] + 4, 112);
  fg.addColorStop(0, "rgba(255, 128, 52, 0.38)");
  fg.addColorStop(1, "rgba(255, 128, 52, 0)");
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.ellipse(br[0], br[1] + 4, 110, 50, 0.25, 0, Math.PI * 2);
  ctx.fill();
}

/* 3. ВОРОТА ЧАСТОКОЛА К ОКОЛИЦЕ на юго-востоке (col = 11, row = 6) */
function drawOutskirtsGateSE(ctx, nightDim) {
  const sCol = nightDim < 0.75 ? "#7a91a8" : "#e3edf7";
  [[11.35, 4.85], [11.35, 7.15]].forEach(([c, r]) => {
    const p = isoPt(c, r, 0);
    poly(ctx, [[p[0] - 9, p[1] + 3], [p[0], p[1] + 6], [p[0], p[1] - 58], [p[0] - 8, p[1] - 60]], "#5e3e22");
    poly(ctx, [[p[0], p[1] + 6], [p[0] + 9, p[1] + 3], [p[0] + 8, p[1] - 60], [p[0], p[1] - 58]], "#3a2413");
    poly(ctx, [[p[0] - 10, p[1] - 59], [p[0], p[1] - 68], [p[0] + 10, p[1] - 59], [p[0], p[1] - 55]], sCol);
  });
}

/* ============================================================================
   ЗАПЕКАНИЕ СТАТИЧЕСКОГО ФОНА ЛОКАЦИИ В OFFSCREEN-ХОЛСТ (ВЫЗЫВАЕТСЯ 1 РАЗ!)
   ============================================================================ */
export function bakeLocationBackdrop25D(map, skyPhase = "day", dpr = 2) {
  const W = 1280;
  const H = 680;
  const cv = document.createElement("canvas");
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);

  const nightDim = skyPhase === "night" ? 0.56 : (skyPhase === "dusk" || skyPhase === "dawn" ? 0.80 : 1.0);
  const lampsOn = skyPhase !== "day";

  if (map.id === "square") {
    /* 1. Бесшовный снежный покров на весь холст 1280×680 (никаких резких обрывов и шахматных клеток!) */
    const snowGrad = ctx.createLinearGradient(0, 0, W, H);
    if (skyPhase === "night") {
      snowGrad.addColorStop(0, "#3b4d61");
      snowGrad.addColorStop(0.48, "#4c6178");
      snowGrad.addColorStop(1, "#354659");
    } else if (skyPhase === "dawn" || skyPhase === "dusk") {
      snowGrad.addColorStop(0, "#7f93a8");
      snowGrad.addColorStop(0.5, "#94a9be");
      snowGrad.addColorStop(1, "#72869b");
    } else {
      snowGrad.addColorStop(0, "#b8c9da");
      snowGrad.addColorStop(0.48, "#cedce9");
      snowGrad.addColorStop(1, "#a7bacd");
    }
    ctx.fillStyle = snowGrad;
    ctx.fillRect(0, 0, W, H);

    /* Мягкие широкие гранёные поля снежного наста (естественный рельеф равнины без клеточек!) */
    const snowFacets = [
      [[-4, -2], [5, -3], [4, 3], [-3, 4], skyPhase === "night" ? "rgba(125,155,185,0.12)" : "rgba(255,255,255,0.28)"],
      [[4, 3], [13, 1], [14, 8], [5, 9], skyPhase === "night" ? "rgba(20,32,46,0.18)" : "rgba(116,138,162,0.18)"],
      [[-2, 4], [5, 4], [6, 10], [-3, 9], skyPhase === "night" ? "rgba(110,140,170,0.10)" : "rgba(244,250,255,0.22)"]
    ];
    snowFacets.forEach(([a, b, c, d, fill]) => {
      poly(ctx, [isoPt(a[0], a[1], 0), isoPt(b[0], b[1], 0), isoPt(c[0], c[1], 0), isoPt(d[0], d[1], 0)], fill);
    });

    /* 2. Вытоптанная центральная площадь из старой северной брусчатки и три расчищенные тропы */
    const pWell = isoPt(5.0, 3.2, 0);
    const pTav = isoPt(0.5, 3.0, 0);
    const pSmi = isoPt(8.0, 0.5, 0);
    const pOut = isoPt(11.4, 6.0, 0);

    const pathCol = skyPhase === "night" ? "#3c4856" : (skyPhase === "day" ? "#8797a7" : "#687888");
    const cobbleAreaCol = skyPhase === "night" ? "#343e4a" : (skyPhase === "day" ? "#6d7a88" : "#566371");

    /* Широкие утоптанные дорожки от колодца к 3 выходам */
    ctx.strokeStyle = pathCol;
    ctx.lineCap = "round";
    ctx.lineWidth = 54;
    [[pWell, pTav], [pWell, pSmi], [pWell, pOut]].forEach(([u, v]) => {
      ctx.beginPath();
      ctx.moveTo(u[0], u[1]);
      ctx.lineTo(v[0], v[1]);
      ctx.stroke();
    });

    /* Центральный мощёный круг вокруг каменного колодца (припорошенный снегом по краям) */
    poly(ctx, [
      isoPt(2.8, 2.2, 0),
      isoPt(5.4, 1.4, 0),
      isoPt(7.6, 2.6, 0),
      isoPt(7.4, 4.7, 0),
      isoPt(4.8, 5.4, 0),
      isoPt(2.6, 4.1, 0)
    ], cobbleAreaCol);

    /* Отдельные гранёные каменные плиты брусчатки разного тона (как в классических изометрических RPG!) */
    for (let r = 1.2; r <= 6.4; r += 0.65) {
      for (let c = 0.8; c <= 11.0; c += 0.65) {
        const n = hash2(Math.round(c * 10), Math.round(r * 10));
        if (n < 0.46) { continue; }
        const dWell = Math.hypot(c - 5.0, r - 3.3);
        const dTav = Math.abs(r - 3.05) < 0.7 && c < 5.0;
        const dSmi = Math.abs((c - 5.0) * 0.62 + (r - 3.2) * 0.85) < 0.9 && c > 4.8 && r < 3.4;
        const dOut = Math.abs((c - 5.0) * 0.42 - (r - 3.2) * 0.92) < 0.85 && c > 5.2 && r > 3.2;
        if (dWell > 2.45 && !dTav && !dSmi && !dOut) { continue; }

        const sp = isoPt(c + (n - 0.5) * 0.25, r + (hash2(r, c) - 0.5) * 0.25, 0);
        const sw = 10 + (n * 7);
        const sh = sw * 0.48;
        const stoneTone = n > 0.72
          ? (nightDim < 0.75 ? "#2b333d" : "#56616d")
          : (nightDim < 0.75 ? "#39434f" : "#626e7b");
        poly(ctx, [
          [sp[0] - sw, sp[1]],
          [sp[0] - sw * 0.15, sp[1] - sh],
          [sp[0] + sw, sp[1] - sh * 0.1],
          [sp[0] + sw * 0.2, sp[1] + sh]
        ], stoneTone);
      }
    }

    /* 3. Мёрзлые санные колеи от ворот Околицы через площадь к крыльцу трактира */
    ctx.strokeStyle = nightDim < 0.75 ? "rgba(24, 32, 42, 0.52)" : "rgba(74, 86, 98, 0.42)";
    ctx.lineWidth = 3.8;
    [-0.24, 0.24].forEach((off) => {
      const a = isoPt(11.8, 6.0 + off, 0);
      const b = isoPt(6.2, 4.4 + off, 0);
      const d = isoPt(1.2, 3.3 + off, 0);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(b[0], b[1], d[0], d[1]);
      ctx.stroke();
    });

    /* 4. Крупные живописные гранёные сугробы снега по периметру площади */
    drawSnowDrift(ctx, 3.2, -0.4, 2.0, 1.3, 24, skyPhase);
    drawSnowDrift(ctx, 1.4, 6.3, 2.1, 1.4, 25, skyPhase);
    drawSnowDrift(ctx, 5.2, 7.1, 2.3, 1.3, 22, skyPhase);
    drawSnowDrift(ctx, 10.6, 2.2, 1.8, 1.4, 23, skyPhase);
    drawSnowDrift(ctx, 8.6, 6.9, 1.9, 1.2, 20, skyPhase);

    /* Поленница берёзовых дров у трактира и у кузницы */
    drawWoodpile25D(ctx, 1.0, 1.15, skyPhase);
    drawWoodpile25D(ctx, 10.3, 0.95, skyPhase);

    /* 5. Главные здания заднего плана, развёрнутые ЛИЦОМ на площадь! */
    drawTavernOnNW(ctx, nightDim, lampsOn);
    drawSmithyOnNE(ctx, nightDim);
    drawOutskirtsGateSE(ctx, nightDim);

    /* 6. Вековые северные ели за трактиром и кузницей */
    const pTree1 = isoPt(2.3, -0.8, 0);
    drawPineTree25D(ctx, pTree1[0], pTree1[1], 1.12, nightDim);
    const pTree2 = isoPt(4.6, -1.1, 0);
    drawPineTree25D(ctx, pTree2[0], pTree2[1], 0.96, nightDim);
    const pTree3 = isoPt(11.2, 1.1, 0);
    drawPineTree25D(ctx, pTree3[0], pTree3[1], 1.08, nightDim);
    const pTree4 = isoPt(-0.6, 6.2, 0);
    drawPineTree25D(ctx, pTree4[0], pTree4[1], 1.04, nightDim);

    return cv;
  }

  /* Чистый 2.5D-задник для остальных 5 локаций Студёного Брода */
  const isIndoor = !map.outdoor;
  ctx.fillStyle = isIndoor ? "#0f141c" : (skyPhase === "night" ? "#3b4d61" : "#bfd0e0");
  ctx.fillRect(0, 0, W, H);

  if (isIndoor) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 12; c++) {
        const n = hash2(c + 7, r + 3);
        const p0 = isoPt(c, r, 0);
        const p1 = isoPt(c + 1, r, 0);
        const p2 = isoPt(c + 1, r + 1, 0);
        const p3 = isoPt(c, r + 1, 0);
        const col = map.floorKind === "planks"
          ? (n > 0.5 ? "#5a3d24" : "#4f351e")
          : (n > 0.5 ? "#434c56" : "#384049");
        poly(ctx, [p0, p1, p2, p3], col);
      }
    }
    isoBox(ctx, -0.35, -0.35, 12.0, 0.0, 0, 86, "#56606b", "#646f7b", "#394048");
    isoBox(ctx, -0.35, 0.0, 0.0, 8.0, 0, 86, "#56606b", "#454e58", "#5d6874");
  } else {
    drawSnowDrift(ctx, 2.0, 1.0, 2.2, 1.4, 24, skyPhase);
    drawSnowDrift(ctx, 9.2, 6.6, 2.2, 1.4, 24, skyPhase);
  }

  return cv;
}

/* ============================================================================
   СПИСОК 2.5D-ОБЪЕКТОВ С ЧЕСТНОЙ Z-СОРТИРОВКОЙ ПО ГЛУБИНЕ (col + row)
   ============================================================================ */
export function buildForegroundProps25D(map, state, skyPhase = "day") {
  const nightDim = skyPhase === "night" ? 0.56 : (skyPhase === "dusk" || skyPhase === "dawn" ? 0.80 : 1.0);
  const lampsOn = skyPhase !== "day";
  const items = [];

  if (map.id === "square") {
    /* 1. Центральный каменный колодец (5, 3) */
    const wellScr = isoPt(5, 3, 0);
    items.push({
      key: "well",
      depth: 5 + 3 + 0.15,
      x: wellScr[0],
      y: wellScr[1],
      hitRadiusX: 42,
      hitHeight: 108,
      spot: (map.spots || []).find((s) => s.key === "well"),
      draw: (ctx) => drawStoneWell25D(ctx, wellScr[0], wellScr[1], nightDim)
    });

    /* 2. Доска общины и подрядов (3, 1) */
    const boardScr = isoPt(3, 1, 0);
    items.push({
      key: "board",
      depth: 3 + 1 + 0.1,
      x: boardScr[0],
      y: boardScr[1],
      hitRadiusX: 25,
      hitHeight: 64,
      spot: (map.spots || []).find((s) => s.key === "board"),
      draw: (ctx) => drawNoticeBoard25D(ctx, boardScr[0], boardScr[1], nightDim)
    });

    /* 3. Торговая лавка под навесом (8, 2) */
    const stallScr = isoPt(8.4, 2.2, 0);
    items.push({
      key: "stall",
      depth: 8.4 + 2.2 + 0.1,
      x: stallScr[0],
      y: stallScr[1],
      hitRadiusX: 38,
      hitHeight: 74,
      spot: (map.spots || []).find((s) => s.key === "stall"),
      draw: (ctx) => drawMarketStall25D(ctx, stallScr[0], stallScr[1], nightDim)
    });

    /* 4. Уличный фонарь у крыльца трактира (1.6, 2.1) */
    const lanScr = isoPt(1.6, 2.1, 0);
    items.push({
      key: "lantern_sq",
      depth: 1.6 + 2.1,
      x: lanScr[0],
      y: lanScr[1],
      draw: (ctx) => drawLanternPost25D(ctx, lanScr[0], lanScr[1], true)
    });

    /* 5. Передние вековые ели в снегу (честное перекрытие переднего плана 2.5D!) */
    const treeSW = isoPt(2.4, 6.9, 0);
    items.push({
      key: "pine_sw",
      depth: 2.4 + 6.9 + 0.2,
      x: treeSW[0],
      y: treeSW[1],
      draw: (ctx) => drawPineTree25D(ctx, treeSW[0], treeSW[1], 1.06, nightDim)
    });

    const treeSE = isoPt(9.6, 7.2, 0);
    items.push({
      key: "pine_se",
      depth: 9.6 + 7.2 + 0.2,
      x: treeSE[0],
      y: treeSE[1],
      draw: (ctx) => drawPineTree25D(ctx, treeSE[0], treeSE[1], 1.02, nightDim)
    });

    return items;
  }

  if (map.id === "jail") {
    const unlocked = !!(state && state.jail && (state.jail.unlocked || state.jail.escaped));
    for (let r = 0; r < 8; r++) {
      if (r === 4 && unlocked) { continue; }
      const bp = isoPt(5, r, 0);
      items.push({
        key: "jail_bar_" + r,
        depth: 5 + r,
        x: bp[0],
        y: bp[1],
        hitRadiusX: r === 4 ? 26 : 0,
        hitHeight: r === 4 ? 76 : 0,
        jailDoor: r === 4,
        draw: (ctx) => {
          ctx.strokeStyle = "#6c7682";
          ctx.lineWidth = 3;
          for (let k = -18; k <= 18; k += 9) {
            ctx.beginPath();
            ctx.moveTo(bp[0] + k, bp[1] + 6 - k * 0.45);
            ctx.lineTo(bp[0] + k, bp[1] - 74 - k * 0.45);
            ctx.stroke();
          }
          if (r === 4) {
            ctx.fillStyle = "#b89b4c";
            ctx.fillRect(bp[0] - 5, bp[1] - 42, 10, 12);
          }
        }
      });
    }
    return items;
  }

  (map.obstacles || []).forEach((ob, idx) => {
    const p = isoPt(ob.col, ob.row, 0);
    const sp = (map.spots || []).find((s) => Math.abs(s.col - ob.col) <= 0.6 && Math.abs(s.row - ob.row) <= 0.6);
    items.push({
      key: ob.kind + "_" + idx,
      depth: ob.col + ob.row + 0.1,
      x: p[0],
      y: p[1],
      hitRadiusX: 30,
      hitHeight: 68,
      spot: sp,
      draw: (ctx) => {
        if (ob.kind === "pine") {
          drawPineTree25D(ctx, p[0], p[1], 1.0, nightDim);
        } else {
          isoBox(ctx, ob.col - 0.35, ob.row - 0.35, ob.col + 0.35, ob.row + 0.35, 0, 34, "#74502f", "#5e3f23", "#3e2815");
        }
      }
    });
  });

  return items;
}
