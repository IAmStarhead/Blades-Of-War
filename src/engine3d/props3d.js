/* ============================================================
   BOW 3D PROPS & ARCHITECTURE — Детализированные 3D-объекты и
   архитектура Студёного Брода уровня эталона каменного колодца
   (image-45), сплошная кованая 3D-клетка с шарнирной дверью и
   поддержка Режима производительности (0.0.9.3).
   ============================================================ */
import * as THREE from "three";
import { getMat, getBasicMat, PALETTE } from "./materials.js";

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cyl12: new THREE.CylinderGeometry(1, 1, 1, 12),
  taperBucket: new THREE.CylinderGeometry(1, 0.78, 1, 8),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  cone8: new THREE.ConeGeometry(1, 1, 8),
  ico0: new THREE.IcosahedronGeometry(1, 0),
  ico1: new THREE.IcosahedronGeometry(1, 1),
  octa: new THREE.OctahedronGeometry(1, 0),
  ring12: new THREE.CylinderGeometry(1, 1, 1, 12, 1, true)
};

function addM(parent, geo, mat, px, py, pz, sx, sy, sz, rx = 0, ry = 0, rz = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(px, py, pz);
  m.scale.set(sx, sy, sz);
  if (rx || ry || rz) { m.rotation.set(rx, ry, rz); }
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/* ---------- ЭТАЛОН image-45: Каменный северный колодец ---------- */
export function buildWell3D(detailLevel = "high") {
  const g = new THREE.Group();
  const sLight = getMat(PALETTE.stoneLight, { roughness: 0.88 });
  const sMid = getMat(PALETTE.stoneMid, { roughness: 0.90 });
  const sDark = getMat(PALETTE.stoneDark, { roughness: 0.92 });
  const wood = getMat(PALETTE.woodAged, { roughness: 0.85 });
  const woodDark = getMat(PALETTE.woodDark, { roughness: 0.88 });
  const slate = getMat(PALETTE.slateRoof, { roughness: 0.78 });
  const slateHi = getMat(PALETTE.slateEdge, { roughness: 0.76 });
  const iron = getMat(PALETTE.ironForged, { metalness: 0.52, roughness: 0.46 });
  const snow = getMat(PALETTE.snowPure, { roughness: 0.94 });
  const ropeMat = getMat(PALETTE.linenWarm, { roughness: 0.92 });
  const iceWater = getMat("#162636", { metalness: 0.25, roughness: 0.22 });

  /* 1. Каменная отмостка из крупных плит вокруг основания */
  const baseStones = detailLevel === "low" ? 6 : 10;
  for (let i = 0; i < baseStones; i++) {
    const a = (i / baseStones) * Math.PI * 2;
    const r = 0.74 + (i % 2) * 0.05;
    addM(g, GEO.box, i % 2 === 0 ? sMid : sDark, Math.cos(a) * r, 0.035, Math.sin(a) * r, 0.36, 0.07, 0.28, 0, -a, 0, false);
  }

  /* 2. Тёмная шахта и ледяное зеркало воды внутри */
  addM(g, GEO.cyl12, sDark, 0, 0.36, 0, 0.54, 0.70, 0.54);
  addM(g, GEO.cyl12, iceWater, 0, 0.42, 0, 0.46, 0.04, 0.46, 0, 0, 0, false);

  /* 3. Три яруса объёмной каменной кладки вразбежку + железные скобы (как на image-45) */
  const stoneMats = [sLight, sMid, sDark];
  const segs = detailLevel === "low" ? 8 : 12;
  for (let tier = 0; tier < 3; tier++) {
    const y = 0.14 + tier * 0.22;
    const shift = tier * (Math.PI / segs);
    for (let i = 0; i < segs; i++) {
      const a = shift + (i / segs) * Math.PI * 2;
      const rad = 0.58 + ((i + tier) % 3) * 0.014;
      const mat = stoneMats[(i + tier * 2) % 3];
      addM(g, GEO.box, mat, Math.cos(a) * rad, y, Math.sin(a) * rad, 0.30, 0.195, 0.16, 0, -a + Math.PI * 0.5, 0);
    }
  }
  /* Верхний профилированный каменный венец и шапки снега на парапете */
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    addM(g, GEO.box, i % 2 ? sLight : sMid, Math.cos(a) * 0.61, 0.77, Math.sin(a) * 0.61, 0.33, 0.085, 0.21, 0, -a + Math.PI * 0.5, 0);
    if (i % 3 === 0) {
      addM(g, GEO.box, snow, Math.cos(a) * 0.61, 0.825, Math.sin(a) * 0.61, 0.28, 0.036, 0.17, 0, -a + Math.PI * 0.5, 0, false);
    }
  }
  /* Кованые скобы на кладке */
  addM(g, GEO.box, iron, 0.68, 0.48, 0, 0.03, 0.12, 0.08);
  addM(g, GEO.box, iron, -0.68, 0.48, 0, 0.03, 0.12, 0.08);

  /* 4. Стойки из тёсаного бруса с раскосами и железными башмаками */
  [-0.54, 0.54].forEach((px) => {
    const sign = px < 0 ? -1 : 1;
    addM(g, GEO.box, iron, px, 0.86, 0, 0.13, 0.12, 0.13);
    addM(g, GEO.box, wood, px, 1.42, 0, 0.105, 1.24, 0.105);
    addM(g, GEO.box, woodDark, px - sign * 0.12, 1.84, 0, 0.075, 0.34, 0.075, 0, 0, sign * 0.62);
    addM(g, GEO.box, woodDark, px, 1.84, 0.14, 0.070, 0.32, 0.070, -0.58, 0, 0);
    addM(g, GEO.box, woodDark, px, 1.84, -0.14, 0.070, 0.32, 0.070, 0.58, 0, 0);
  });

  /* 5. Рабочий деревянный ворот, витки каната, кованая рукоять и окованная бадья */
  addM(g, GEO.cyl8, woodDark, 0, 1.46, 0, 0.082, 1.04, 0.082, 0, 0, Math.PI * 0.5);
  for (let r = -2; r <= 2; r++) {
    addM(g, GEO.cyl8, ropeMat, r * 0.042, 1.46, 0, 0.098, 0.034, 0.098, 0, 0, Math.PI * 0.5);
  }
  /* Железная рукоять ворота справа */
  addM(g, GEO.box, iron, 0.64, 1.46, 0, 0.14, 0.035, 0.035);
  addM(g, GEO.box, iron, 0.70, 1.36, 0, 0.035, 0.22, 0.035);
  addM(g, GEO.cyl6, wood, 0.76, 1.27, 0, 0.024, 0.14, 0.024, 0, 0, Math.PI * 0.5);

  /* Свисающий канат и бадья со льдом */
  addM(g, GEO.cyl6, ropeMat, 0.02, 1.18, 0.06, 0.014, 0.52, 0.014);
  const bucket = new THREE.Group();
  bucket.position.set(0.02, 0.89, 0.06);
  addM(bucket, GEO.taperBucket, wood, 0, 0, 0, 0.135, 0.22, 0.135);
  addM(bucket, GEO.cyl8, iron, 0, 0.06, 0, 0.138, 0.024, 0.138);
  addM(bucket, GEO.cyl8, iron, 0, -0.06, 0, 0.116, 0.024, 0.116);
  addM(bucket, GEO.cyl8, getMat(PALETTE.icePale), 0, 0.095, 0, 0.120, 0.022, 0.120);
  addM(bucket, GEO.box, iron, 0, 0.16, 0, 0.24, 0.11, 0.018);
  g.add(bucket);

  /* 6. Ступенчатая двускатная сланцевая крыша со стропилами и пластами снега (image-45) */
  addM(g, GEO.box, woodDark, 0, 2.02, 0, 1.44, 0.08, 0.12);
  const rowsRoof = detailLevel === "low" ? 2 : 4;
  [-1, 1].forEach((side) => {
    /* Основа ската */
    addM(g, GEO.box, woodDark, 0, 2.16, side * 0.34, 1.50, 0.055, 0.78, side * 0.56, 0, 0);
    /* Ступени колотого сланца внахлёст */
    for (let s = 0; s < rowsRoof; s++) {
      const t = s / rowsRoof;
      const ry = 2.34 - t * 0.34;
      const rz = side * (0.11 + t * 0.48);
      addM(g, GEO.box, s % 2 === 0 ? slate : slateHi, 0, ry, rz, 1.54, 0.042, 0.24, side * 0.56, 0, 0);
    }
    /* Снежная шапка на скате */
    addM(g, GEO.box, snow, -0.12 * side, 2.26, side * 0.29, 1.24, 0.048, 0.46, side * 0.56, 0, 0, false);
  });
  /* Конёк крыши */
  addM(g, GEO.box, wood, 0, 2.41, 0, 1.58, 0.075, 0.11);
  addM(g, GEO.box, snow, 0, 2.455, 0, 1.46, 0.036, 0.09, 0, 0, 0, false);

  /* Сугробы у основания */
  addM(g, GEO.ico1, snow, -0.62, 0.06, 0.38, 0.26, 0.11, 0.22, 0, 0, 0, false);
  addM(g, GEO.ico1, snow, 0.58, 0.05, -0.42, 0.24, 0.09, 0.20, 0, 0, 0, false);

  return g;
}

/* ---------- Остальные детализированные 3D-объекты Брода ---------- */
export function buildProp3D(kind, detailLevel = "high") {
  if (kind === "well") { return buildWell3D(detailLevel); }

  const g = new THREE.Group();
  const wood = getMat(PALETTE.woodAged, { roughness: 0.85 });
  const woodDark = getMat(PALETTE.woodDark, { roughness: 0.88 });
  const woodPlank = getMat(PALETTE.woodPlank, { roughness: 0.84 });
  const stone = getMat(PALETTE.stoneMid, { roughness: 0.90 });
  const stoneDark = getMat(PALETTE.stoneDark, { roughness: 0.92 });
  const stoneLight = getMat(PALETTE.stoneLight, { roughness: 0.88 });
  const iron = getMat(PALETTE.ironForged, { metalness: 0.52, roughness: 0.46 });
  const steel = getMat(PALETTE.steelBright, { metalness: 0.68, roughness: 0.32 });
  const cloth = getMat(PALETTE.linenWarm, { roughness: 0.92 });
  const tarp = getMat("#6d5944", { roughness: 0.92 });
  const snow = getMat(PALETTE.snowPure, { roughness: 0.94 });
  const ember = getMat(PALETTE.emberCore, { emissive: PALETTE.emberCore, emissiveIntensity: 1.55, roughness: 0.45 });
  const flame = getMat(PALETTE.emberHot, { emissive: PALETTE.emberHot, emissiveIntensity: 1.95, roughness: 0.30 });

  if (kind === "brazier") {
    /* Кованая северная угольная жаровня на треноге с живыми углями */
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      addM(g, GEO.box, iron, Math.cos(a) * 0.20, 0.34, Math.sin(a) * 0.20, 0.055, 0.68, 0.055, Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18);
    }
    addM(g, GEO.taperBucket, iron, 0, 0.66, 0, 0.34, 0.26, 0.34);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      addM(g, GEO.box, iron, Math.cos(a) * 0.33, 0.74, Math.sin(a) * 0.33, 0.032, 0.22, 0.032);
    }
    addM(g, GEO.ico1, ember, 0, 0.74, 0, 0.26, 0.12, 0.26, 0, 0, 0, false);
    const fireMesh = addM(g, GEO.cone6, flame, 0, 0.92, 0, 0.14, 0.30, 0.14, 0, 0, 0, false);
    fireMesh.userData.flickerFlame = true;
    return g;
  }

  if (kind === "stall") {
    /* Торговый навес Ливы с прилавком, мешками соли, тюками и пушниной */
    addM(g, GEO.box, woodPlank, 0, 0.46, 0.18, 1.56, 0.10, 0.58);
    addM(g, GEO.box, woodDark, 0, 0.23, 0.18, 1.48, 0.44, 0.50);
    [[-0.72, -0.32], [0.72, -0.32], [-0.72, 0.42], [0.72, 0.42]].forEach(([x, z]) => {
      addM(g, GEO.box, wood, x, 1.02, z, 0.085, 2.04, 0.085);
    });
    addM(g, GEO.box, tarp, 0, 1.98, 0.06, 1.72, 0.07, 1.04, 0.20, 0, 0);
    addM(g, GEO.box, snow, 0, 2.03, 0.02, 1.56, 0.045, 0.84, 0.20, 0, 0, false);
    /* Товары на прилавке: мешки соли, каравай, свёрток меха */
    addM(g, GEO.ico1, getMat(PALETTE.apronCream), -0.42, 0.62, 0.18, 0.16, 0.18, 0.15);
    addM(g, GEO.ico1, cloth, -0.14, 0.60, 0.22, 0.14, 0.15, 0.14);
    addM(g, GEO.box, getMat(PALETTE.furTrim), 0.28, 0.56, 0.16, 0.36, 0.10, 0.26);
    addM(g, GEO.cyl8, wood, 0.62, 0.32, -0.18, 0.22, 0.64, 0.22);
    addM(g, GEO.cyl8, iron, 0.62, 0.48, -0.18, 0.226, 0.03, 0.226);
    return g;
  }

  if (kind === "crates") {
    /* Окованные дорожные ящики и соляная бочка */
    addM(g, GEO.box, woodPlank, -0.22, 0.28, 0.08, 0.56, 0.56, 0.56, 0, 0.12, 0);
    addM(g, GEO.box, woodDark, -0.22, 0.28, 0.08, 0.58, 0.06, 0.58, 0, 0.12, 0);
    addM(g, GEO.box, wood, -0.16, 0.72, 0.04, 0.38, 0.34, 0.38, 0, -0.24, 0);
    addM(g, GEO.cyl8, woodAgedMat(), 0.32, 0.34, -0.12, 0.23, 0.68, 0.23);
    addM(g, GEO.cyl8, iron, 0.32, 0.52, -0.12, 0.236, 0.032, 0.236);
    addM(g, GEO.cyl8, iron, 0.32, 0.16, -0.12, 0.236, 0.032, 0.236);
    return g;
  }

  if (kind === "hearth") {
    /* Большой каменный очаг трактира с дымоходом, цепью и котлом похлёбки */
    addM(g, GEO.box, stoneDark, 0, 0.08, 0, 1.56, 0.16, 1.06);
    addM(g, GEO.box, stone, -0.62, 0.68, 0, 0.30, 1.20, 0.96);
    addM(g, GEO.box, stone, 0.62, 0.68, 0, 0.30, 1.20, 0.96);
    addM(g, GEO.box, stoneDark, 0, 0.85, -0.36, 1.20, 1.54, 0.28);
    addM(g, GEO.box, stoneLight, 0, 1.38, 0, 1.62, 0.30, 1.02);
    addM(g, GEO.box, stone, 0, 1.98, -0.12, 1.06, 0.95, 0.74);
    /* Поленья, жар и котёл */
    addM(g, GEO.cyl6, woodDark, -0.12, 0.22, 0.08, 0.06, 0.62, 0.06, 0, 0.3, Math.PI * 0.5);
    addM(g, GEO.cyl6, woodDark, 0.10, 0.22, 0.12, 0.06, 0.58, 0.06, 0, -0.4, Math.PI * 0.5);
    addM(g, GEO.ico1, ember, 0, 0.24, 0.08, 0.38, 0.12, 0.28, 0, 0, 0, false);
    const fl = addM(g, GEO.cone6, flame, 0, 0.44, 0.08, 0.20, 0.38, 0.18, 0, 0, 0, false);
    fl.userData.flickerFlame = true;
    addM(g, GEO.cyl6, iron, 0, 0.94, 0.10, 0.018, 0.56, 0.018);
    addM(g, GEO.ico1, iron, 0, 0.56, 0.10, 0.24, 0.20, 0.24);
    return g;
  }

  if (kind === "bar") {
    /* Дубовая стойка Сигрид с пивными бочонками и кружками */
    addM(g, GEO.box, woodDark, 0, 0.44, 0, 1.68, 0.88, 0.52);
    addM(g, GEO.box, woodPlank, 0, 0.91, 0.03, 1.78, 0.08, 0.64);
    addM(g, GEO.cyl8, wood, -0.52, 1.14, -0.06, 0.17, 0.42, 0.17, Math.PI * 0.5, 0, 0);
    addM(g, GEO.cyl8, iron, -0.52, 1.14, 0.06, 0.175, 0.03, 0.175, Math.PI * 0.5, 0, 0);
    addM(g, GEO.cyl8, wood, 0.18, 1.03, 0.08, 0.055, 0.14, 0.055);
    addM(g, GEO.cyl8, wood, 0.34, 1.03, 0.02, 0.055, 0.14, 0.055);
    return g;
  }

  if (kind === "table") {
    /* Трактирный стол со скамьями, миской и свечой */
    addM(g, GEO.box, woodPlank, 0, 0.68, 0, 1.18, 0.07, 0.74);
    [[-0.48, -0.26], [0.48, -0.26], [-0.48, 0.26], [0.48, 0.26]].forEach(([x, z]) => {
      addM(g, GEO.box, woodDark, x, 0.34, z, 0.08, 0.66, 0.08);
    });
    addM(g, GEO.box, wood, 0, 0.38, 0.52, 1.06, 0.055, 0.24);
    addM(g, GEO.box, wood, 0, 0.38, -0.52, 1.06, 0.055, 0.24);
    addM(g, GEO.cyl8, getMat(PALETTE.apronCream), 0.12, 0.78, 0.04, 0.03, 0.13, 0.03);
    addM(g, GEO.octa, flame, 0.12, 0.87, 0.04, 0.024, 0.042, 0.024, 0, 0, 0, false);
    return g;
  }

  if (kind === "bunk") {
    /* Широкая лавка с меховым тулупом у тёплой стены */
    addM(g, GEO.box, woodDark, 0, 0.26, 0, 1.38, 0.32, 0.72);
    addM(g, GEO.box, getMat(PALETTE.furTrim), 0, 0.45, 0, 1.28, 0.10, 0.66);
    addM(g, GEO.box, getMat(PALETTE.linenLight), -0.44, 0.54, 0, 0.30, 0.11, 0.52, 0, 0, 0.12);
    return g;
  }

  if (kind === "forge") {
    /* Кузнечный горн Тарна с каменным кожухом, кожаными мехами и багровым жаром */
    addM(g, GEO.box, stoneDark, 0, 0.44, 0, 1.48, 0.88, 1.06);
    addM(g, GEO.box, stone, 0, 0.92, 0, 1.54, 0.10, 1.12);
    addM(g, GEO.box, stoneDark, -0.12, 1.65, -0.20, 1.10, 1.36, 0.72);
    addM(g, GEO.ico1, ember, -0.10, 0.99, 0.12, 0.42, 0.14, 0.34, 0, 0, 0, false);
    const fl = addM(g, GEO.cone6, flame, -0.10, 1.16, 0.12, 0.18, 0.32, 0.18, 0, 0, 0, false);
    fl.userData.flickerFlame = true;
    /* Кожаные меха сбоку */
    addM(g, GEO.cone6, getMat(PALETTE.leatherMid), 0.78, 0.94, 0.05, 0.28, 0.62, 0.22, 0, 0, Math.PI * 0.5);
    addM(g, GEO.box, wood, 0.78, 1.08, 0.05, 0.58, 0.04, 0.34, 0, 0, -0.16);
    return g;
  }

  if (kind === "anvil") {
    /* Рогатая стальная наковальня на дубовой колоде с клещами */
    addM(g, GEO.cyl8, woodDark, 0, 0.28, 0, 0.30, 0.56, 0.30);
    addM(g, GEO.cyl8, iron, 0, 0.48, 0, 0.308, 0.04, 0.308);
    addM(g, GEO.box, iron, 0, 0.62, 0, 0.36, 0.14, 0.22);
    addM(g, GEO.box, steel, 0.03, 0.76, 0, 0.48, 0.16, 0.18);
    addM(g, GEO.cone6, steel, -0.32, 0.77, 0, 0.085, 0.28, 0.085, 0, 0, Math.PI * 0.5);
    /* Полоса калёного железа на наковальне */
    addM(g, GEO.box, ember, 0.05, 0.85, 0, 0.24, 0.025, 0.05, 0, 0.2, 0, false);
    return g;
  }

  if (kind === "trough") {
    /* Закалочное корыто с тёмной водой и стойкой с поковками */
    addM(g, GEO.box, woodDark, 0, 0.26, 0, 0.96, 0.48, 0.48);
    addM(g, GEO.box, getMat("#1a2c3b", { roughness: 0.2 }), 0, 0.46, 0, 0.84, 0.06, 0.36, 0, 0, 0, false);
    return g;
  }

  if (kind === "torch_post") {
    /* Столб со смоляным факелом у ворот частокола */
    addM(g, GEO.cyl6, woodDark, 0, 0.95, 0, 0.09, 1.90, 0.09);
    addM(g, GEO.box, iron, 0.14, 1.48, 0, 0.24, 0.05, 0.05);
    addM(g, GEO.taperBucket, iron, 0.24, 1.62, 0, 0.11, 0.24, 0.11);
    const fl = addM(g, GEO.cone6, flame, 0.24, 1.84, 0, 0.11, 0.28, 0.11, 0, 0, 0, false);
    fl.userData.flickerFlame = true;
    return g;
  }

  if (kind === "woodpile") {
    /* Дровяные козлы, поленница и воткнутый в чурбак колун */
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4 - r; c++) {
        addM(g, GEO.cyl6, wood, -0.32 + c * 0.18 + r * 0.09, 0.12 + r * 0.14, -0.15, 0.075, 0.68, 0.075, Math.PI * 0.5, 0, 0);
      }
    }
    addM(g, GEO.box, snow, -0.10, 0.48, -0.15, 0.56, 0.05, 0.56, 0, 0, 0, false);
    /* Колода с воткнутым топором */
    addM(g, GEO.cyl8, woodPlank, 0.42, 0.22, 0.22, 0.20, 0.44, 0.20);
    addM(g, GEO.box, steel, 0.42, 0.48, 0.22, 0.14, 0.14, 0.025, 0, 0.3, -0.35);
    addM(g, GEO.cyl6, wood, 0.56, 0.64, 0.16, 0.024, 0.48, 0.024, 0, 0.3, -0.65);
    return g;
  }

  if (kind === "rock") {
    /* Мёрзлый гранитный валун в снегу */
    addM(g, GEO.ico0, stone, 0, 0.26, 0, 0.48, 0.38, 0.42, 0.2, 0.5, 0);
    addM(g, GEO.ico0, stoneDark, 0.32, 0.15, 0.18, 0.26, 0.22, 0.24);
    addM(g, GEO.ico1, snow, -0.04, 0.44, -0.02, 0.34, 0.08, 0.30, 0, 0, 0, false);
    return g;
  }

  if (kind === "pine") {
    /* Вековая северная ель Матери-Тайги со снежными шапками на ярусах */
    const needles = getMat(PALETTE.needlesDark, { roughness: 0.92 });
    const needlesHi = getMat(PALETTE.needlesMid, { roughness: 0.90 });
    addM(g, GEO.cyl6, getMat(PALETTE.barkTaiga), 0, 0.65, 0, 0.14, 1.30, 0.14);
    const tiers = [
      { y: 0.95, r: 0.78, h: 0.85 },
      { y: 1.52, r: 0.62, h: 0.80 },
      { y: 2.05, r: 0.46, h: 0.74 },
      { y: 2.52, r: 0.28, h: 0.64 }
    ];
    tiers.forEach((tr, idx) => {
      addM(g, GEO.cone8, idx % 2 ? needlesHi : needles, 0, tr.y, 0, tr.r, tr.h, tr.r, 0, idx * 0.4, 0);
      addM(g, GEO.cone8, snow, 0, tr.y + 0.08, 0, tr.r * 0.84, tr.h * 0.45, tr.r * 0.84, 0, idx * 0.4, 0, false);
    });
    return g;
  }

  if (kind === "campfire") {
    /* Охотничий костёр с каменным кольцом и треногой с котелком */
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      addM(g, GEO.ico0, stone, Math.cos(a) * 0.38, 0.07, Math.sin(a) * 0.38, 0.11, 0.08, 0.10, 0, a, 0, false);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      addM(g, GEO.cyl6, woodDark, 0, 0.10, 0, 0.045, 0.62, 0.045, Math.PI * 0.5, a, 0);
    }
    addM(g, GEO.ico1, ember, 0, 0.12, 0, 0.24, 0.10, 0.24, 0, 0, 0, false);
    const fl = addM(g, GEO.cone6, flame, 0, 0.32, 0, 0.16, 0.38, 0.16, 0, 0, 0, false);
    fl.userData.flickerFlame = true;
    /* Охотничья тренога */
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      addM(g, GEO.cyl6, wood, Math.cos(a) * 0.26, 0.52, Math.sin(a) * 0.26, 0.022, 1.12, 0.022, -Math.sin(a) * 0.26, 0, Math.cos(a) * 0.26);
    }
    addM(g, GEO.ico1, iron, 0, 0.56, 0, 0.14, 0.12, 0.14);
    return g;
  }

  if (kind === "straw") {
    /* Охапка прелой соломы в углу клетки */
    const straw = getMat("#8c7748", { roughness: 0.95 });
    addM(g, GEO.box, straw, 0, 0.05, 0, 0.95, 0.09, 0.72, 0, 0.18, 0, false);
    addM(g, GEO.box, straw, 0.10, 0.10, -0.06, 0.68, 0.08, 0.52, 0, -0.22, 0, false);
    return g;
  }

  if (kind === "bucket") {
    /* Тюремная бадья */
    addM(g, GEO.taperBucket, woodDark, 0, 0.16, 0, 0.16, 0.32, 0.16);
    addM(g, GEO.cyl8, iron, 0, 0.24, 0, 0.165, 0.025, 0.165);
    return g;
  }

  return g;
}

function woodAgedMat() {
  return getMat(PALETTE.woodAged, { roughness: 0.85 });
}

/* ---------- Цельная кованая 3D-клетка от стены до стены с шарнирной дверцей ---------- */
export function buildJailCellPartition3D() {
  const group = new THREE.Group();
  const iron = getMat(PALETTE.ironForged, { metalness: 0.56, roughness: 0.44 });
  const steel = getMat(PALETTE.steelDark, { metalness: 0.60, roughness: 0.38 });
  const stone = getMat(PALETTE.stoneDark, { roughness: 0.92 });
  const brass = getMat(PALETTE.brassBuckle, { metalness: 0.62, roughness: 0.36 });

  const xPos = 4.65;
  const zMin = -0.55;
  const zMax = 7.55;
  const doorZ0 = 2.45;
  const doorZ1 = 3.55;
  const height = 2.28;

  /* Сплошной каменный цоколь от задней стены до переднего края — 0 щелей! */
  addM(group, GEO.box, stone, xPos, 0.09, (zMin + doorZ0) * 0.5, 0.24, 0.18, doorZ0 - zMin);
  addM(group, GEO.box, stone, xPos, 0.04, (doorZ0 + doorZ1) * 0.5, 0.22, 0.08, doorZ1 - doorZ0);
  addM(group, GEO.box, stone, xPos, 0.09, (doorZ1 + zMax) * 0.5, 0.24, 0.18, zMax - doorZ1);

  /* Верхняя и нижняя сплошные кованые балки во всю ширину каземата */
  const totalLen = zMax - zMin;
  const zMid = (zMin + zMax) * 0.5;
  addM(group, GEO.box, iron, xPos, height, zMid, 0.11, 0.09, totalLen);
  addM(group, GEO.box, iron, xPos, 0.20, (zMin + doorZ0) * 0.5, 0.09, 0.06, doorZ0 - zMin);
  addM(group, GEO.box, iron, xPos, 1.18, (zMin + doorZ0) * 0.5, 0.09, 0.055, doorZ0 - zMin);
  addM(group, GEO.box, iron, xPos, 0.20, (doorZ1 + zMax) * 0.5, 0.09, 0.06, zMax - doorZ1);
  addM(group, GEO.box, iron, xPos, 1.18, (doorZ1 + zMax) * 0.5, 0.09, 0.055, zMax - doorZ1);

  /* Массивные опорные столбы дверной коробки и краёв */
  [zMin + 0.06, doorZ0, doorZ1, zMax - 0.06].forEach((zp) => {
    addM(group, GEO.box, iron, xPos, height * 0.5, zp, 0.13, height, 0.13);
  });

  /* Непрерывный ряд кованых вертикальных прутьев слева и справа от двери */
  for (let z = zMin + 0.24; z < doorZ0 - 0.12; z += 0.22) {
    addM(group, GEO.cyl6, steel, xPos, height * 0.5 + 0.05, z, 0.024, height - 0.14, 0.024);
  }
  for (let z = doorZ1 + 0.20; z < zMax - 0.12; z += 0.22) {
    addM(group, GEO.cyl6, steel, xPos, height * 0.5 + 0.05, z, 0.024, height - 0.14, 0.024);
  }

  /* Шарнирная решётчатая 3D-дверь клетки на петлях с тяжёлым замком */
  const doorPivot = new THREE.Group();
  doorPivot.position.set(xPos, 0, doorZ0 + 0.05);
  const doorW = doorZ1 - doorZ0 - 0.10;
  const doorH = height - 0.14;

  addM(doorPivot, GEO.box, iron, 0, doorH, doorW * 0.5, 0.08, 0.065, doorW);
  addM(doorPivot, GEO.box, iron, 0, 0.14, doorW * 0.5, 0.08, 0.065, doorW);
  addM(doorPivot, GEO.box, iron, 0, doorH * 0.52, doorW * 0.5, 0.08, 0.055, doorW);
  addM(doorPivot, GEO.box, iron, 0, doorH * 0.5 + 0.06, doorW - 0.03, 0.085, doorH, 0.075);

  for (let dz = 0.16; dz < doorW - 0.08; dz += 0.19) {
    addM(doorPivot, GEO.cyl6, steel, 0, doorH * 0.5 + 0.06, dz, 0.022, doorH - 0.08, 0.022);
  }
  /* Накладной кованый замок со скважиной */
  addM(doorPivot, GEO.box, iron, 0.04, 1.05, doorW - 0.10, 0.11, 0.20, 0.16);
  addM(doorPivot, GEO.box, brass, 0.08, 1.05, doorW - 0.10, 0.04, 0.09, 0.08);

  doorPivot.userData.pickTarget = { kind: "jail_door" };
  group.add(doorPivot);
  group.userData.doorPivot = doorPivot;
  return group;
}

/* ---------- Архитектура локации: земля, стены в разрезе и 3D-двери переходов ---------- */
export function buildEnvironment3D(mapOrId, maybeMapOrQuality, maybeState, maybeQuality) {
  let map = mapOrId;
  let qualityProfile = maybeMapOrQuality;
  let state = null;
  if (typeof mapOrId === "string") {
    map = maybeMapOrQuality || { id: mapOrId, outdoor: false, obstacles: [], spots: [], exits: [] };
    state = maybeState || null;
    qualityProfile = typeof maybeQuality === "string" ? { key: maybeQuality } : maybeQuality;
  }
  const root = new THREE.Group();
  const detail = qualityProfile ? (qualityProfile.key || qualityProfile) : "high";
  const doorPivots = {};

  const snowMain = getMat(PALETTE.snowShadow, { roughness: 0.94 });
  const snowPure = getMat(PALETTE.snowPure, { roughness: 0.95 });
  const cobbleA = getMat(PALETTE.stoneMid, { roughness: 0.90 });
  const cobbleB = getMat(PALETTE.stoneDark, { roughness: 0.92 });
  const woodFloor = getMat(PALETTE.woodAged, { roughness: 0.86 });
  const woodBeam = getMat(PALETTE.woodDark, { roughness: 0.88 });
  const logWall = getMat(PALETTE.woodPine, { roughness: 0.86 });
  const iron = getMat(PALETTE.ironForged, { metalness: 0.52, roughness: 0.46 });

  /* 1. Основание земли (широкое поле без чёрных обрывов при панорамировании!) */
  const isOutdoor = !!map.outdoor;
  const groundMat = map.floorKind === "planks" ? woodFloor
    : (map.floorKind === "flagstone" || map.floorKind === "cell_stone") ? cobbleB
    : map.floorKind === "taiga_snow" ? snowPure
    : snowMain;

  const farPlane = addM(root, GEO.box, isOutdoor ? getMat("#697887", { roughness: 0.96 }) : getMat("#121820", { roughness: 0.98 }),
    5.5, -0.26, 3.5, 42, 0.40, 42, 0, 0, 0, false);
  farPlane.userData.isGround = true;

  const stageSlab = addM(root, GEO.box, groundMat, 5.5, -0.05, 3.5, 13.4, 0.10, 9.4, 0, 0, 0, false);
  stageSlab.userData.isGround = true;

  /* Фактура пола: каменные плиты площади / половицы трактира / снежные перемёты */
  if (map.floorKind === "cobble_snow") {
    const step = detail === "low" ? 2 : 1;
    for (let cx = 0; cx <= 11; cx += step) {
      for (let rz = 0; rz <= 7; rz += step) {
        const distCenter = Math.hypot(cx - 5.2, rz - 3.6);
        if (distCenter < 4.6) {
          addM(root, GEO.box, (cx + rz) % 2 ? cobbleA : cobbleB, cx, 0.012, rz, 0.86 * step, 0.024, 0.86 * step, 0, ((cx * 7 + rz * 3) % 5) * 0.03, 0, false);
        } else if ((cx + rz) % 2 === 0) {
          const drift = addM(root, GEO.ico1, snowPure, cx, 0.02, rz, 0.62, 0.055, 0.55, 0, 0, 0, false);
          drift.userData.isFineDetail = true;
        }
      }
    }
  } else if (map.floorKind === "planks") {
    for (let rz = 0; rz <= 7; rz++) {
      addM(root, GEO.box, rz % 2 ? woodFloor : woodBeam, 5.5, 0.008, rz, 12.2, 0.016, 0.05, 0, 0, 0, false);
    }
  } else if (map.floorKind === "flagstone" || map.floorKind === "cell_stone") {
    const step = detail === "low" ? 2 : 1;
    for (let cx = 0; cx <= 11; cx += step) {
      for (let rz = 0; rz <= 7; rz += step) {
        addM(root, GEO.box, (cx * 3 + rz) % 2 ? cobbleA : cobbleB, cx, 0.01, rz, 0.90 * step, 0.02, 0.90 * step, 0, 0, 0, false);
      }
    }
  } else if (map.floorKind === "snow_road" || map.floorKind === "taiga_snow") {
    /* Наезженная зимняя колея / звериная тропа в снегу */
    for (let cx = 0; cx <= 11; cx++) {
      addM(root, GEO.box, getMat(PALETTE.snowTrampled), cx, 0.012, 4.0 + Math.sin(cx * 0.4) * 0.25, 1.05, 0.022, 1.55, 0, 0, 0, false);
    }
  }

  /* 2. Интерьерные стены в разрезе (Cutaway 3D Walls) ИЛИ уличные фасады и частокол */
  if (!isOutdoor) {
    const isTimber = map.wallKind === "timber";
    const wallMat = isTimber ? logWall : cobbleA;
    const wallH = 2.35;

    if (isTimber) {
      /* Бревенчатый северный сруб из отдельных венцов (Трактир «Хромой олень») */
      for (let l = 0; l < 8; l++) {
        const ly = 0.16 + l * 0.28;
        addM(root, GEO.cyl8, l % 2 ? logWall : woodFloor, 5.5, ly, -0.68, 0.145, 12.8, 0.145, 0, 0, Math.PI * 0.5);
        addM(root, GEO.cyl8, l % 2 ? logWall : woodFloor, -0.68, ly, 3.5, 0.145, 8.6, 0.145, Math.PI * 0.5, 0, 0);
      }
    } else {
      /* Каменные стены кузницы и каземата с контрфорсами */
      addM(root, GEO.box, wallMat, 5.5, wallH * 0.5, -0.68, 12.8, wallH, 0.32);
      addM(root, GEO.box, cobbleB, -0.68, wallH * 0.5, 3.5, 0.32, wallH, 8.6);
      for (let p = 0; p <= 11; p += 3) {
        addM(root, GEO.box, cobbleB, p, wallH * 0.5, -0.52, 0.34, wallH + 0.08, 0.36);
      }
    }
    /* Низкий аккуратный передний срез стен (Cutaway rim), обозначающий контур комнаты без заслонения камеры */
    addM(root, GEO.box, woodBeam, 5.5, 0.10, 7.68, 12.8, 0.20, 0.22);
    addM(root, GEO.box, woodBeam, 11.68, 0.10, 1.8, 0.22, 0.20, 5.0);
    addM(root, GEO.box, woodBeam, 11.68, 0.10, 6.7, 0.22, 0.20, 1.9);

    if (map.id === "jail") {
      const cellPartition = buildJailCellPartition3D();
      root.add(cellPartition);
      root.userData.jailPartition = cellPartition;
    }
  } else {
    /* Уличное окружение Брода: частокол на околице и вековые ели по периметру */
    if (map.id === "outskirts") {
      /* Палисад из заострённых брёвен лиственницы с воротами */
      for (let cx = -0.5; cx <= 11.5; cx += 0.34) {
        if (cx > 5.1 && cx < 6.9) { continue; }
        addM(root, GEO.cyl6, logWall, cx, 1.05, -0.55, 0.15, 2.10, 0.15);
        addM(root, GEO.cone6, woodFloor, cx, 2.25, -0.55, 0.15, 0.34, 0.15);
      }
      /* Столбы и перекладина северных ворот */
      addM(root, GEO.box, woodBeam, 5.0, 1.45, -0.55, 0.32, 2.90, 0.32);
      addM(root, GEO.box, woodBeam, 7.0, 1.45, -0.55, 0.32, 2.90, 0.32);
      addM(root, GEO.box, woodBeam, 6.0, 2.72, -0.55, 2.45, 0.28, 0.36);
      addM(root, GEO.box, snowPure, 6.0, 2.89, -0.55, 2.35, 0.07, 0.32, 0, 0, 0, false);
    }

    /* Дальние ели вокруг площадки (количество масштабируется Режимом производительности!) */
    const maxTrees = qualityProfile ? qualityProfile.perimeterTrees : 14;
    const treeRing = [
      [-1.8, -1.5], [1.2, -1.8], [4.5, -1.9], [9.8, -1.7], [12.6, -1.2],
      [-2.0, 1.4], [-1.9, 5.6], [-1.4, 8.5], [2.4, 8.8], [7.6, 8.9],
      [12.8, 3.8], [12.6, 8.2], [5.2, 9.1], [10.4, 8.8]
    ];
    for (let i = 0; i < Math.min(maxTrees, treeRing.length); i++) {
      const [tx, tz] = treeRing[i];
      if (map.id === "square" && i % 2 === 1 && detail === "low") { continue; }
      const pTree = buildProp3D("pine", detail);
      const sc = map.id === "forest" ? (1.05 + (i % 3) * 0.16) : (0.86 + (i % 2) * 0.14);
      pTree.position.set(tx, 0, tz);
      pTree.scale.set(sc, sc, sc);
      pTree.userData.isFineDetail = true;
      root.add(pTree);
    }
  }

  /* 3. Архитектурные порталы и открывающиеся 3D-двери переходов (exits) */
  (map.exits || []).forEach((ex) => {
    const portal = new THREE.Group();
    portal.position.set(ex.col, 0, ex.row);

    /* Ориентация портала вдоль края карты */
    let rotY = 0;
    if (ex.col <= 0.5) { rotY = Math.PI * 0.5; }
    else if (ex.col >= 10.5) { rotY = -Math.PI * 0.5; }
    else if (ex.row <= 0.5) { rotY = 0; }
    else { rotY = Math.PI; }
    portal.rotation.y = rotY;

    if (ex.doorKind === "porch_door") {
      /* Крыльцо Трактира «Хромой олень» со слюдяным тёплым окном и двускатным козырьком */
      addM(portal, GEO.box, logWall, 0, 1.32, -0.45, 2.30, 2.64, 0.56);
      addM(portal, GEO.box, cobbleA, 0, 0.10, 0.12, 1.46, 0.20, 0.64);
      addM(portal, GEO.box, woodBeam, -0.56, 1.05, -0.14, 0.16, 2.10, 0.20);
      addM(portal, GEO.box, woodBeam, 0.56, 1.05, -0.14, 0.16, 2.10, 0.20);
      addM(portal, GEO.box, woodBeam, 0, 2.06, -0.14, 1.36, 0.18, 0.24);
      /* Козырёк под снегом */
      addM(portal, GEO.box, getMat(PALETTE.slateRoof), 0, 2.32, 0.08, 1.78, 0.09, 0.72, 0.28, 0, 0);
      addM(portal, GEO.box, snowPure, 0, 2.38, 0.06, 1.66, 0.05, 0.60, 0.28, 0, 0, false);
      /* Светящееся тёплое окошко трактира */
      addM(portal, GEO.box, getMat("#f0a64b", { emissive: "#e38b2c", emissiveIntensity: 1.35 }), 0.84, 1.38, -0.16, 0.38, 0.44, 0.06, 0, 0, 0, false);

      const leafPivot = new THREE.Group();
      leafPivot.position.set(-0.46, 0.20, -0.14);
      addM(leafPivot, GEO.box, woodFloor, 0.46, 0.88, 0, 0.92, 1.76, 0.09);
      addM(leafPivot, GEO.box, iron, 0.44, 1.36, 0.05, 0.82, 0.06, 0.03);
      addM(leafPivot, GEO.box, iron, 0.44, 0.42, 0.05, 0.82, 0.06, 0.03);
      addM(leafPivot, GEO.cyl8, iron, 0.78, 0.90, 0.07, 0.05, 0.02, 0.05, Math.PI * 0.5, 0, 0);
      portal.add(leafPivot);
      doorPivots[ex.to] = leafPivot;
    } else if (ex.doorKind === "forge_arch") {
      /* Каменный портал Кузницы Тарна с отблеском горна внутри */
      addM(portal, GEO.box, cobbleA, 0, 1.28, -0.42, 2.20, 2.56, 0.58);
      addM(portal, GEO.box, cobbleB, -0.62, 1.05, -0.08, 0.28, 2.10, 0.28);
      addM(portal, GEO.box, cobbleB, 0.62, 1.05, -0.08, 0.28, 2.10, 0.28);
      addM(portal, GEO.box, cobbleB, 0, 2.12, -0.08, 1.56, 0.26, 0.34);
      addM(portal, GEO.box, getMat(PALETTE.slateRoof), 0, 2.48, -0.32, 2.36, 0.22, 0.86);
      addM(portal, GEO.box, getMat("#ff7426", { emissive: "#d94f14", emissiveIntensity: 0.95 }), 0, 0.98, -0.18, 0.94, 1.88, 0.05, 0, 0, 0, false);

      const leafPivot = new THREE.Group();
      leafPivot.position.set(-0.48, 0.06, -0.06);
      addM(leafPivot, GEO.box, woodBeam, 0.24, 0.94, 0, 0.48, 1.88, 0.08);
      leafPivot.rotation.y = -0.55;
      portal.add(leafPivot);
      doorPivots[ex.to] = leafPivot;
    } else if (ex.doorKind === "inner_door") {
      /* Внутренняя окованная дверь выхода на площадь */
      addM(portal, GEO.box, woodBeam, -0.54, 1.04, 0, 0.16, 2.08, 0.22);
      addM(portal, GEO.box, woodBeam, 0.54, 1.04, 0, 0.16, 2.08, 0.22);
      addM(portal, GEO.box, woodBeam, 0, 2.06, 0, 1.28, 0.16, 0.24);
      const leafPivot = new THREE.Group();
      leafPivot.position.set(-0.45, 0.06, 0);
      addM(leafPivot, GEO.box, woodFloor, 0.45, 0.94, 0, 0.90, 1.88, 0.09);
      addM(leafPivot, GEO.box, iron, 0.44, 1.42, 0.05, 0.82, 0.06, 0.03);
      addM(leafPivot, GEO.box, iron, 0.44, 0.46, 0.05, 0.82, 0.06, 0.03);
      portal.add(leafPivot);
      doorPivots[ex.to] = leafPivot;
    } else {
      /* Дорожный столб-указатель / тропа перехода (Околица, Опушка тайги) */
      addM(portal, GEO.cyl6, woodBeam, -0.55, 0.78, 0, 0.08, 1.56, 0.08);
      addM(portal, GEO.box, woodFloor, -0.32, 1.28, 0, 0.58, 0.20, 0.06, 0, 0.15, 0);
      addM(portal, GEO.ico0, cobbleA, 0.52, 0.16, 0, 0.24, 0.20, 0.22);
    }

    /* Метка для 3D-рейкастера переходов */
    portal.traverse((child) => {
      child.userData.pickTarget = {
        kind: "exit",
        exitTo: ex.to,
        label: ex.label,
        col: ex.col,
        row: ex.row
      };
    });
    root.add(portal);
  });

  /* Маркер чтения в сцене: подсветка конуса зрения сторожа */
  if (map.id === "jail") {
    const coneGeo = new THREE.ConeGeometry(1.45, 3.4, 16, 1, true);
    const coneMesh = new THREE.Mesh(coneGeo, getBasicMat("#e06848", 0.16, true));
    coneMesh.rotation.set(Math.PI * 0.5, 0, 0);
    coneMesh.position.set(0, 0.05, 1.7);
    const coneWrap = new THREE.Group();
    coneWrap.add(coneMesh);
    root.add(coneWrap);
    root.userData.guardVisionCone = coneWrap;
  }

  root.userData.doorPivots = doorPivots;
  root.root = root;
  if (root.userData.jailPartition && root.userData.jailPartition.userData.doorPivot) {
    const dp = root.userData.jailPartition.userData.doorPivot;
    if (state && state.jail && (state.jail.unlocked || state.jail.escaped)) {
      dp.rotation.y = 1.32;
    }
    root.jailDoor = { pivot: dp, partition: root.userData.jailPartition };
  }
  return root;
}
