/* ============================================================
   BOW 3D HUMANOID — Шарнирные гранёные 3D-персонажи уровня эталона
   наёмника (image-43), отдельная женская 3D-анатомия (Лива, Сигрид, ЖГГ),
   честная послойная одежда как в Kenshi (снял всё -> в труханах и босиком),
   поворот на 360° и видимое отрубание конечностей с 3D-культями (0.0.9.3).
   ============================================================ */
import * as THREE from "three";
import { getMat, PALETTE } from "./materials.js";

/* Переиспользуемые примитивы со скульптурной огранкой */
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  taperLimb: new THREE.CylinderGeometry(1, 0.80, 1, 7),
  taperTorsoM: new THREE.CylinderGeometry(1.08, 0.86, 1, 8),
  taperTorsoF: new THREE.CylinderGeometry(0.90, 0.72, 1, 8),
  skirtCone: new THREE.CylinderGeometry(0.74, 1.28, 1, 10),
  ico1: new THREE.IcosahedronGeometry(1, 1),
  octa: new THREE.OctahedronGeometry(1, 0),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  cone8: new THREE.ConeGeometry(1, 1, 8),
  hemi8: new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55),
  disc10: new THREE.CylinderGeometry(1, 1, 1, 10)
};

function addPart(parent, geo, mat, px, py, pz, sx, sy, sz, rx = 0, ry = 0, rz = 0, castShadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(px, py, pz);
  m.scale.set(sx, sy, sz);
  if (rx || ry || rz) { m.rotation.set(rx, ry, rz); }
  m.castShadow = castShadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cleanId(id) {
  return String(id || "").replace(/^item:/, "");
}

/* ---------- 3D-генератор средневекового оружия и щитов ---------- */
export function buildWeapon3D(weaponKind, isHolstered = false) {
  const kind = cleanId(weaponKind);
  const g = new THREE.Group();
  if (!kind || kind === "none") { return g; }

  const steel = getMat(PALETTE.steelBright, { metalness: 0.62, roughness: 0.34 });
  const steelEdge = getMat(PALETTE.steelEdge, { metalness: 0.72, roughness: 0.26 });
  const iron = getMat(PALETTE.ironForged, { metalness: 0.48, roughness: 0.52 });
  const brass = getMat(PALETTE.brassBuckle, { metalness: 0.58, roughness: 0.38 });
  const wood = getMat(PALETTE.woodAged, { roughness: 0.85 });
  const leather = getMat(PALETTE.leatherDark, { roughness: 0.82 });

  if (kind === "sword") {
    /* Северный тесак / меч хладцев с центральным долом, крестовиной и яблоком (эталон image-43) */
    addPart(g, GEO.cyl6, leather, 0, -0.05, 0, 0.022, 0.16, 0.026);
    addPart(g, GEO.octa, iron, 0, -0.145, 0, 0.036, 0.036, 0.032);
    addPart(g, GEO.box, iron, 0, 0.035, 0, 0.19, 0.026, 0.038);
    if (isHolstered) {
      /* Ножны с металлическим устьем и бутеролью */
      addPart(g, GEO.box, leather, 0, 0.39, 0, 0.068, 0.68, 0.030);
      addPart(g, GEO.box, brass, 0, 0.08, 0, 0.074, 0.04, 0.034);
      addPart(g, GEO.cone6, brass, 0, 0.77, 0, 0.036, 0.09, 0.020);
    } else {
      addPart(g, GEO.box, steelEdge, 0, 0.39, 0, 0.062, 0.68, 0.016);
      /* Тёмный дол по центру клинка */
      addPart(g, GEO.box, iron, 0, 0.34, 0, 0.020, 0.50, 0.020);
      addPart(g, GEO.cone6, steelEdge, 0, 0.79, 0, 0.034, 0.13, 0.012);
    }
  } else if (kind === "axe") {
    /* Северный плотницкий / боевой топор с бородой и обухом */
    addPart(g, GEO.cyl6, wood, 0, 0.22, 0, 0.023, 0.66, 0.028);
    addPart(g, GEO.box, leather, 0, -0.02, 0, 0.052, 0.15, 0.054);
    addPart(g, GEO.box, iron, 0.01, 0.47, 0, 0.09, 0.10, 0.048);
    addPart(g, GEO.box, steel, 0.095, 0.45, 0, 0.13, 0.18, 0.024, 0, 0, -0.10);
    addPart(g, GEO.box, steelEdge, 0.155, 0.445, 0, 0.032, 0.21, 0.012, 0, 0, -0.06);
  } else if (kind === "knife") {
    /* Кованый северный скрамасакс / нож */
    addPart(g, GEO.cyl6, wood, 0, -0.03, 0, 0.020, 0.13, 0.024);
    addPart(g, GEO.box, brass, 0, 0.038, 0, 0.065, 0.018, 0.032);
    if (isHolstered) {
      addPart(g, GEO.box, leather, 0, 0.19, 0, 0.048, 0.29, 0.026);
    } else {
      addPart(g, GEO.box, steelEdge, 0, 0.18, 0, 0.040, 0.27, 0.013);
      addPart(g, GEO.cone6, steelEdge, 0, 0.35, 0, 0.022, 0.08, 0.010);
    }
  } else if (kind === "club") {
    /* Окованная дубина с железными обручами */
    addPart(g, GEO.taperLimb, wood, 0, 0.24, 0, 0.046, 0.64, 0.046, Math.PI, 0, 0);
    addPart(g, GEO.cyl8, iron, 0, 0.38, 0, 0.052, 0.038, 0.052);
    addPart(g, GEO.cyl8, iron, 0, 0.49, 0, 0.056, 0.038, 0.056);
    addPart(g, GEO.octa, iron, 0.055, 0.49, 0, 0.026, 0.022, 0.022);
    addPart(g, GEO.octa, iron, -0.055, 0.38, 0, 0.026, 0.022, 0.022);
  } else if (kind === "spear") {
    /* Северная рогатина с перекладиной */
    addPart(g, GEO.cyl6, wood, 0, 0.36, 0, 0.022, 1.48, 0.022);
    addPart(g, GEO.box, iron, 0, 1.07, 0, 0.14, 0.022, 0.028);
    addPart(g, GEO.cone6, steelEdge, 0, 1.24, 0, 0.042, 0.32, 0.018);
  } else if (kind === "bow") {
    /* Составной таёжный лук с тетивой */
    addPart(g, GEO.box, wood, 0.04, 0.22, 0, 0.028, 0.38, 0.030, 0, 0, 0.18);
    addPart(g, GEO.box, wood, 0.04, -0.14, 0, 0.028, 0.38, 0.030, 0, 0, -0.18);
    addPart(g, GEO.box, leather, 0.07, 0.04, 0, 0.034, 0.12, 0.034);
    addPart(g, GEO.cyl6, getMat(PALETTE.linenLight), -0.03, 0.04, 0, 0.004, 0.72, 0.004);
  } else if (kind === "crossbow") {
    /* Осадный самострел */
    addPart(g, GEO.box, wood, 0, 0.16, 0, 0.052, 0.56, 0.068);
    addPart(g, GEO.box, steel, 0, 0.41, 0, 0.54, 0.030, 0.022);
    addPart(g, GEO.cyl6, getMat(PALETTE.linenLight), 0, 0.27, 0.02, 0.005, 0.50, 0.005, 0, 0, Math.PI * 0.5);
  } else if (kind === "hammer") {
    /* Кузнечный ручник Тарна */
    addPart(g, GEO.cyl6, wood, 0, 0.14, 0, 0.022, 0.42, 0.022);
    addPart(g, GEO.box, iron, 0, 0.34, 0, 0.16, 0.078, 0.078);
  }

  return g;
}

export function buildShield3D(shieldKind) {
  const kind = cleanId(shieldKind);
  const g = new THREE.Group();
  if (!kind) { return g; }

  const wood = getMat(PALETTE.woodPlank, { roughness: 0.84 });
  const woodAlt = getMat(PALETTE.woodAged, { roughness: 0.86 });
  const iron = getMat(PALETTE.steelDark, { metalness: 0.50, roughness: 0.46 });
  const steel = getMat(PALETTE.steelBright, { metalness: 0.66, roughness: 0.32 });

  if (kind === "heater_shield") {
    /* Треугольный окованный щит ратника / стражи */
    addPart(g, GEO.box, wood, 0, 0.05, 0, 0.34, 0.30, 0.032);
    addPart(g, GEO.cone6, woodAlt, 0, -0.18, 0, 0.19, 0.24, 0.030, Math.PI, 0, 0);
    addPart(g, GEO.box, iron, 0, 0.20, 0.004, 0.36, 0.032, 0.040);
    addPart(g, GEO.box, iron, -0.165, 0.04, 0.004, 0.030, 0.31, 0.040);
    addPart(g, GEO.box, iron, 0.165, 0.04, 0.004, 0.030, 0.31, 0.040);
    addPart(g, GEO.hemi8, steel, 0, 0.03, 0.022, 0.075, 0.075, 0.055, Math.PI * 0.5, 0, 0);
  } else {
    /* Круглый дубовый щит из досок со стальным ободом и умбоном (эталон image-43) */
    addPart(g, GEO.disc10, iron, 0, 0, 0, 0.235, 0.028, 0.235, Math.PI * 0.5, 0, 0);
    addPart(g, GEO.disc10, wood, 0, 0, 0.006, 0.205, 0.026, 0.205, Math.PI * 0.5, 0, 0);
    /* Полосы досок и поперечная скоба */
    addPart(g, GEO.box, woodAlt, -0.07, 0, 0.018, 0.045, 0.36, 0.012);
    addPart(g, GEO.box, woodAlt, 0.07, 0, 0.018, 0.045, 0.36, 0.012);
    addPart(g, GEO.box, iron, 0, 0, 0.020, 0.38, 0.030, 0.014);
    addPart(g, GEO.hemi8, steel, 0, 0, 0.026, 0.068, 0.068, 0.052, Math.PI * 0.5, 0, 0);
  }
  return g;
}

/* ---------- Скульптурная голова с мужской/женской анатомией ---------- */
function buildHead3D(headGroup, opts) {
  const female = !!opts.female;
  const roleKey = opts.roleKey || "villager";
  const headGear = cleanId(opts.headGear);
  const skin = getMat(female ? PALETTE.skinFemale : PALETTE.skinMale, { roughness: 0.78 });

  /* Череп и челюсть */
  if (female) {
    /* Изящный овальный женский череп с мягкими скулами и аккуратным подбородком */
    addPart(headGroup, GEO.ico1, skin, 0, 0.115, 0, 0.098, 0.112, 0.102);
    addPart(headGroup, GEO.cone8, skin, 0, 0.052, 0.012, 0.076, 0.088, 0.082, Math.PI, 0, 0);
    /* Тонкий прямой носик */
    addPart(headGroup, GEO.cone6, skin, 0, 0.098, 0.098, 0.016, 0.046, 0.024, Math.PI * 0.42, 0, 0);
  } else {
    /* Мужской гранёный череп с выраженными скулами, надбровной дугой и волевой челюстью (image-43) */
    addPart(headGroup, GEO.ico1, skin, 0, 0.122, -0.004, 0.106, 0.116, 0.108);
    addPart(headGroup, GEO.box, skin, 0, 0.060, 0.012, 0.138, 0.084, 0.132);
    /* Надбровная грань и переносица */
    addPart(headGroup, GEO.box, skin, 0, 0.132, 0.084, 0.124, 0.026, 0.042);
    addPart(headGroup, GEO.cone6, skin, 0, 0.098, 0.106, 0.021, 0.055, 0.030, Math.PI * 0.42, 0, 0);
  }
  /* Уши */
  addPart(headGroup, GEO.box, skin, -0.098, 0.104, -0.005, 0.020, 0.042, 0.030);
  addPart(headGroup, GEO.box, skin, 0.098, 0.104, -0.005, 0.020, 0.042, 0.030);

  /* Цвет волос */
  let hairHex = "#3a2b20";
  if (roleKey === "innkeeper") { hairHex = "#6c5947"; } // Сигрид — русая с благородной проседью
  else if (female && roleKey === "villager") { hairHex = "#7b4e31"; } // Лива — тёплая каштаново-рыжеватая коса
  else if (roleKey === "smith") { hairHex = "#2a2320"; } // Тарн — смоляная с сединой
  else if (roleKey === "hunter") { hairHex = "#5e462e"; } // Брор — русый северянин
  const hairMat = getMat(hairHex, { roughness: 0.88 });

  /* Борода и усы у мужчин (кроме безусых юношей) */
  if (!female) {
    if (roleKey === "smith") {
      /* Густая широкая кузнечная борода Тарна */
      addPart(headGroup, GEO.box, hairMat, 0, 0.032, 0.056, 0.148, 0.095, 0.105);
      addPart(headGroup, GEO.cone6, hairMat, 0, -0.025, 0.068, 0.072, 0.09, 0.055, Math.PI, 0, 0);
      addPart(headGroup, GEO.box, hairMat, 0, 0.074, 0.098, 0.092, 0.024, 0.032);
    } else if (roleKey === "hunter" || roleKey === "guard") {
      /* Северная окладистая борода и усы */
      addPart(headGroup, GEO.box, hairMat, 0, 0.038, 0.052, 0.142, 0.074, 0.098);
      addPart(headGroup, GEO.box, hairMat, 0, 0.074, 0.096, 0.088, 0.022, 0.030);
    } else if (roleKey !== "prisoner") {
      /* Короткая дорожная бородка и усы наёмника (как на эталоне image-43) */
      addPart(headGroup, GEO.box, hairMat, 0, 0.036, 0.050, 0.138, 0.056, 0.094);
      addPart(headGroup, GEO.box, hairMat, 0, 0.072, 0.094, 0.082, 0.020, 0.026);
    }
  }

  /* Шлемы, капюшоны и причёски */
  if (headGear === "iron_helm" || roleKey === "guard") {
    /* Клёпаный северный шишак с наносником и бармицей */
    const helmSteel = getMat(PALETTE.steelBright, { metalness: 0.62, roughness: 0.36 });
    const helmRim = getMat(PALETTE.steelDark, { metalness: 0.55, roughness: 0.44 });
    const mail = getMat(PALETTE.chainmailSteel, { metalness: 0.45, roughness: 0.56 });
    addPart(headGroup, GEO.hemi8, helmSteel, 0, 0.125, -0.004, 0.118, 0.135, 0.122);
    addPart(headGroup, GEO.cyl8, helmRim, 0, 0.126, -0.004, 0.121, 0.026, 0.125);
    /* Наносник */
    addPart(headGroup, GEO.box, helmSteel, 0, 0.106, 0.112, 0.022, 0.078, 0.018);
    /* Кольчужная бармица на затылке и шее */
    addPart(headGroup, GEO.cyl8, mail, 0, 0.058, -0.024, 0.112, 0.11, 0.105);
  } else if (headGear === "hood") {
    const hoodMat = getMat(PALETTE.woolSlate, { roughness: 0.90 });
    addPart(headGroup, GEO.ico1, hoodMat, 0, 0.126, -0.012, 0.124, 0.134, 0.130);
    addPart(headGroup, GEO.cone6, hoodMat, 0, 0.155, -0.10, 0.065, 0.14, 0.065, -0.9, 0, 0);
  } else if (female) {
    /* Женские объёмные причёски (Сигрид, Лива, ЖГГ) */
    addPart(headGroup, GEO.ico1, hairMat, 0, 0.138, -0.014, 0.108, 0.115, 0.114);
    /* Мягкие женские пряди, обрамляющие лицо с двух сторон */
    addPart(headGroup, GEO.box, hairMat, -0.088, 0.075, 0.036, 0.032, 0.125, 0.044, 0.08, 0, 0.08);
    addPart(headGroup, GEO.box, hairMat, 0.088, 0.075, 0.036, 0.032, 0.125, 0.044, 0.08, 0, -0.08);

    if (roleKey === "innkeeper") {
      /* Сигрид: собранный женский пучок на затылке + светлый северный головной платок-обруч */
      const kerchief = getMat(PALETTE.apronCream, { roughness: 0.86 });
      addPart(headGroup, GEO.ico1, hairMat, 0, 0.135, -0.118, 0.066, 0.066, 0.066);
      addPart(headGroup, GEO.hemi8, kerchief, 0, 0.138, -0.018, 0.114, 0.105, 0.118, -0.22, 0, 0);
      addPart(headGroup, GEO.cyl8, getMat(PALETTE.scarfCrimson), 0, 0.142, -0.008, 0.113, 0.020, 0.116, -0.12, 0, 0);
    } else if (roleKey === "villager") {
      /* Лива: длинная густая коса, перекинутая вперёд через правое плечо */
      addPart(headGroup, GEO.ico1, hairMat, 0.03, 0.10, -0.105, 0.056, 0.058, 0.056);
      addPart(headGroup, GEO.cyl6, hairMat, 0.095, -0.03, 0.055, 0.032, 0.24, 0.032, 0.38, 0, -0.18);
      addPart(headGroup, GEO.cone6, hairMat, 0.112, -0.15, 0.095, 0.024, 0.08, 0.024, Math.PI + 0.35, 0, 0);
    } else {
      /* ЖГГ: длинная походная северная коса вдоль спины */
      addPart(headGroup, GEO.cyl6, hairMat, 0, 0.01, -0.112, 0.034, 0.26, 0.034, -0.14, 0, 0);
      addPart(headGroup, GEO.cone6, hairMat, 0, -0.13, -0.128, 0.024, 0.08, 0.024, Math.PI - 0.14, 0, 0);
    }
  } else {
    /* Мужская объёмная шевелюра из скульптурных прядей (эталон image-43) */
    addPart(headGroup, GEO.ico1, hairMat, 0, 0.144, -0.014, 0.112, 0.106, 0.118);
    addPart(headGroup, GEO.box, hairMat, 0, 0.175, 0.035, 0.135, 0.044, 0.095, -0.18, 0, 0);
    addPart(headGroup, GEO.box, hairMat, -0.086, 0.128, -0.01, 0.042, 0.096, 0.115);
    addPart(headGroup, GEO.box, hairMat, 0.086, 0.128, -0.01, 0.042, 0.096, 0.115);
    addPart(headGroup, GEO.box, hairMat, 0, 0.092, -0.096, 0.146, 0.115, 0.045);
  }
}

/* ---------- Построение перевязанной 3D-культи на месте отсечённой конечности ---------- */
function attachStump3D(joint, radius, yOffset) {
  const bandage = getMat(PALETTE.bandage, { roughness: 0.90 });
  const blood = getMat(PALETTE.bloodFresh, { roughness: 0.62 });
  addPart(joint, GEO.cyl8, bandage, 0, yOffset, 0, radius * 1.08, 0.095, radius * 1.08);
  addPart(joint, GEO.hemi8, blood, 0, yOffset - 0.046, 0, radius * 0.96, 0.045, radius * 0.96, Math.PI, 0, 0);
}

/* ---------- Сборка полной шарнирной 3D-фигуры человека ---------- */
export function createHumanoid3D(spec = {}) {
  const female = !!(spec.female || spec.sex === "f");
  const roleKey = spec.roleKey || "villager";
  const armorId = cleanId(spec.armor);
  const headId = cleanId(spec.headGear);
  const handsId = cleanId(spec.handsGear);
  const legsId = cleanId(spec.legsGear);
  const bootsId = cleanId(spec.bootsGear);
  const weaponId = cleanId(spec.weapon);
  const holsteredId = cleanId(spec.holsteredWeapon);
  const shieldId = cleanId(spec.shield);
  const severed = spec.severed || {};

  /* Честная проверка одежды Kenshi: если слот пуст, часть тела остаётся в исподнем / босиком */
  const bareTorso = spec.bareTorso !== undefined ? !!spec.bareTorso : !armorId;
  const bareLegs = spec.bareLegs !== undefined ? !!spec.bareLegs : !legsId;
  const bareFeet = spec.bareFeet !== undefined ? !!spec.bareFeet : !bootsId;

  const skin = getMat(female ? PALETTE.skinFemale : PALETTE.skinMale, { roughness: 0.78 });
  const underMat = getMat(PALETTE.undergarment, { roughness: 0.92 });
  const beltMat = getMat(PALETTE.leatherBelt, { roughness: 0.80 });
  const pouchMat = getMat(PALETTE.leatherMid, { roughness: 0.82 });
  const buckleMat = getMat(PALETTE.brassBuckle, { metalness: 0.60, roughness: 0.36 });

  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  /* Пропорции мужского и женского скелета */
  const widthScale = roleKey === "smith" ? 1.12 : (female ? 0.92 : 1.0);
  const hipY = female ? 0.87 : 0.89;
  const shoulderSpan = female ? 0.188 : (roleKey === "smith" ? 0.258 : 0.236);
  const hipSpan = female ? 0.106 : 0.098;

  const pelvis = new THREE.Group();
  pelvis.position.set(0, hipY, 0);
  bodyPivot.add(pelvis);

  const torso = new THREE.Group();
  torso.position.set(0, 0.06, 0);
  pelvis.add(torso);

  /* 1. ТАЗ И ИСПОДНЕЕ («в труханах», когда сняты штаны/доспех) */
  const hipGeoW = female ? 0.168 : 0.152 * widthScale;
  addPart(pelvis, GEO.cyl8, bareLegs ? underMat : getMat(
    legsId === "greaves" ? PALETTE.leatherDark : (legsId === "wool_trousers" ? PALETTE.woolSlate : PALETTE.linenWarm)
  ), 0, 0.01, 0, hipGeoW, 0.145, female ? 0.125 : 0.115);

  /* 2. ТОРС, ЖЕНСКАЯ ГРУДЬ, ОДЕЖДА И ДОСПЕХИ */
  const isNpcDress = female && !spec.isPlayer && (roleKey === "villager" || roleKey === "innkeeper") && (!armorId || armorId === "linen_shirt");

  if (bareTorso) {
    /* Обнажённый торс в исподнем (Kenshi-режим при снятой рубахе и броне) */
    addPart(torso, female ? GEO.taperTorsoF : GEO.taperTorsoM, skin, 0, 0.22, 0, 0.165 * widthScale, 0.42, 0.112);
    /* Ключицы и грудные грани */
    if (female) {
      /* Скромная льняная нагрудная повязка поверх женского бюста */
      addPart(torso, GEO.cyl8, underMat, 0, 0.26, 0.012, 0.155, 0.125, 0.118);
      addPart(torso, GEO.ico1, underMat, -0.056, 0.265, 0.086, 0.058, 0.055, 0.056);
      addPart(torso, GEO.ico1, underMat, 0.056, 0.265, 0.086, 0.058, 0.055, 0.056);
    } else {
      addPart(torso, GEO.box, skin, -0.068 * widthScale, 0.29, 0.062, 0.115 * widthScale, 0.12, 0.075);
      addPart(torso, GEO.box, skin, 0.068 * widthScale, 0.29, 0.062, 0.115 * widthScale, 0.12, 0.075);
    }
  } else if (isNpcDress) {
    /* Выразительное женское северное платье для Ливы и Сигрид! */
    const dressHex = roleKey === "innkeeper" ? PALETTE.woolTeal : PALETTE.woolPlum;
    const dressMat = getMat(dressHex, { roughness: 0.88 });
    addPart(torso, GEO.taperTorsoF, dressMat, 0, 0.22, 0, 0.168, 0.42, 0.118);
    /* Женский рельеф груди */
    addPart(torso, GEO.ico1, dressMat, -0.056, 0.268, 0.088, 0.062, 0.058, 0.062);
    addPart(torso, GEO.ico1, dressMat, 0.056, 0.268, 0.088, 0.062, 0.058, 0.062);
    /* Длинная расклешённая северная юбка в пол со складками */
    addPart(pelvis, GEO.skirtCone, dressMat, 0, -0.34, 0, 0.215, 0.72, 0.185);
    /* Талия с вышитым кушаком */
    addPart(torso, GEO.cyl8, getMat(PALETTE.scarfCrimson), 0, 0.02, 0, 0.156, 0.055, 0.118);

    if (roleKey === "innkeeper") {
      /* Сигрид: светлый льняной передник трактирщицы и тёплая шаль на плечах */
      const apron = getMat(PALETTE.apronCream, { roughness: 0.86 });
      addPart(pelvis, GEO.box, apron, 0, -0.30, 0.145, 0.22, 0.56, 0.022, -0.10, 0, 0);
      addPart(torso, GEO.box, apron, 0, 0.18, 0.108, 0.16, 0.22, 0.018);
      addPart(torso, GEO.cyl8, getMat(PALETTE.linenWarm), 0, 0.37, -0.008, 0.205, 0.095, 0.145);
    } else {
      /* Лива: богатый меховой воротник купчихи и кожаный кошель на поясе */
      const fur = getMat(PALETTE.furLight, { roughness: 0.94 });
      addPart(torso, GEO.cyl8, fur, 0, 0.39, 0.005, 0.205, 0.088, 0.152);
      addPart(pelvis, GEO.box, pouchMat, 0.16, 0.02, 0.06, 0.065, 0.085, 0.055);
    }
  } else if (armorId === "brigandine") {
    /* ЭТАЛОН image-43: Клёпаная бригантина со стальными заклёпками, портупеей, наплечниками и тассетами */
    const brigMat = getMat(PALETTE.brigandineBody, { roughness: 0.72 });
    const rivetMat = getMat(PALETTE.steelBright, { metalness: 0.70, roughness: 0.30 });
    const trimMat = getMat(PALETTE.leatherDark, { roughness: 0.80 });
    addPart(torso, female ? GEO.taperTorsoF : GEO.taperTorsoM, brigMat, 0, 0.225, 0, 0.188 * widthScale, 0.44, 0.134);
    if (female) {
      addPart(torso, GEO.ico1, brigMat, -0.058, 0.27, 0.095, 0.062, 0.058, 0.058);
      addPart(torso, GEO.ico1, brigMat, 0.058, 0.27, 0.095, 0.062, 0.058, 0.058);
    }
    /* Шейный платок воина (как на эталоне image-43) */
    addPart(torso, GEO.cyl8, getMat(PALETTE.scarfCrimson), 0, 0.425, 0.008, 0.108, 0.065, 0.105);
    /* Диагональная портупея через грудь и спину */
    addPart(torso, GEO.box, beltMat, 0, 0.23, 0.118, 0.042, 0.42, 0.024, 0, 0, 0.58);
    addPart(torso, GEO.box, beltMat, 0, 0.23, -0.115, 0.042, 0.42, 0.024, 0, 0, -0.58);
    addPart(torso, GEO.box, buckleMat, -0.03, 0.26, 0.130, 0.046, 0.046, 0.018, 0, 0, 0.58);
    /* Стальные заклёпки бригантины рядами */
    for (let ry = 0; ry < 3; ry++) {
      for (let rx = -1; rx <= 1; rx += 2) {
        addPart(torso, GEO.octa, rivetMat, rx * 0.072, 0.13 + ry * 0.10, 0.126, 0.012, 0.012, 0.012, 0, 0, 0, false);
      }
    }
    /* Клёпаная юбка-тассеты (разрезные набедренники) и широкий пояс с подсумками */
    addPart(torso, GEO.cyl8, beltMat, 0, 0.02, 0, 0.184 * widthScale, 0.055, 0.138);
    addPart(torso, GEO.box, buckleMat, 0, 0.02, 0.136, 0.052, 0.052, 0.020);
    addPart(pelvis, GEO.box, brigMat, -0.095, -0.07, 0.055, 0.12, 0.18, 0.09, -0.08, 0, 0.08);
    addPart(pelvis, GEO.box, brigMat, 0.095, -0.07, 0.055, 0.12, 0.18, 0.09, -0.08, 0, -0.08);
    addPart(pelvis, GEO.box, trimMat, 0, -0.07, -0.085, 0.24, 0.17, 0.05, 0.08, 0, 0);
    addPart(pelvis, GEO.box, pouchMat, -0.165, 0.03, 0.055, 0.058, 0.078, 0.058);
    addPart(pelvis, GEO.box, pouchMat, 0.165, 0.03, 0.045, 0.064, 0.082, 0.058);
  } else if (armorId === "chainmail") {
    /* Кольчужная рубаха поверх поддоспешника */
    const mailMat = getMat(PALETTE.chainmailSteel, { metalness: 0.56, roughness: 0.44 });
    const surcoat = getMat(PALETTE.woolSlate, { roughness: 0.88 });
    addPart(torso, female ? GEO.taperTorsoF : GEO.taperTorsoM, mailMat, 0, 0.225, 0, 0.188 * widthScale, 0.44, 0.134);
    if (female) {
      addPart(torso, GEO.ico1, mailMat, -0.056, 0.27, 0.095, 0.060, 0.056, 0.056);
      addPart(torso, GEO.ico1, mailMat, 0.056, 0.27, 0.095, 0.060, 0.056, 0.056);
    }
    addPart(torso, GEO.cyl8, surcoat, 0, 0.425, 0, 0.112, 0.06, 0.108);
    addPart(torso, GEO.cyl8, beltMat, 0, 0.02, 0, 0.186 * widthScale, 0.055, 0.138);
    addPart(torso, GEO.box, buckleMat, 0, 0.02, 0.136, 0.052, 0.052, 0.020);
    addPart(pelvis, GEO.cyl8, mailMat, 0, -0.065, 0, 0.186 * widthScale, 0.17, 0.136);
    addPart(pelvis, GEO.box, pouchMat, 0.168, 0.03, 0.05, 0.062, 0.080, 0.056);
  } else if (armorId === "padded" || roleKey === "guard") {
    /* Прошитая стёганка (гамбезон) с валиками и высоким воротником */
    const padHex = roleKey === "guard" ? PALETTE.woolSlate : PALETTE.paddedCloth;
    const padMat = getMat(padHex, { roughness: 0.88 });
    addPart(torso, female ? GEO.taperTorsoF : GEO.taperTorsoM, padMat, 0, 0.225, 0, 0.186 * widthScale, 0.44, 0.132);
    if (female) {
      addPart(torso, GEO.ico1, padMat, -0.056, 0.27, 0.094, 0.060, 0.056, 0.056);
      addPart(torso, GEO.ico1, padMat, 0.056, 0.27, 0.094, 0.060, 0.056, 0.056);
    }
    addPart(torso, GEO.cyl8, padMat, 0, 0.428, 0, 0.108, 0.068, 0.104);
    addPart(torso, GEO.cyl8, beltMat, 0, 0.02, 0, 0.182 * widthScale, 0.052, 0.134);
    addPart(torso, GEO.box, buckleMat, 0, 0.02, 0.132, 0.048, 0.048, 0.018);
    addPart(pelvis, GEO.cyl8, padMat, 0, -0.065, 0, 0.184 * widthScale, 0.16, 0.134);
    addPart(pelvis, GEO.box, pouchMat, -0.16, 0.03, 0.05, 0.058, 0.075, 0.054);
  } else {
    /* Базовая посконная рубаха / рабочая куртка (Тарн в кожаном фартуке, Брор в меховом оплечье, ГГ в рубахе и платке) */
    const tunicHex = spec.side === "player" ? PALETTE.woolTeal
      : roleKey === "smith" ? PALETTE.linenWarm
      : roleKey === "hunter" ? PALETTE.woolForest
      : roleKey === "robber" ? PALETTE.woolRust
      : PALETTE.linenLight;
    const tunicMat = getMat(tunicHex, { roughness: 0.90 });
    addPart(torso, female ? GEO.taperTorsoF : GEO.taperTorsoM, tunicMat, 0, 0.22, 0, 0.174 * widthScale, 0.43, 0.122);
    if (female) {
      addPart(torso, GEO.ico1, tunicMat, -0.055, 0.268, 0.088, 0.060, 0.055, 0.056);
      addPart(torso, GEO.ico1, tunicMat, 0.055, 0.268, 0.088, 0.060, 0.055, 0.056);
    }
    /* Воротник / шейный платок */
    if (roleKey === "hunter") {
      addPart(torso, GEO.cyl8, getMat(PALETTE.furTrim), 0, 0.405, -0.005, 0.21, 0.095, 0.155);
    } else if (roleKey === "smith") {
      /* Тяжёлый кожаный фартук кузнеца Тарна с нагрудником и лямками */
      const apronLeather = getMat(PALETTE.leatherDark, { roughness: 0.78 });
      addPart(torso, GEO.box, apronLeather, 0, 0.18, 0.112, 0.24, 0.30, 0.024);
      addPart(pelvis, GEO.box, apronLeather, 0, -0.22, 0.105, 0.27, 0.44, 0.024);
    } else {
      addPart(torso, GEO.cyl8, getMat(spec.side === "player" ? PALETTE.scarfBlue : PALETTE.linenWarm), 0, 0.42, 0.006, 0.104, 0.055, 0.100);
    }
    addPart(torso, GEO.cyl8, beltMat, 0, 0.02, 0, 0.174 * widthScale, 0.048, 0.126);
    addPart(torso, GEO.box, buckleMat, 0, 0.02, 0.124, 0.044, 0.044, 0.018);
    addPart(pelvis, GEO.cyl8, tunicMat, 0, -0.055, 0, 0.176 * widthScale, 0.14, 0.126);
    addPart(pelvis, GEO.box, pouchMat, 0.155 * widthScale, 0.025, 0.045, 0.055, 0.072, 0.050);
  }

  /* 3. ШЕЯ И ГОЛОВА */
  const neck = new THREE.Group();
  neck.position.set(0, 0.435, 0);
  torso.add(neck);
  addPart(neck, GEO.cyl8, skin, 0, 0.035, 0, female ? 0.050 : 0.060, 0.085, female ? 0.050 : 0.060);

  const head = new THREE.Group();
  head.position.set(0, 0.055, 0);
  neck.add(head);
  buildHead3D(head, { female, roleKey, headGear: headId });

  /* 4. РУКИ (плечи, наплечники, локти, наручи, кисти, культи) */
  const sleeveHex = bareTorso ? (female ? PALETTE.skinFemale : PALETTE.skinMale)
    : armorId === "chainmail" ? PALETTE.chainmailSteel
    : armorId === "brigandine" ? PALETTE.woolSlate
    : armorId === "padded" || roleKey === "guard" ? PALETTE.paddedCloth
    : isNpcDress ? (roleKey === "innkeeper" ? PALETTE.woolTeal : PALETTE.woolPlum)
    : spec.side === "player" ? PALETTE.woolTeal : PALETTE.linenLight;
  const sleeveMat = getMat(sleeveHex, { metalness: armorId === "chainmail" ? 0.5 : 0.05, roughness: 0.85 });

  function buildArm(isLeft) {
    const sign = isLeft ? -1 : 1;
    const limbKey = isLeft ? "left_arm" : "right_arm";
    const isLost = !!severed[limbKey];

    const shoulder = new THREE.Group();
    shoulder.position.set(sign * shoulderSpan, 0.39, 0);
    torso.add(shoulder);

    const upperR = female ? 0.048 : (roleKey === "smith" ? 0.066 : 0.056);
    /* Наплечник на бригантине / кольчуге / страже */
    if (!bareTorso && (armorId === "brigandine" || armorId === "chainmail" || roleKey === "guard")) {
      const pauldronMat = armorId === "chainmail"
        ? getMat(PALETTE.steelBright, { metalness: 0.62, roughness: 0.36 })
        : getMat(PALETTE.leatherDark, { roughness: 0.72 });
      addPart(shoulder, GEO.hemi8, pauldronMat, sign * 0.015, -0.01, 0, upperR * 1.48, 0.095, upperR * 1.45, 0, 0, -sign * 0.35);
      addPart(shoulder, GEO.cyl8, getMat(PALETTE.steelBright, { metalness: 0.65, roughness: 0.32 }), sign * 0.015, -0.045, 0, upperR * 1.38, 0.018, upperR * 1.38);
    }

    addPart(shoulder, GEO.taperLimb, sleeveMat, 0, -0.135, 0, upperR, 0.27, upperR);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.265, 0);
    shoulder.add(elbow);

    const handMount = new THREE.Group();
    if (isLost) {
      attachStump3D(elbow, upperR * 0.88, -0.02);
    } else {
      const foreMat = (bareTorso || roleKey === "smith") ? skin : sleeveMat;
      const foreR = upperR * 0.84;
      addPart(elbow, GEO.taperLimb, foreMat, 0, -0.125, 0, foreR, 0.24, foreR);

      /* Наручи и краги (эталон image-43) */
      if (handsId === "splint_bracers" || armorId === "brigandine") {
        const bracerLeather = getMat(PALETTE.leatherDark, { roughness: 0.76 });
        const splintSteel = getMat(PALETTE.steelBright, { metalness: 0.66, roughness: 0.32 });
        addPart(elbow, GEO.cyl8, bracerLeather, 0, -0.145, 0, foreR * 1.15, 0.15, foreR * 1.15);
        addPart(elbow, GEO.box, splintSteel, sign * foreR * 1.05, -0.145, 0.01, 0.014, 0.14, 0.026);
      } else if (handsId === "leather_gloves") {
        addPart(elbow, GEO.cyl8, getMat(PALETTE.leatherMid), 0, -0.17, 0, foreR * 1.14, 0.11, foreR * 1.14);
      }

      const handMat = (handsId === "leather_gloves") ? getMat(PALETTE.leatherDark) : skin;
      addPart(elbow, GEO.box, handMat, 0, -0.265, 0.008, foreR * 1.45, 0.072, foreR * 1.65);
      addPart(elbow, GEO.box, handMat, -sign * foreR * 0.72, -0.255, 0.032, 0.024, 0.042, 0.028, 0.3, 0, 0);

      handMount.position.set(0, -0.275, 0.022);
      elbow.add(handMount);
    }

    return { shoulder, elbow, handMount, isLost };
  }

  const leftArm = buildArm(true);
  const rightArm = buildArm(false);

  /* Оружие в правой руке (или кузнечный молот Тарна в покое) */
  let activeWeaponKind = weaponId;
  if ((!activeWeaponKind || activeWeaponKind === "none") && roleKey === "smith" && !spec.ready && !spec.dead && !spec.down) {
    activeWeaponKind = "hammer";
  }
  if (activeWeaponKind && activeWeaponKind !== "none" && !rightArm.isLost) {
    const wMesh = buildWeapon3D(activeWeaponKind, false);
    if (activeWeaponKind === "bow") {
      wMesh.rotation.set(Math.PI * 0.46, 0, 0);
      leftArm.handMount.add(wMesh);
    } else {
      wMesh.rotation.set(Math.PI * 0.44, 0, 0);
      rightArm.handMount.add(wMesh);
    }
  }

  /* Щит в левой руке */
  if (shieldId && !leftArm.isLost && activeWeaponKind !== "bow" && activeWeaponKind !== "crossbow" && activeWeaponKind !== "spear") {
    const sMesh = buildShield3D(shieldId);
    sMesh.position.set(-0.045, 0.04, 0.035);
    sMesh.rotation.set(0.12, -0.55, 0);
    leftArm.handMount.add(sMesh);
  } else if (shieldId && !leftArm.isLost && activeWeaponKind === "spear") {
    /* Копейщик стражи держит щит на предплечье */
    const sMesh = buildShield3D(shieldId);
    sMesh.position.set(-0.055, 0.06, 0.04);
    sMesh.rotation.set(0.10, -0.62, 0);
    leftArm.handMount.add(sMesh);
  }

  /* Запасное оружие из неактивного слота (честно висит за спиной или в ножнах у пояса!) */
  if (holsteredId && holsteredId !== "none") {
    const holMesh = buildWeapon3D(holsteredId, true);
    if (holsteredId === "spear" || holsteredId === "bow" || holsteredId === "crossbow" || holsteredId === "axe" || holsteredId === "club") {
      holMesh.position.set(-0.06, 0.04, -0.145);
      holMesh.rotation.set(0.08, 0, -0.52);
      torso.add(holMesh);
    } else {
      holMesh.position.set(-0.165 * widthScale, -0.02, -0.02);
      holMesh.rotation.set(-2.35, 0.18, 0.15);
      pelvis.add(holMesh);
    }
  }

  /* Колчан со стрелами/болтами за спиной */
  if (cleanId(spec.offhand) === "arrows" || cleanId(spec.offhand) === "bolts") {
    const quiv = new THREE.Group();
    addPart(quiv, GEO.cyl8, pouchMat, 0.09, 0.22, -0.145, 0.048, 0.36, 0.048, 0.06, 0, -0.32);
    addPart(quiv, GEO.cyl6, getMat(PALETTE.apronCream), 0.135, 0.41, -0.15, 0.034, 0.09, 0.034, 0, 0, -0.32);
    torso.add(quiv);
  }

  /* 5. НОГИ (бёдра, наколенники, поножи, сапоги с отворотами и каблуком / босые ступни, культи) */
  const pantsMat = bareLegs ? skin : getMat(
    legsId === "greaves" ? PALETTE.woolSlate
      : legsId === "wool_trousers" ? PALETTE.woolSlate
      : PALETTE.linenWarm,
    { roughness: 0.88 }
  );

  function buildLeg(isLeft) {
    const sign = isLeft ? -1 : 1;
    const limbKey = isLeft ? "left_leg" : "right_leg";
    const isLost = !!severed[limbKey];

    const hip = new THREE.Group();
    hip.position.set(sign * hipSpan, -0.03, 0);
    pelvis.add(hip);

    const thighR = female ? 0.066 : 0.072 * widthScale;
    if (!isNpcDress) {
      addPart(hip, GEO.taperLimb, pantsMat, 0, -0.20, 0, thighR, 0.39, thighR);
    }

    const knee = new THREE.Group();
    knee.position.set(0, -0.39, 0);
    hip.add(knee);

    if (isLost) {
      attachStump3D(knee, thighR * 0.86, -0.02);
    } else {
      const shinR = thighR * 0.80;
      if (!isNpcDress) {
        addPart(knee, GEO.taperLimb, pantsMat, 0, -0.185, 0, shinR, 0.35, shinR);
      }

      /* Кованые поножи и наколенники */
      if (legsId === "greaves" && !isNpcDress) {
        const steelMat = getMat(PALETTE.steelBright, { metalness: 0.65, roughness: 0.34 });
        addPart(knee, GEO.octa, steelMat, 0, 0.01, shinR * 0.95, 0.052, 0.062, 0.042);
        addPart(knee, GEO.cyl8, steelMat, 0, -0.17, 0.012, shinR * 1.14, 0.25, shinR * 1.10);
      }

      /* Обувь или честная босая ступня */
      if (bareFeet) {
        addPart(knee, GEO.box, skin, 0, -0.41, 0.038, 0.076, 0.056, 0.175);
        addPart(knee, GEO.box, skin, 0, -0.422, 0.115, 0.072, 0.032, 0.038);
      } else if (bootsId === "travel_boots" || bootsId === "iron_boots" || armorId === "brigandine" || roleKey === "guard") {
        /* Высокие сапоги с раструбом-отворотом, ремешком и каблуком (эталон image-43) */
        const bootMat = getMat(bootsId === "iron_boots" ? PALETTE.ironForged : PALETTE.leatherBoots, {
          metalness: bootsId === "iron_boots" ? 0.35 : 0.06,
          roughness: 0.74
        });
        const cuffMat = getMat(PALETTE.leatherMid, { roughness: 0.80 });
        if (!isNpcDress) {
          addPart(knee, GEO.cyl8, bootMat, 0, -0.25, 0, shinR * 1.14, 0.26, shinR * 1.14);
          /* Отворот голенища под коленом */
          addPart(knee, GEO.cyl8, cuffMat, 0, -0.125, 0.004, shinR * 1.24, 0.062, shinR * 1.24);
        }
        /* Ступня, каблук и подошва */
        addPart(knee, GEO.box, bootMat, 0, -0.395, 0.042, 0.088, 0.075, 0.195);
        addPart(knee, GEO.box, beltMat, 0, -0.432, -0.025, 0.090, 0.028, 0.065);
        addPart(knee, GEO.box, beltMat, 0, -0.35, 0.02, 0.094, 0.024, 0.105);
        if (bootsId === "iron_boots") {
          addPart(knee, GEO.box, getMat(PALETTE.steelBright, { metalness: 0.65, roughness: 0.34 }), 0, -0.39, 0.12, 0.090, 0.055, 0.060);
        }
      } else {
        /* Простые кожаные постолы с онучами */
        const shoeMat = getMat(PALETTE.leatherMid, { roughness: 0.85 });
        if (!isNpcDress) {
          addPart(knee, GEO.cyl8, getMat(PALETTE.linenLight), 0, -0.29, 0, shinR * 1.08, 0.16, shinR * 1.08);
        }
        addPart(knee, GEO.box, shoeMat, 0, -0.405, 0.038, 0.084, 0.065, 0.185);
      }
    }

    return { hip, knee, isLost };
  }

  const leftLeg = buildLeg(true);
  const rightLeg = buildLeg(false);

  const rig = {
    root,
    group: root,
    bodyPivot,
    pelvis,
    torso,
    neck,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    forearmL: leftArm.elbow,
    forearmR: rightArm.elbow,
    hipY,
    shoulderSpan: shoulderSpan * 2,
    hipWidth: hipSpan * 2,
    female,
    roleKey,
    weaponId: activeWeaponKind,
    hasShield: !!shieldId && !leftArm.isLost,
    legLost: leftLeg.isLost || rightLeg.isLost
  };

  root.userData.rig = rig;
  return rig;
}

/* ---------- Скелетная 3D-анимация (покой, шаг, ремесло, живой бой, блок, падение) ---------- */
export function poseHumanoid3D(rig, statePose = {}) {
  if (!rig) { return; }
  const t = typeof statePose.time === "number" ? statePose.time : 0;
  const pose = statePose.pose || "idle";
  const ready = !!statePose.ready;
  const down = !!statePose.down || !!statePose.dead || rig.legLost;

  /* Сброс к нейтральным углам */
  rig.bodyPivot.position.set(0, 0, 0);
  rig.bodyPivot.rotation.set(0, 0, 0);
  rig.pelvis.position.set(0, rig.hipY, 0);
  rig.pelvis.rotation.set(0, 0, 0);
  rig.torso.rotation.set(0, 0, 0);
  rig.head.rotation.set(0, 0, 0);

  rig.leftArm.shoulder.rotation.set(0.06, 0, 0.10);
  rig.leftArm.elbow.rotation.set(-0.22, 0, 0);
  rig.rightArm.shoulder.rotation.set(0.06, 0, -0.10);
  rig.rightArm.elbow.rotation.set(-0.24, 0, 0);

  rig.leftLeg.hip.rotation.set(0, 0, 0);
  rig.leftLeg.knee.rotation.set(0, 0, 0);
  rig.rightLeg.hip.rotation.set(0, 0, 0);
  rig.rightLeg.knee.rotation.set(0, 0, 0);

  if (down) {
    /* Поверженный / мёртвый / потерявший ногу лежит прямо на заснеженной земле */
    rig.bodyPivot.position.set(0, 0.13, 0);
    rig.bodyPivot.rotation.set(-Math.PI * 0.48, 0, 0.14);
    rig.leftArm.shoulder.rotation.set(-0.35, 0, 0.55);
    rig.rightArm.shoulder.rotation.set(-0.25, 0, -0.65);
    rig.leftLeg.hip.rotation.set(0.12, 0, 0.10);
    rig.rightLeg.hip.rotation.set(-0.18, 0, -0.12);
    rig.rightLeg.knee.rotation.set(0.35, 0, 0);
    return;
  }

  if (pose === "walk") {
    const phase = (statePose.walkPhase || t * 7.2);
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    rig.pelvis.position.y = rig.hipY + Math.abs(c) * 0.032;
    rig.pelvis.rotation.y = s * 0.08;
    rig.torso.rotation.y = -s * 0.10;
    rig.torso.rotation.x = 0.06;

    rig.leftLeg.hip.rotation.x = -s * 0.56;
    rig.leftLeg.knee.rotation.x = Math.max(0, s) * 0.62;
    rig.rightLeg.hip.rotation.x = s * 0.56;
    rig.rightLeg.knee.rotation.x = Math.max(0, -s) * 0.62;

    rig.leftArm.shoulder.rotation.x = s * 0.44;
    rig.leftArm.elbow.rotation.x = -0.34 - Math.max(0, -s) * 0.22;
    rig.rightArm.shoulder.rotation.x = -s * 0.44;
    rig.rightArm.elbow.rotation.x = -0.34 - Math.max(0, s) * 0.22;
    return;
  }

  if (pose === "attack") {
    /* Полноценная 3D-фаза замаха и рубящего/колющего удара с разворотом корпуса */
    const p = Math.max(0, Math.min(1, 1 - ((statePose.poseTtl || 0.2) / 0.40)));
    const swing = p < 0.32 ? -(p / 0.32) : Math.sin(((p - 0.32) / 0.68) * Math.PI);
    const swingKind = statePose.swingKind || "slash";

    rig.pelvis.position.y = rig.hipY - 0.04;
    rig.leftLeg.hip.rotation.x = -0.34;
    rig.leftLeg.knee.rotation.x = 0.38;
    rig.rightLeg.hip.rotation.x = 0.30;
    rig.rightLeg.knee.rotation.x = 0.22;
    rig.bodyPivot.position.z = Math.max(0, swing) * 0.14;

    if (swingKind === "thrust") {
      rig.torso.rotation.y = -0.32 + swing * 0.62;
      rig.torso.rotation.x = 0.14 + Math.max(0, swing) * 0.16;
      rig.rightArm.shoulder.rotation.set(-0.55 - swing * 0.85, 0, -0.15);
      rig.rightArm.elbow.rotation.set(-0.65 + Math.max(0, swing) * 0.55, 0, 0);
    } else if (swingKind === "chop") {
      rig.torso.rotation.x = -0.12 + swing * 0.36;
      rig.torso.rotation.y = swing * 0.34;
      rig.rightArm.shoulder.rotation.set(-1.55 + swing * 1.95, 0, -0.18);
      rig.rightArm.elbow.rotation.set(-0.55 + Math.max(0, swing) * 0.30, 0, 0);
    } else {
      rig.torso.rotation.y = -0.45 + swing * 0.92;
      rig.torso.rotation.x = 0.10 + Math.max(0, swing) * 0.16;
      rig.rightArm.shoulder.rotation.set(-1.05 + swing * 0.85, -0.35 + swing * 0.85, -0.52 + swing * 0.35);
      rig.rightArm.elbow.rotation.set(-0.48, 0, 0);
    }

    if (rig.hasShield) {
      rig.leftArm.shoulder.rotation.set(-0.52, 0.35, 0.24);
      rig.leftArm.elbow.rotation.set(-0.68, 0, 0);
    } else {
      rig.leftArm.shoulder.rotation.set(0.32, 0, 0.30);
      rig.leftArm.elbow.rotation.set(-0.55, 0, 0);
    }
    return;
  }

  if (pose === "block") {
    /* Жёсткий приём удара на щит / клинок с приседом */
    rig.pelvis.position.y = rig.hipY - 0.05;
    rig.torso.rotation.x = -0.08;
    rig.torso.rotation.y = 0.24;
    rig.leftLeg.hip.rotation.x = -0.28;
    rig.leftLeg.knee.rotation.x = 0.36;
    rig.rightLeg.hip.rotation.x = 0.26;
    rig.rightLeg.knee.rotation.x = 0.30;
    rig.leftArm.shoulder.rotation.set(-0.85, 0.58, 0.18);
    rig.leftArm.elbow.rotation.set(-0.92, 0, 0);
    rig.rightArm.shoulder.rotation.set(-0.62, -0.25, -0.35);
    rig.rightArm.elbow.rotation.set(-0.78, 0, 0);
    return;
  }

  if (pose === "stagger" || pose === "dodge") {
    const dir = pose === "dodge" ? -1 : 1;
    rig.bodyPivot.position.z = -0.10;
    rig.torso.rotation.x = -0.22 * dir;
    rig.torso.rotation.z = 0.14;
    rig.head.rotation.x = -0.18;
    rig.leftArm.shoulder.rotation.set(-0.35, 0, 0.42);
    rig.rightArm.shoulder.rotation.set(-0.30, 0, -0.42);
    return;
  }

  if (ready) {
    /* Собранная боевая стойка (колени пружинят, щит прикрывает грудь, клинок наготове) */
    const b = Math.sin(t * 3.4);
    rig.pelvis.position.y = rig.hipY - 0.03 + b * 0.012;
    rig.torso.rotation.y = -0.22;
    rig.torso.rotation.x = 0.08;
    rig.head.rotation.y = 0.20;
    rig.leftLeg.hip.rotation.x = -0.20;
    rig.leftLeg.knee.rotation.x = 0.28;
    rig.rightLeg.hip.rotation.x = 0.18;
    rig.rightLeg.knee.rotation.x = 0.24;

    if (rig.hasShield) {
      rig.leftArm.shoulder.rotation.set(-0.64, 0.42, 0.18);
      rig.leftArm.elbow.rotation.set(-0.74, 0, 0);
    } else {
      rig.leftArm.shoulder.rotation.set(-0.36, 0.20, 0.24);
      rig.leftArm.elbow.rotation.set(-0.62, 0, 0);
    }
    rig.rightArm.shoulder.rotation.set(-0.56 + b * 0.05, -0.18, -0.28);
    rig.rightArm.elbow.rotation.set(-0.68, 0, 0);
    return;
  }

  /* Спокойное живое дыхание (и работа молотом у кузнеца Тарна) */
  const breath = Math.sin(t * 2.1);
  rig.torso.position.y = 0.06 + breath * 0.008;
  rig.leftArm.shoulder.rotation.z = 0.10 + breath * 0.015;
  rig.rightArm.shoulder.rotation.z = -0.10 - breath * 0.015;

  if (rig.roleKey === "smith" && rig.weaponId === "hammer") {
    const strike = Math.sin(t * 3.2);
    rig.rightArm.shoulder.rotation.x = -0.65 + strike * 0.45;
    rig.rightArm.elbow.rotation.x = -0.52;
  } else if (rig.hasShield) {
    rig.leftArm.shoulder.rotation.x = -0.18;
    rig.leftArm.elbow.rotation.x = -0.45;
  }
}

/* ---------- 3D-модель отрубленной конечности в лужице крови на снегу ---------- */
export function buildSeveredLimbMesh(limbData = {}) {
  const g = new THREE.Group();
  const isLeg = /leg/.test(limbData.partKey || "");
  const bloodPool = getMat(PALETTE.bloodDark, { roughness: 0.48 });
  const bloodCut = getMat(PALETTE.bloodFresh, { roughness: 0.42 });
  const cloth = getMat(isLeg ? PALETTE.linenWarm : PALETTE.woolSlate, { roughness: 0.88 });
  const endMat = getMat(isLeg ? PALETTE.leatherBoots : (limbData.female ? PALETTE.skinFemale : PALETTE.skinMale), { roughness: 0.80 });

  /* Пятно крови на снегу */
  addPart(g, GEO.disc10, bloodPool, 0, 0.008, 0, 0.24, 0.012, 0.19, 0, 0, 0, false);
  addPart(g, GEO.disc10, bloodCut, 0.08, 0.011, 0.04, 0.12, 0.012, 0.10, 0, 0, 0, false);

  const limb = new THREE.Group();
  limb.position.set(0, 0.055, 0);
  limb.rotation.set(Math.PI * 0.5, limbData.angle || 0.6, 0.12);
  addPart(limb, GEO.taperLimb, cloth, 0, 0, 0, isLeg ? 0.062 : 0.048, isLeg ? 0.36 : 0.28, isLeg ? 0.062 : 0.048);
  addPart(limb, GEO.cyl8, bloodCut, 0, isLeg ? 0.18 : 0.14, 0, isLeg ? 0.058 : 0.045, 0.025, isLeg ? 0.058 : 0.045);
  addPart(limb, GEO.box, endMat, 0, isLeg ? -0.20 : -0.16, isLeg ? 0.03 : 0, isLeg ? 0.078 : 0.064, 0.068, isLeg ? 0.15 : 0.068);
  g.add(limb);

  return g;
}
