/* ============================================================================
   ZOMBOID 3D CHARACTER GENERATOR (Project Zomboid Build 41+ Inspired)
   - Единая бесшовная сглаженная 3D-сетка тела (THREE.SkinnedMesh, 1 Draw Call!)
   - Скелет из 15 костей с мягкими весами в плечах, локтях, талии, бёдрах и коленях
   - Честный анатомический диморфизм Мужчина / Женщина (ключицы, грудь, талия,
     женственная линия бедра, икроножные мышцы, ладони с большим пальцем)
   - Скульптурная 3D-голова с 3D-носом, челюстью, надбровьем, ушами, бородой и
     объёмной причёской + рисованные UV-текстуры Zomboid.
   ============================================================================ */

import * as THREE from "three";
import {
  buildHeadTextureCanvas,
  buildHairTextureCanvas,
  buildBodyTextureCanvas,
  canvasToThreeTexture
} from "./zomboidTextures.js";

/* Индексы костей скелета */
export const BONE_IDX = {
  ROOT: 0,
  PELVIS: 1,
  SPINE: 2,
  CHEST: 3,
  NECK: 4,
  HEAD: 5,
  UPPER_ARM_L: 6,
  FOREARM_L: 7,
  HAND_L: 8,
  UPPER_ARM_R: 9,
  FOREARM_R: 10,
  HAND_R: 11,
  THIGH_L: 12,
  SHIN_L: 13,
  FOOT_L: 14,
  THIGH_R: 15,
  SHIN_R: 16,
  FOOT_R: 17
};

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / ((e1 - e0) || 1e-6));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/* Вспомогательный сборщик буферов для SkinnedMesh / BufferGeometry */
class MeshBuilder {
  constructor(skinned = true) {
    this.skinned = skinned;
    this.positions = [];
    this.uvs = [];
    this.skinIndices = [];
    this.skinWeights = [];
    this.indices = [];
    this.seamPairs = [];
  }

  get vertCount() {
    return this.positions.length / 3;
  }

  addVertex(x, y, z, u, v, b0 = 0, w0 = 1, b1 = 0, w1 = 0) {
    const idx = this.vertCount;
    this.positions.push(x, y, z);
    this.uvs.push(u, v);
    if (this.skinned) {
      const sum = (w0 + w1) || 1;
      this.skinIndices.push(b0, b1, 0, 0);
      this.skinWeights.push(w0 / sum, w1 / sum, 0, 0);
    }
    return idx;
  }

  addTri(a, b, c) {
    this.indices.push(a, b, c);
  }

  addQuad(a, b, c, d) {
    this.indices.push(a, b, d, b, c, d);
  }

  /* Соединяет массив колец (каждое кольцо — массив из segs+1 индексов вершин) */
  connectRings(rings, flipWinding = false) {
    for (let r = 0; r < rings.length - 1; r++) {
      const r0 = rings[r];
      const r1 = rings[r + 1];
      const segs = r0.length - 1;
      for (let s = 0; s < segs; s++) {
        if (flipWinding) {
          this.addQuad(r0[s], r0[s + 1], r1[s + 1], r1[s]);
        } else {
          this.addQuad(r0[s], r1[s], r1[s + 1], r0[s + 1]);
        }
      }
    }
  }

  toGeometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    if (this.skinned) {
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.skinIndices, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.skinWeights, 4));
    }
    geo.setIndex(this.indices);
    geo.computeVertexNormals();

    /* Свариваем нормали на UV-швах, чтобы цилиндрические части были идеально гладкими на 360° */
    const nAttr = geo.getAttribute("normal");
    for (let i = 0; i < this.seamPairs.length; i++) {
      const [i0, i1] = this.seamPairs[i];
      const nx = nAttr.getX(i0) + nAttr.getX(i1);
      const ny = nAttr.getY(i0) + nAttr.getY(i1);
      const nz = nAttr.getZ(i0) + nAttr.getZ(i1);
      const len = Math.hypot(nx, ny, nz) || 1;
      nAttr.setXYZ(i0, nx / len, ny / len, nz / len);
      nAttr.setXYZ(i1, nx / len, ny / len, nz / len);
    }
    nAttr.needsUpdate = true;
    return geo;
  }
}

/* ---------- Построение скелета 18 костей в метрических пропорциях (рост М 1.78 м, Ж 1.67 м) ---------- */
export function createHumanoidSkeleton(female = false) {
  const bones = [];
  for (let i = 0; i < 18; i++) {
    bones.push(new THREE.Bone());
  }

  const hipY = female ? 0.90 : 0.94;
  const spineY = female ? 1.07 : 1.12;
  const chestY = female ? 1.25 : 1.32;
  const neckY = female ? 1.43 : 1.51;
  const headY = female ? 1.51 : 1.60;

  const shoulderX = female ? 0.168 : 0.212;
  const shoulderY = female ? 1.36 : 1.44;
  const upperArmLen = female ? 0.255 : 0.275;
  const forearmLen = female ? 0.235 : 0.255;

  const hipX = female ? 0.088 : 0.092;
  const thighLen = female ? 0.41 : 0.43;
  const shinLen = female ? 0.40 : 0.42;

  bones[BONE_IDX.ROOT].name = "root";
  bones[BONE_IDX.PELVIS].name = "pelvis";
  bones[BONE_IDX.SPINE].name = "spine";
  bones[BONE_IDX.CHEST].name = "chest";
  bones[BONE_IDX.NECK].name = "neck";
  bones[BONE_IDX.HEAD].name = "head";

  bones[BONE_IDX.ROOT].position.set(0, 0, 0);
  bones[BONE_IDX.PELVIS].position.set(0, hipY, 0);
  bones[BONE_IDX.SPINE].position.set(0, spineY - hipY, 0);
  bones[BONE_IDX.CHEST].position.set(0, chestY - spineY, 0);
  bones[BONE_IDX.NECK].position.set(0, neckY - chestY, 0);
  bones[BONE_IDX.HEAD].position.set(0, headY - neckY, 0.01);

  bones[BONE_IDX.ROOT].add(bones[BONE_IDX.PELVIS]);
  bones[BONE_IDX.PELVIS].add(bones[BONE_IDX.SPINE]);
  bones[BONE_IDX.SPINE].add(bones[BONE_IDX.CHEST]);
  bones[BONE_IDX.CHEST].add(bones[BONE_IDX.NECK]);
  bones[BONE_IDX.NECK].add(bones[BONE_IDX.HEAD]);

  /* Левая рука (+X в пространстве модели, анатомическая левая сторона персонажа) */
  bones[BONE_IDX.UPPER_ARM_L].name = "upperArmL";
  bones[BONE_IDX.FOREARM_L].name = "forearmL";
  bones[BONE_IDX.HAND_L].name = "handL";
  bones[BONE_IDX.UPPER_ARM_L].position.set(shoulderX, shoulderY - chestY, -0.01);
  bones[BONE_IDX.FOREARM_L].position.set(0.015, -upperArmLen, 0);
  bones[BONE_IDX.HAND_L].position.set(0.008, -forearmLen, 0.01);
  bones[BONE_IDX.CHEST].add(bones[BONE_IDX.UPPER_ARM_L]);
  bones[BONE_IDX.UPPER_ARM_L].add(bones[BONE_IDX.FOREARM_L]);
  bones[BONE_IDX.FOREARM_L].add(bones[BONE_IDX.HAND_L]);

  /* Правая рука (-X) */
  bones[BONE_IDX.UPPER_ARM_R].name = "upperArmR";
  bones[BONE_IDX.FOREARM_R].name = "forearmR";
  bones[BONE_IDX.HAND_R].name = "handR";
  bones[BONE_IDX.UPPER_ARM_R].position.set(-shoulderX, shoulderY - chestY, -0.01);
  bones[BONE_IDX.FOREARM_R].position.set(-0.015, -upperArmLen, 0);
  bones[BONE_IDX.HAND_R].position.set(-0.008, -forearmLen, 0.01);
  bones[BONE_IDX.CHEST].add(bones[BONE_IDX.UPPER_ARM_R]);
  bones[BONE_IDX.UPPER_ARM_R].add(bones[BONE_IDX.FOREARM_R]);
  bones[BONE_IDX.FOREARM_R].add(bones[BONE_IDX.HAND_R]);

  /* Левая нога (+X) */
  bones[BONE_IDX.THIGH_L].name = "thighL";
  bones[BONE_IDX.SHIN_L].name = "shinL";
  bones[BONE_IDX.FOOT_L].name = "footL";
  bones[BONE_IDX.THIGH_L].position.set(hipX, -0.04, 0);
  bones[BONE_IDX.SHIN_L].position.set(0, -thighLen, -0.01);
  bones[BONE_IDX.FOOT_L].position.set(0, -shinLen, 0.01);
  bones[BONE_IDX.PELVIS].add(bones[BONE_IDX.THIGH_L]);
  bones[BONE_IDX.THIGH_L].add(bones[BONE_IDX.SHIN_L]);
  bones[BONE_IDX.SHIN_L].add(bones[BONE_IDX.FOOT_L]);

  /* Правая нога (-X) */
  bones[BONE_IDX.THIGH_R].name = "thighR";
  bones[BONE_IDX.SHIN_R].name = "shinR";
  bones[BONE_IDX.FOOT_R].name = "footR";
  bones[BONE_IDX.THIGH_R].position.set(-hipX, -0.04, 0);
  bones[BONE_IDX.SHIN_R].position.set(0, -thighLen, -0.01);
  bones[BONE_IDX.FOOT_R].position.set(0, -shinLen, 0.01);
  bones[BONE_IDX.PELVIS].add(bones[BONE_IDX.THIGH_R]);
  bones[BONE_IDX.THIGH_R].add(bones[BONE_IDX.SHIN_R]);
  bones[BONE_IDX.SHIN_R].add(bones[BONE_IDX.FOOT_R]);

  bones[BONE_IDX.ROOT].updateMatrixWorld(true);
  return {
    bones,
    skeleton: new THREE.Skeleton(bones),
    metrics: {
      hipY, spineY, chestY, neckY, headY,
      shoulderX, shoulderY, upperArmLen, forearmLen,
      hipX, thighLen, shinLen
    }
  };
}

/* ---------- 1. ПОСТРОЕНИЕ БЕСШОВНОГО АНАТОМИЧЕСКОГО ТЕЛА (ТОРСА, РУК, КИСТЕЙ, НОГ, ОБУВИ) ---------- */
export function buildSeamlessBodyGeometry(female = false, outfit = "tunic", metrics) {
  const mb = new MeshBuilder(true);
  const m = metrics;

  /* === А. ТОРС, ТАЗ И ШЕЯ (единая скульптурная оболочка 16 колец × 20 сегментов) === */
  /* Каждое кольцо: [t (0=пах..1=верх шеи), y, rx (полуширина), rzFront, rzBack, zCenter, b0, w0, b1, w1] */
  const torsoRows = female
    ? [
        [0.00, 0.85, 0.082, 0.068, 0.086, -0.008, BONE_IDX.PELVIS, 1.0, BONE_IDX.SPINE, 0.0],
        [0.09, 0.90, 0.160, 0.082, 0.118, -0.012, BONE_IDX.PELVIS, 0.95, BONE_IDX.SPINE, 0.05], // округлые бёдра без выпирания живота!
        [0.18, 0.95, 0.158, 0.084, 0.114, -0.010, BONE_IDX.PELVIS, 0.78, BONE_IDX.SPINE, 0.22],
        [0.28, 1.01, 0.128, 0.080, 0.094, -0.002, BONE_IDX.PELVIS, 0.35, BONE_IDX.SPINE, 0.65],
        [0.38, 1.07, 0.112, 0.078, 0.086,  0.004, BONE_IDX.SPINE,  0.85, BONE_IDX.CHEST, 0.15], // тонкая талия
        [0.49, 1.14, 0.124, 0.088, 0.092,  0.004, BONE_IDX.SPINE,  0.40, BONE_IDX.CHEST, 0.60],
        [0.60, 1.21, 0.138, 0.112, 0.098,  0.004, BONE_IDX.CHEST,  1.00, BONE_IDX.SPINE, 0.00], // низ груди
        [0.69, 1.26, 0.142, 0.128, 0.100,  0.004, BONE_IDX.CHEST,  1.00, BONE_IDX.NECK,  0.00], // вершина груди
        [0.78, 1.32, 0.148, 0.098, 0.096,  0.000, BONE_IDX.CHEST,  0.95, BONE_IDX.NECK,  0.05],
        [0.85, 1.36, 0.156, 0.082, 0.088, -0.006, BONE_IDX.CHEST,  0.85, BONE_IDX.NECK,  0.15], // плавное женское плечо
        [0.90, 1.39, 0.112, 0.068, 0.074, -0.006, BONE_IDX.CHEST,  0.60, BONE_IDX.NECK,  0.40], // покатые ключицы/трапеции
        [0.94, 1.43, 0.064, 0.054, 0.058, -0.005, BONE_IDX.NECK,   0.75, BONE_IDX.CHEST, 0.25],
        [0.97, 1.47, 0.048, 0.048, 0.052, -0.002, BONE_IDX.NECK,   0.85, BONE_IDX.HEAD,  0.15],
        [1.00, 1.52, 0.046, 0.046, 0.048,  0.000, BONE_IDX.NECK,   0.40, BONE_IDX.HEAD,  0.60]
      ]
    : [
        [0.00, 0.88, 0.090, 0.072, 0.092, -0.008, BONE_IDX.PELVIS, 1.0, BONE_IDX.SPINE, 0.0],
        [0.09, 0.93, 0.150, 0.088, 0.116, -0.010, BONE_IDX.PELVIS, 0.92, BONE_IDX.SPINE, 0.08], // плоский живот + подтянутый таз!
        [0.19, 0.99, 0.148, 0.092, 0.108, -0.004, BONE_IDX.PELVIS, 0.65, BONE_IDX.SPINE, 0.35],
        [0.31, 1.07, 0.144, 0.096, 0.102,  0.002, BONE_IDX.SPINE,  0.85, BONE_IDX.PELVIS, 0.15],
        [0.44, 1.16, 0.158, 0.108, 0.110,  0.004, BONE_IDX.SPINE,  0.45, BONE_IDX.CHEST, 0.55],
        [0.57, 1.25, 0.174, 0.122, 0.118,  0.004, BONE_IDX.CHEST,  1.00, BONE_IDX.SPINE, 0.00],
        [0.70, 1.34, 0.188, 0.124, 0.120,  0.000, BONE_IDX.CHEST,  1.00, BONE_IDX.NECK,  0.00], // мощная грудная клетка
        [0.80, 1.42, 0.198, 0.102, 0.106, -0.006, BONE_IDX.CHEST,  0.88, BONE_IDX.NECK,  0.12], // разворот плеч
        [0.87, 1.46, 0.148, 0.084, 0.090, -0.007, BONE_IDX.CHEST,  0.65, BONE_IDX.NECK,  0.35], // плавный скат трапеций!
        [0.92, 1.50, 0.086, 0.068, 0.072, -0.006, BONE_IDX.NECK,   0.65, BONE_IDX.CHEST, 0.35],
        [0.96, 1.55, 0.060, 0.058, 0.062, -0.003, BONE_IDX.NECK,   0.85, BONE_IDX.HEAD,  0.15],
        [1.00, 1.61, 0.056, 0.056, 0.060,  0.000, BONE_IDX.NECK,   0.40, BONE_IDX.HEAD,  0.60]
      ];

  const armorBulk = outfit === "armor" ? 1.07 : (outfit === "tunic" ? 1.025 : 1.0);
  const segsTorso = 22;
  const torsoRings = [];

  for (let r = 0; r < torsoRows.length; r++) {
    const [tRow, y, rxBase, rzFBase, rzBBase, zOff, b0, w0, b1, w1] = torsoRows[r];
    /* Броня и рубаха утолщают корпус, но НЕ шею (tRow > 0.89) */
    const bulk = tRow < 0.89 ? armorBulk : 1.0;
    const rx = rxBase * bulk;
    const rzF = rzFBase * bulk;
    const rzB = rzBBase * bulk;

    /* V в текстуре: полоса 0 = y(0..192) -> v от 0.628 (пах) до 0.996 (верх шеи) */
    const vTex = lerp(1 - 190 / 512, 1 - 2 / 512, tRow);
    const ring = [];

    for (let s = 0; s <= segsTorso; s++) {
      const uFrac = s / segsTorso;
      /* phi = 0 сзади (-Z), phi = PI спереди (+Z), чтобы u = 0.5 был центром груди! */
      const phi = (uFrac - 0.5) * Math.PI * 2; // phi=0 -> u=0.5 (+Z спереди!)
      const sinP = Math.sin(phi); // +X слева, -X справа
      const cosP = Math.cos(phi); // +1 спереди (+Z), -1 сзади (-Z)

      let radZ = cosP >= 0 ? rzF : rzB;

      /* Реалистичный парный контур женской груди / мужских грудных мышц спереди */
      if (cosP > 0.2) {
        if (female && y >= 1.16 && y <= 1.33) {
          const yBell = Math.sin(((y - 1.16) / 0.17) * Math.PI);
          /* Два пика груди вокруг углов ±0.48 рад с ложбинкой в центре (phi=0) */
          const breastTwin = Math.exp(-Math.pow((Math.abs(phi) - 0.46) / 0.34, 2));
          radZ += 0.034 * yBell * breastTwin;
        } else if (!female && y >= 1.21 && y <= 1.38) {
          const yPec = Math.sin(((y - 1.21) / 0.17) * Math.PI);
          const pecTwin = Math.exp(-Math.pow((Math.abs(phi) - 0.44) / 0.40, 2));
          radZ += 0.015 * yPec * pecTwin;
        }
      }

      /* Лёгкая ложбинка вдоль позвоночника на спине */
      if (cosP < -0.7 && tRow > 0.15 && tRow < 0.85) {
        radZ -= 0.008 * Math.pow((-cosP - 0.7) / 0.3, 2);
      }

      const vx = sinP * rx;
      const vz = cosP * radZ + zOff;
      const idx = mb.addVertex(vx, y, vz, uFrac, vTex, b0, w0, b1, w1);
      ring.push(idx);
    }
    mb.seamPairs.push([ring[0], ring[segsTorso]]);
    torsoRings.push(ring);
  }

  /* Закрываем низ паха аккуратным куполом, чтобы снизу ни под каким ракурсом не было дыры */
  const crotchCenter = mb.addVertex(0, torsoRows[0][1] - 0.015, -0.008, 0.5, 1 - 190 / 512, BONE_IDX.PELVIS, 1, 0, 0);
  for (let s = 0; s < segsTorso; s++) {
    mb.addTri(torsoRings[0][s + 1], torsoRings[0][s], crotchCenter);
  }
  mb.connectRings(torsoRings, true);

  /* === Б. БЕСШОВНЫЕ РУКИ С ДЕЛЬТАМИ, БИЦЕПСОМ, ПРЕДПЛЕЧЬЕМ И ЛАДОНЬЮ С БОЛЬШИМ ПАЛЬЦЕМ === */
  function buildArm(isLeft) {
    const sign = isLeft ? 1 : -1;
    const bUpper = isLeft ? BONE_IDX.UPPER_ARM_L : BONE_IDX.UPPER_ARM_R;
    const bFore  = isLeft ? BONE_IDX.FOREARM_L   : BONE_IDX.FOREARM_R;
    const bHand  = isLeft ? BONE_IDX.HAND_L      : BONE_IDX.HAND_R;

    const sx = sign * m.shoulderX;
    const sy = m.shoulderY;
    const ex = sx + sign * 0.015;
    const ey = sy - m.upperArmLen;
    const wx = ex + sign * 0.008;
    const wy = ey - m.forearmLen;

    const musc = female ? 0.80 : 1.06;
    const sleeveBulk = outfit === "armor" ? 1.10 : (outfit === "tunic" ? 1.04 : 1.0);

    /* [tTex, cx, cy, cz, rx, rz, b0, w0, b1, w1] */
    const armStations = [
      /* 0: Округлый верхний купол дельтовидной мышцы плеча (никакой ступеньки сверху!) */
      [0.00, sx - sign * 0.045, sy + 0.036, -0.006, 0.024 * musc, 0.026 * musc, BONE_IDX.CHEST, 0.82, bUpper, 0.18],
      /* 1: Широкая дельта плеча */
      [0.08, sx - sign * 0.015, sy + 0.008, -0.006, 0.055 * musc * sleeveBulk, 0.058 * musc * sleeveBulk, BONE_IDX.CHEST, 0.55, bUpper, 0.45],
      /* 2: Низ дельты (плавный переход от ключицы к бицепсу!) */
      [0.16, sx + sign * 0.006, sy - 0.034, -0.006, 0.053 * musc * sleeveBulk, 0.055 * musc * sleeveBulk, BONE_IDX.CHEST, 0.20, bUpper, 0.80],
      /* 3: Середина бицепса и трицепса */
      [0.30, lerp(sx, ex, 0.50), lerp(sy, ey, 0.50), -0.004, 0.047 * musc * sleeveBulk, 0.050 * musc * sleeveBulk, bUpper, 1.0, bFore, 0.0],
      /* 3: Над локтем */
      [0.44, lerp(sx, ex, 0.88), lerp(sy, ey, 0.88), -0.006, 0.040 * musc, 0.042 * musc, bUpper, 0.72, bFore, 0.28],
      /* 4: Локтевой сустав (50/50 -> гнётся без единой щели!) */
      [0.50, ex, ey, -0.008, 0.039 * musc, 0.041 * musc, bUpper, 0.48, bFore, 0.52],
      /* 5: Мышцы верха предплечья сразу под локтем */
      [0.60, lerp(ex, wx, 0.25), lerp(ey, wy, 0.25), -0.002, 0.043 * musc, 0.044 * musc, bFore, 0.92, bUpper, 0.08],
      /* 6: Середина предплечья */
      [0.74, lerp(ex, wx, 0.65), lerp(ey, wy, 0.65), 0.004, 0.035 * musc, 0.036 * musc, bFore, 1.0, bHand, 0.0],
      /* 7: Тонкое запястье */
      [0.84, wx, wy, 0.010, 0.027 * musc, 0.024 * musc, bFore, 0.45, bHand, 0.55],
      /* 8: Широкая уплощённая ладонь */
      [0.91, wx + sign * 0.003, wy - 0.042, 0.015, 0.022 * musc, 0.038 * musc, bHand, 1.0, bFore, 0.0],
      /* 9: Слегка согнутые внутрь пальцы (как в стойке Zomboid!) */
      [0.97, wx - sign * 0.004, wy - 0.086, 0.020, 0.018 * musc, 0.033 * musc, bHand, 1.0, bFore, 0.0],
      /* 10: Кончики пальцев */
      [1.00, wx - sign * 0.010, wy - 0.114, 0.022, 0.011 * musc, 0.022 * musc, bHand, 1.0, bFore, 0.0]
    ];

    const segsArm = 14;
    const rings = [];
    for (let i = 0; i < armStations.length; i++) {
      const [tA, cx, cy, cz, rx, rz, b0, w0, b1, w1] = armStations[i];
      /* Полоса 1 в текстуре: y = 194..302 -> v от (1 - 194/512) до (1 - 302/512) */
      const vTex = lerp(1 - 194 / 512, 1 - 302 / 512, tA);
      const ring = [];
      for (let s = 0; s <= segsArm; s++) {
        const uFrac = s / segsArm;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        const vx = cx + Math.sin(phi) * rx;
        const vz = cz + Math.cos(phi) * rz;
        ring.push(mb.addVertex(vx, cy, vz, uFrac, vTex, b0, w0, b1, w1));
      }
      mb.seamPairs.push([ring[0], ring[segsArm]]);
      rings.push(ring);
    }
    mb.connectRings(rings, true);

    /* Крышка кончиков пальцев */
    const tip = mb.addVertex(wx - sign * 0.012, wy - 0.122, 0.022, 0.5, 1 - 302 / 512, bHand, 1, 0, 0);
    const lastR = rings[rings.length - 1];
    for (let s = 0; s < segsArm; s++) {
      mb.addTri(lastR[s], lastR[s + 1], tip);
    }

    /* Отдельный аккуратный большой палец руки спереди ладони! */
    const thumbRings = [];
    const thumbSteps = [
      [0.88, wx - sign * 0.006, wy - 0.026, 0.036, 0.013 * musc],
      [0.94, wx - sign * 0.012, wy - 0.055, 0.052, 0.011 * musc],
      [0.99, wx - sign * 0.014, wy - 0.078, 0.058, 0.008 * musc]
    ];
    for (let ti = 0; ti < thumbSteps.length; ti++) {
      const [tT, tx, ty, tz, tr] = thumbSteps[ti];
      const vTex = lerp(1 - 194 / 512, 1 - 302 / 512, tT);
      const tring = [];
      for (let s = 0; s <= 8; s++) {
        const phi = (s / 8) * Math.PI * 2;
        tring.push(mb.addVertex(tx + Math.sin(phi) * tr, ty, tz + Math.cos(phi) * tr, s / 8, vTex, bHand, 1, 0, 0));
      }
      thumbRings.push(tring);
    }
    mb.connectRings(thumbRings, true);
    const tTip = mb.addVertex(wx - sign * 0.014, wy - 0.085, 0.060, 0.5, 1 - 302 / 512, bHand, 1, 0, 0);
    for (let s = 0; s < 8; s++) {
      mb.addTri(thumbRings[2][s], thumbRings[2][s + 1], tTip);
    }
  }

  buildArm(true);
  buildArm(false);

  /* === В. БЕСШОВНЫЕ НОГИ С КВАДРИЦЕПСОМ, КОЛЕНОМ, ИКРАМИ И СТУПНЯМИ === */
  function buildLeg(isLeft) {
    const sign = isLeft ? 1 : -1;
    const bThigh = isLeft ? BONE_IDX.THIGH_L : BONE_IDX.THIGH_R;
    const bShin  = isLeft ? BONE_IDX.SHIN_L  : BONE_IDX.SHIN_R;
    const bFoot  = isLeft ? BONE_IDX.FOOT_L  : BONE_IDX.FOOT_R;

    const hx = sign * m.hipX;
    const hy = m.hipY - 0.04;
    const kx = sign * (m.hipX * 0.88);
    const ky = hy - m.thighLen;
    const ax = sign * (m.hipX * 0.82);
    const ay = ky - m.shinLen;

    const pantsBulk = outfit === "underwear" ? 1.0 : 1.07;

    /* [tTex, cx, cy, cz, rx, rz, b0, w0, b1, w1] */
    const legStations = [
      /* 0: Бесшовное вхождение верха бедра в линию таза (одна гладкая линия брюк/бедра!) */
      [0.00, hx * 0.96, hy + 0.085, -0.006, (female ? 0.078 : 0.076) * pantsBulk, (female ? 0.082 : 0.084) * pantsBulk, BONE_IDX.PELVIS, 0.72, bThigh, 0.28],
      /* 1: Широкая внешняя дуга бедра (зона 2 на image-52!) */
      [0.14, hx * 1.02, lerp(hy, ky, 0.14), 0.000, (female ? 0.084 : 0.081) * pantsBulk, (female ? 0.084 : 0.086) * pantsBulk, BONE_IDX.PELVIS, 0.22, bThigh, 0.78],
      /* 2: Середина бедра (выраженный квадрицепс спереди) */
      [0.32, lerp(hx, kx, 0.52), lerp(hy, ky, 0.52), 0.006, (female ? 0.071 : 0.074) * pantsBulk, (female ? 0.076 : 0.080) * pantsBulk, bThigh, 1.0, bShin, 0.0],
      /* 3: Над коленом */
      [0.46, lerp(hx, kx, 0.88), lerp(hy, ky, 0.88), 0.000, (female ? 0.055 : 0.059) * pantsBulk, (female ? 0.058 : 0.062) * pantsBulk, bThigh, 0.75, bShin, 0.25],
      /* 4: Коленная чашечка (50/50 вес -> естественный сгиб колена в шаге!) */
      [0.52, kx, ky, 0.002, (female ? 0.052 : 0.057) * pantsBulk, (female ? 0.056 : 0.060) * pantsBulk, bThigh, 0.48, bShin, 0.52],
      /* 5: Выраженная икроножная мышца сзади ниже колена (как на image-51!) */
      [0.66, lerp(kx, ax, 0.30), lerp(ky, ay, 0.30), -0.012, (female ? 0.055 : 0.062) * pantsBulk, (female ? 0.062 : 0.070) * pantsBulk, bShin, 0.95, bThigh, 0.05],
      /* 6: Середина голени */
      [0.82, lerp(kx, ax, 0.68), lerp(ky, ay, 0.68), -0.006, (female ? 0.043 : 0.048) * pantsBulk, (female ? 0.046 : 0.052) * pantsBulk, bShin, 1.0, bFoot, 0.0],
      /* 7: Изящная щиколотка */
      [0.96, ax, ay + 0.02, -0.002, (female ? 0.036 : 0.042) * pantsBulk, (female ? 0.040 : 0.046) * pantsBulk, bShin, 0.50, bFoot, 0.50]
    ];

    const segsLeg = 16;
    const rings = [];
    for (let i = 0; i < legStations.length; i++) {
      const [tL, cx, cy, cz, rx, rz, b0, w0, b1, w1] = legStations[i];
      /* Полоса 2 в текстуре: y = 306..430 */
      const vTex = lerp(1 - 306 / 512, 1 - 430 / 512, tL);
      const ring = [];
      for (let s = 0; s <= segsLeg; s++) {
        const uFrac = s / segsLeg;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        ring.push(mb.addVertex(cx + Math.sin(phi) * rx, cy, cz + Math.cos(phi) * rz, uFrac, vTex, b0, w0, b1, w1));
      }
      mb.seamPairs.push([ring[0], ring[segsLeg]]);
      rings.push(ring);
    }

    /* Продолжаем ту же трубу прямо в аккуратный ботинок / стопу (полоса 3: y = 434..508)! */
    const footRows = [
      /* Подъём стопы */
      [0.25, ax, ay - 0.015, 0.025, 0.045, 0.072, bFoot, 0.90, bShin, 0.10],
      /* Широкая подошва от пятки до носка */
      [0.65, ax + sign * 0.004, 0.022, 0.046, 0.048, 0.108, bFoot, 1.0, bShin, 0.0],
      /* Нижний кант подошвы на полу y = 0.002 */
      [0.95, ax + sign * 0.004, 0.002, 0.048, 0.046, 0.106, bFoot, 1.0, bShin, 0.0]
    ];
    for (let f = 0; f < footRows.length; f++) {
      const [tF, cx, cy, cz, rx, rz, b0, w0, b1, w1] = footRows[f];
      const vTex = lerp(1 - 434 / 512, 1 - 508 / 512, tF);
      const ring = [];
      for (let s = 0; s <= segsLeg; s++) {
        const uFrac = s / segsLeg;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        /* Спереди носок вытянут, сзади аккуратная круглая пятка */
        const cosP = Math.cos(phi);
        const zScale = cosP >= 0 ? rz * 1.12 : rz * 0.68;
        ring.push(mb.addVertex(cx + Math.sin(phi) * rx, cy, cz + cosP * zScale, uFrac, vTex, b0, w0, b1, w1));
      }
      mb.seamPairs.push([ring[0], ring[segsLeg]]);
      rings.push(ring);
    }

    mb.connectRings(rings, true);
    /* Закрываем подошву снизу */
    const soleC = mb.addVertex(ax, 0.001, 0.048, 0.5, 1 - 508 / 512, bFoot, 1, 0, 0);
    const botR = rings[rings.length - 1];
    for (let s = 0; s < segsLeg; s++) {
      mb.addTri(botR[s], botR[s + 1], soleC);
    }
  }

  buildLeg(true);
  buildLeg(false);

  /* === Г. ДОПОЛНИТЕЛЬНАЯ ОБЪЁМНАЯ ЮБКА / ПОДОЛ ТУНИКИ (если надета броня или женская юбка) === */
  if (outfit === "armor") {
    const skirtSegs = 20;
    const skirtRings = [];
    const sRows = [
      [0.24, m.hipY + 0.08, female ? 0.145 : 0.162, 0.118, BONE_IDX.PELVIS, 0.85, BONE_IDX.SPINE, 0.15],
      [0.14, m.hipY - 0.02, female ? 0.178 : 0.176, 0.136, BONE_IDX.PELVIS, 0.90, BONE_IDX.THIGH_L, 0.10],
      [0.03, m.hipY - 0.14, female ? 0.195 : 0.188, 0.146, BONE_IDX.PELVIS, 1.00, BONE_IDX.SPINE, 0.0]
    ];
    for (let r = 0; r < sRows.length; r++) {
      const [tV, sy, rx, rz, b0, w0, b1, w1] = sRows[r];
      const vTex = lerp(1 - 190 / 512, 1 - 146 / 512, 1 - r / 2);
      const ring = [];
      for (let s = 0; s <= skirtSegs; s++) {
        const uFrac = s / skirtSegs;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        const pleat = 1 + Math.sin(phi * 8) * 0.025;
        ring.push(mb.addVertex(Math.sin(phi) * rx * pleat, sy, Math.cos(phi) * rz * pleat - 0.008, uFrac, vTex, b0, w0, b1, w1));
      }
      mb.seamPairs.push([ring[0], ring[skirtSegs]]);
      skirtRings.push(ring);
    }
    mb.connectRings(skirtRings, true);
  }

  return mb.toGeometry();
}

/* ---------- 2. СКУЛЬПТУРНАЯ 3D-ГОЛОВА В СТИЛЕ PROJECT ZOMBOID ----------
   Создаётся в локальных координатах кости HEAD (центр основания черепа в 0,0,0) */
export function buildSculptedHeadGeometry(female = false, hasBeard = false) {
  const mb = new MeshBuilder(false);
  const segsU = 28;
  const segsV = 20;

  const wScale = female ? 0.91 : 1.0;
  const hScale = female ? 0.95 : 1.0;
  const rings = [];

  for (let iv = 0; iv <= segsV; iv++) {
    const vFrac = iv / segsV; // 0 = низ подбородка/шеи, 1 = макушка
    const theta = (1 - vFrac) * Math.PI; // PI внизу -> 0 наверху
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    const ring = [];
    for (let iu = 0; iu <= segsU; iu++) {
      const uFrac = iu / segsU;
      /* phi = 0 в центре лица (+Z), +-PI на затылке (-Z) */
      const phi = (uFrac - 0.5) * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      /* Базовый эллипсоид черепа */
      let rx = 0.088 * wScale;
      let ry = 0.118 * hScale;
      let rz = 0.104;

      let x = sinT * sinP * rx;
      let y = 0.095 * hScale + cosT * ry;
      let z = sinT * cosP * rz;

      /* 1. Сужение нижней трети черепа к линии челюсти и подбородку! */
      if (vFrac < 0.45) {
        const jawT = smoothstep(0.45, 0.06, vFrac);
        const chinNarrow = female ? 0.52 : 0.66;
        x *= lerp(1.0, chinNarrow, jawT);
        if (cosP < 0) {
          /* Затылок подбирается внутрь к шее */
          z *= lerp(1.0, 0.56, jawT);
          y += jawT * 0.024;
        } else {
          /* Выступающий волевой подбородок спереди */
          const chinFront = Math.exp(-Math.pow(phi / 0.45, 2)) * smoothstep(0.30, 0.10, vFrac) * smoothstep(0.0, 0.08, vFrac);
          z += chinFront * (female ? 0.012 : 0.018);
          /* Объёмная борода у мужчины прямо в геометрии челюсти! */
          if (!female && hasBeard) {
            const beardMask = Math.exp(-Math.pow(phi / 0.85, 2)) * smoothstep(0.44, 0.16, vFrac);
            z += beardMask * 0.018;
            x += Math.sign(x) * beardMask * 0.008;
            y -= beardMask * 0.014;
          }
        }
      }

      /* 2. Скулы (выразительный объём на щеках) */
      const cheekMask = Math.exp(-Math.pow((Math.abs(phi) - 0.58) / 0.32, 2)) * Math.exp(-Math.pow((vFrac - 0.44) / 0.11, 2));
      z += cheekMask * 0.010;
      x += Math.sign(x || 1) * cheekMask * 0.006;

      /* 3. Глазные впадины (вдавлены внутрь под бровями!) и надбровная дуга */
      if (cosP > 0.4) {
        const eyeSocket = Math.exp(-Math.pow((Math.abs(phi) - 0.36) / 0.20, 2)) * Math.exp(-Math.pow((vFrac - 0.545) / 0.055, 2));
        z -= eyeSocket * 0.013;

        const browRidge = Math.exp(-Math.pow(phi / 0.62, 2)) * Math.exp(-Math.pow((vFrac - 0.61) / 0.045, 2));
        z += browRidge * (female ? 0.006 : 0.013);
      }

      /* 4. Настоящий 3D-НОС по центру лица (phi ~ 0, vFrac = 0.40..0.57) */
      if (Math.abs(phi) < 0.28 && vFrac > 0.38 && vFrac < 0.60) {
        const noseW = Math.exp(-Math.pow(phi / 0.11, 2));
        const noseTip = Math.exp(-Math.pow((vFrac - 0.44) / 0.045, 2));
        const noseBridge = Math.exp(-Math.pow((vFrac - 0.51) / 0.06, 2));
        z += noseW * (noseTip * (female ? 0.022 : 0.027) + noseBridge * 0.012);
      }

      /* 5. Рельеф губ (vFrac ~ 0.33) */
      if (Math.abs(phi) < 0.30 && vFrac > 0.28 && vFrac < 0.38) {
        const lipMask = Math.exp(-Math.pow(phi / 0.18, 2)) * Math.exp(-Math.pow((vFrac - 0.335) / 0.03, 2));
        z += lipMask * 0.008;
      }

      /* 6. Аккуратные 3D-уши по бокам (phi ~ +-1.52) */
      const earMask = Math.exp(-Math.pow((Math.abs(phi) - 1.52) / 0.14, 2)) * Math.exp(-Math.pow((vFrac - 0.50) / 0.09, 2));
      x += Math.sign(sinP || 1) * earMask * 0.015;
      z -= earMask * 0.004;

      ring.push(mb.addVertex(x, y, z, uFrac, vFrac));
    }
    mb.seamPairs.push([ring[0], ring[segsU]]);
    rings.push(ring);
  }

  mb.connectRings(rings, true);
  return mb.toGeometry();
}

/* ---------- 3. ОБЪЁМНАЯ 3D-ПРИЧЁСКА В СТИЛЕ PROJECT ZOMBOID ----------
   - У женщины: пышные каштановые волосы с пробором и длинными прядями на плечи и спину (1-в-1 image-51 слева!)
   - У мужчины: густая объёмная шапка волос с приподнятым чубом и висками (1-в-1 рыжебородый герой image-51!) */
export function buildZomboidHairGeometry(female = false) {
  const mb = new MeshBuilder(false);
  const segsU = 24;

  if (female) {
    /* Пышные каштановые волосы до плеч и лопаток, ПОЛНОСТЬЮ открывающие лоб, глаза, нос и щёки! */
    const rows = [
      /* [vTex, y, rx, rzFront, rzBack, openAngRad] */
      [0.98, 0.212, 0.022, 0.022, 0.032, 0.82],
      [0.88, 0.194, 0.088, 0.098, 0.108, 0.80], // линия роста волос высоко надо лбом
      [0.74, 0.152, 0.098, 0.102, 0.115, 0.86], // у висков (глаза на y=0.105 полностью открыты!)
      [0.56, 0.098, 0.104, 0.098, 0.118, 0.90], // локоны по бокам скул
      [0.38, 0.035, 0.110, 0.095, 0.122, 0.86], // вдоль шеи
      [0.18, -0.035, 0.118, 0.098, 0.126, 0.82], // ложатся на ключицы и плечи!
      [0.02, -0.105, 0.106, 0.088, 0.118, 0.92]  // кончики прядей
    ];

    const rings = [];
    for (let r = 0; r < rows.length; r++) {
      const [vTex, y, rx, rzF, rzB, openAng] = rows[r];
      const ring = [];
      for (let s = 0; s <= segsU; s++) {
        const t = s / segsU;
        const phi = lerp(openAng, Math.PI * 2 - openAng, t);
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);
        const rz = cosP >= 0 ? rzF : rzB;
        const wave = 1 + Math.sin(t * Math.PI * 7) * 0.04;
        ring.push(mb.addVertex(sinP * rx * wave, y, cosP * rz * wave, t, vTex));
      }
      rings.push(ring);
    }
    mb.connectRings(rings, true);

    /* Верхняя шапочка макушки строго выше лба (y = 0.176..0.214), чтобы макушка была пышной */
    const crownApex = mb.addVertex(0, 0.214, -0.01, 0.5, 0.98);
    const crownFrontPts = [];
    for (let k = 0; k <= 8; k++) {
      const phi = lerp(-0.82, 0.82, k / 8);
      const hairlineY = 0.176 + Math.sin((k / 8) * Math.PI) * 0.008 + (k < 4 ? -0.010 : 0.004);
      crownFrontPts.push(mb.addVertex(Math.sin(phi) * 0.085, hairlineY, Math.cos(phi) * 0.098, k / 8, 0.88));
    }
    for (let k = 0; k < 8; k++) {
      mb.addTri(crownApex, crownFrontPts[k], crownFrontPts[k + 1]);
    }
    /* Внутренняя тёмная сторона волос вокруг шеи для объёма */
    const innerRings = [];
    for (let r = 1; r < rows.length; r++) {
      const [vTex, y, rx, rzF, rzB, openAng] = rows[r];
      const ring = [];
      for (let s = 0; s <= segsU; s++) {
        const t = s / segsU;
        const phi = lerp(openAng, Math.PI * 2 - openAng, t);
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);
        const rz = (cosP >= 0 ? rzF : rzB) * 0.88;
        ring.push(mb.addVertex(sinP * rx * 0.88, y, cosP * rz, t, vTex * 0.4));
      }
      innerRings.push(ring);
    }
    mb.connectRings(innerRings, false);
    return mb.toGeometry();
  }

  /* Мужская объёмная причёска Zomboid (открытый волевой лоб, пышный верх с чубом и аккуратные виски/затылок) */
  const mRows = [
    [0.98, 0.224, 0.025, 0.025, 0.032, 0.92],
    [0.82, 0.204, 0.092, 0.104, 0.110, 0.90],
    [0.62, 0.162, 0.098, 0.100, 0.114, 1.02], // виски выше ушей, лицо полностью открыто!
    [0.40, 0.112, 0.098, 0.092, 0.114, 1.24], // бакенбарды и затылок
    [0.15, 0.056, 0.084, 0.078, 0.100, 1.52]
  ];
  const mRings = [];
  for (let r = 0; r < mRows.length; r++) {
    const [vTex, y, rx, rzF, rzB, openAng] = mRows[r];
    const ring = [];
    for (let s = 0; s <= segsU; s++) {
      const t = s / segsU;
      const phi = lerp(openAng, Math.PI * 2 - openAng, t);
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      const rz = cosP >= 0 ? rzF : rzB;
      ring.push(mb.addVertex(sinP * rx, y, cosP * rz, t, vTex));
    }
    mRings.push(ring);
  }
  mb.connectRings(mRings, true);

  /* Чуб и верх шевелюры строго выше лба (y = 0.184..0.226) */
  const mApex = mb.addVertex(0, 0.225, -0.005, 0.5, 0.98);
  const mFront = [];
  for (let k = 0; k <= 8; k++) {
    const phi = lerp(-0.92, 0.92, k / 8);
    const widowPeak = Math.cos(((k / 8) - 0.5) * Math.PI * 2) * 0.008;
    mFront.push(mb.addVertex(Math.sin(phi) * 0.088, 0.184 - widowPeak, Math.cos(phi) * 0.104, k / 8, 0.85));
  }
  for (let k = 0; k < 8; k++) {
    mb.addTri(mApex, mFront[k], mFront[k + 1]);
  }

  return mb.toGeometry();
}

/* ---------- 4. СБОРКА ПОЛНОГО 3D-ПЕРСОНАЖА PROJECT ZOMBOID С ОДНИМ ВЫЗОВОМ ---------- */
export function createZomboidCharacter3D(opts = {}) {
  const female = !!opts.female;
  const outfit = opts.outfit || "tunic"; // "underwear" | "tunic" | "armor"
  const hairColor = opts.hairColor || (female ? "#4b2514" : "#6b3c1b");
  const hasBeard = !female && opts.beard !== false;

  const group = new THREE.Group();
  group.name = female ? "ZomboidFemale" : "ZomboidMale";

  const { bones, skeleton, metrics } = createHumanoidSkeleton(female);
  group.add(bones[BONE_IDX.ROOT]);

  /* Текстуры (можно передать кастомную фабрику холста для Node-самопроверки) */
  const bodyCv = buildBodyTextureCanvas({ female, outfit }, opts.canvasFactory);
  const headCv = buildHeadTextureCanvas({ female, hairColor, beard: hasBeard }, opts.canvasFactory);
  const hairCv = buildHairTextureCanvas(hairColor, opts.canvasFactory);

  const bodyTex = canvasToThreeTexture(bodyCv);
  const headTex = canvasToThreeTexture(headCv);
  const hairTex = canvasToThreeTexture(hairCv);

  /* Мягкий матовый материал кожи и ткани в духе Project Zomboid (никакого пластикового блеска!) */
  const bodyMat = new THREE.MeshLambertMaterial({ map: bodyTex });
  const headMat = new THREE.MeshLambertMaterial({ map: headTex });
  const hairMat = new THREE.MeshLambertMaterial({ map: hairTex, side: THREE.DoubleSide });

  const bodyGeo = buildSeamlessBodyGeometry(female, outfit, metrics);
  const bodyMesh = new THREE.SkinnedMesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.frustumCulled = false;
  bodyMesh.bind(skeleton);
  group.add(bodyMesh);

  /* Скульптурная голова крепится напрямую к кости HEAD (выразительный масштаб Zomboid 1.16x) */
  const headGeo = buildSculptedHeadGeometry(female, hasBeard);
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.scale.setScalar(1.16);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  bones[BONE_IDX.HEAD].add(headMesh);

  /* Объёмная причёска крепится к голове */
  const hairGeo = buildZomboidHairGeometry(female);
  const hairMesh = new THREE.Mesh(hairGeo, hairMat);
  hairMesh.scale.setScalar(1.16);
  hairMesh.castShadow = true;
  bones[BONE_IDX.HEAD].add(hairMesh);

  /* Мягкое тёмное пятно контактной тени под ногами (как на референсе image-51!) */
  const shadowGeo = new THREE.CircleGeometry(0.32, 24);
  shadowGeo.rotateX(-Math.PI * 0.5);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x0b0d10,
    transparent: true,
    opacity: 0.38,
    depthWrite: false
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.002;
  group.add(contactShadow);

  const rig = {
    group,
    female,
    outfit,
    bones,
    skeleton,
    metrics,
    bodyMesh,
    headMesh,
    hairMesh,
    textures: { bodyCv, headCv, hairCv, bodyTex, headTex, hairTex },
    setOutfit(nextOutfit, canvasFactory = null) {
      if (rig.outfit === nextOutfit) { return; }
      rig.outfit = nextOutfit;
      const nextBodyCv = buildBodyTextureCanvas({ female, outfit: nextOutfit }, canvasFactory);
      const nextTex = canvasToThreeTexture(nextBodyCv);
      bodyMat.map.dispose();
      bodyMat.map = nextTex;
      bodyMat.needsUpdate = true;

      const nextGeo = buildSeamlessBodyGeometry(female, nextOutfit, metrics);
      bodyMesh.geometry.dispose();
      bodyMesh.geometry = nextGeo;
      bodyMesh.bind(skeleton);
    }
  };

  /* Ставим сразу естественную живую позу (не деревянную Т-позу!) */
  poseZomboidCharacter(rig, "idle", 0);
  return rig;
}

/* ---------- 5. ЖИВАЯ СКЕЛЕТНАЯ АНИМАЦИЯ (СТОЙКА ZOMBOID, ПОХОДКА С IMAGE-51, БОЕВАЯ СТОЙКА) ---------- */
export function poseZomboidCharacter(rig, mode = "idle", timeSec = 0, opts = {}) {
  const b = rig.bones;
  const fem = rig.female;
  const lookYaw = opts.lookYaw || 0;

  /* Сброс углов вращения всех костей */
  for (let i = 0; i < b.length; i++) {
    b[i].rotation.set(0, 0, 0);
  }
  b[BONE_IDX.PELVIS].position.y = rig.metrics.hipY;

  if (mode === "walk") {
    /* Бодрая естественная походка в духе Project Zomboid (см. шагающего мужчину в центре image-51!) */
    const w = timeSec * 4.2;
    const s = Math.sin(w);
    const c = Math.cos(w);

    b[BONE_IDX.PELVIS].position.y = rig.metrics.hipY + Math.abs(c) * 0.022 - 0.01;
    b[BONE_IDX.PELVIS].rotation.y = s * (fem ? 0.11 : 0.07);
    b[BONE_IDX.PELVIS].rotation.z = c * (fem ? 0.045 : 0.025);

    b[BONE_IDX.SPINE].rotation.y = -s * 0.05;
    b[BONE_IDX.CHEST].rotation.y = -s * 0.08;
    b[BONE_IDX.CHEST].rotation.x = 0.04;
    b[BONE_IDX.HEAD].rotation.y = s * 0.06;

    /* Противоход рук и ног с естественным отводом рук наружу от бёдер! */
    b[BONE_IDX.UPPER_ARM_L].rotation.z = fem ? 0.11 : 0.14;
    b[BONE_IDX.UPPER_ARM_R].rotation.z = fem ? -0.11 : -0.14;
    b[BONE_IDX.UPPER_ARM_L].rotation.x = s * 0.42;
    b[BONE_IDX.UPPER_ARM_R].rotation.x = -s * 0.42;
    b[BONE_IDX.FOREARM_L].rotation.x = -0.30 - Math.max(0, -s) * 0.28;
    b[BONE_IDX.FOREARM_R].rotation.x = -0.30 - Math.max(0, s) * 0.28;

    b[BONE_IDX.THIGH_L].rotation.x = -s * 0.52;
    b[BONE_IDX.THIGH_R].rotation.x = s * 0.52;
    b[BONE_IDX.SHIN_L].rotation.x = Math.max(0, s) * 0.72 + 0.06;
    b[BONE_IDX.SHIN_R].rotation.x = Math.max(0, -s) * 0.72 + 0.06;
    b[BONE_IDX.FOOT_L].rotation.x = -b[BONE_IDX.THIGH_L].rotation.x * 0.45 - b[BONE_IDX.SHIN_L].rotation.x * 0.45;
    b[BONE_IDX.FOOT_R].rotation.x = -b[BONE_IDX.THIGH_R].rotation.x * 0.45 - b[BONE_IDX.SHIN_R].rotation.x * 0.45;
  } else if (mode === "combat") {
    /* Настороженная боевая стойка Zomboid / Kenshi */
    const br = Math.sin(timeSec * 2.6);
    b[BONE_IDX.PELVIS].position.y = rig.metrics.hipY - 0.035 + br * 0.006;
    b[BONE_IDX.PELVIS].rotation.y = -0.28;
    b[BONE_IDX.CHEST].rotation.y = -0.14;
    b[BONE_IDX.CHEST].rotation.x = 0.12;
    b[BONE_IDX.HEAD].rotation.y = 0.36;
    b[BONE_IDX.HEAD].rotation.x = -0.06;

    b[BONE_IDX.UPPER_ARM_L].rotation.set(-0.62, -0.18, 0.24);
    b[BONE_IDX.FOREARM_L].rotation.x = -0.98 + br * 0.05;
    b[BONE_IDX.UPPER_ARM_R].rotation.set(-0.44, 0.16, -0.28);
    b[BONE_IDX.FOREARM_R].rotation.x = -0.82 - br * 0.05;

    b[BONE_IDX.THIGH_L].rotation.set(-0.22, 0.1, 0.05);
    b[BONE_IDX.SHIN_L].rotation.x = 0.32;
    b[BONE_IDX.FOOT_L].rotation.x = -0.10;
    b[BONE_IDX.THIGH_R].rotation.set(0.18, -0.08, -0.05);
    b[BONE_IDX.SHIN_R].rotation.x = 0.22;
    b[BONE_IDX.FOOT_R].rotation.x = -0.35;
  } else {
    /* Расслабленная живая стойка (как у девушек слева и справа на image-51!):
       лёгкий перенос веса на опорную ногу (контрапост), мягкое дыхание грудной клетки,
       чуть согнутые в локтях руки вдоль бёдер */
    const breath = Math.sin(timeSec * 1.8);
    b[BONE_IDX.PELVIS].rotation.z = fem ? 0.038 : -0.015;
    b[BONE_IDX.PELVIS].rotation.y = fem ? 0.08 : -0.06;
    b[BONE_IDX.SPINE].rotation.z = fem ? -0.025 : 0.01;
    b[BONE_IDX.CHEST].rotation.x = breath * 0.018;
    b[BONE_IDX.HEAD].rotation.y = (fem ? -0.08 : 0.06) + Math.sin(timeSec * 0.7) * 0.06;

    /* Руки свободно опущены вдоль тела с чистым просветом у талии и бёдер (как на image-51 и image-52!) */
    b[BONE_IDX.UPPER_ARM_L].rotation.z = fem ? 0.12 : 0.14;
    b[BONE_IDX.UPPER_ARM_R].rotation.z = fem ? -0.12 : -0.14;
    b[BONE_IDX.UPPER_ARM_L].rotation.x = 0.04 + breath * 0.015;
    b[BONE_IDX.UPPER_ARM_R].rotation.x = -0.02 - breath * 0.015;
    b[BONE_IDX.FOREARM_L].rotation.x = -0.16;
    b[BONE_IDX.FOREARM_R].rotation.x = -0.20;
    b[BONE_IDX.FOREARM_L].rotation.z = fem ? -0.05 : -0.06;
    b[BONE_IDX.FOREARM_R].rotation.z = fem ? 0.05 : 0.06;

    /* Ноги с лёгким разворотом носков наружу */
    b[BONE_IDX.THIGH_L].rotation.y = 0.06;
    b[BONE_IDX.THIGH_R].rotation.y = -0.08;
    b[BONE_IDX.THIGH_L].rotation.x = fem ? -0.04 : 0.02;
    b[BONE_IDX.SHIN_L].rotation.x = fem ? 0.07 : 0.02;
  }

  if (lookYaw) {
    b[BONE_IDX.HEAD].rotation.y += lookYaw;
  }

  b[BONE_IDX.ROOT].updateMatrixWorld(true);
}

/* ---------- 6. ОСВОБОЖДЕНИЕ РЕСУРСОВ WEBGL ---------- */
export function disposeZomboidCharacter(rig) {
  if (!rig) return;
  rig.group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}
