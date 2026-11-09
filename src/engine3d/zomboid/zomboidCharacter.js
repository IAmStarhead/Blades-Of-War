/* ============================================================================
   ГЕНЕРАТОР 3D-ПЕРСОНАЖЕЙ В СТИЛЕ PROJECT ZOMBOID B41+ (МУЖЧИНА И ЖЕНЩИНА)
   - Честные наружные нормали на всех частях тела (0 прозрачных граней!)
   - Монолитная шея без щелей под челюстью, чистые рукава без пробоя плеча
   - Спокойные серьёзные лица и цельные «шапки» средневековых причёсок/уборов
   - Прямые ноги и сдержанная реалистичная походка без «колеса»
   ============================================================================ */

import * as THREE from "three";
import {
  buildHeadTextureCanvas,
  buildHairTextureCanvas,
  buildBodyTextureCanvas,
  normalizeOutfitKey,
  canvasToThreeTexture
} from "./zomboidTextures.js";

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

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/* ---------- ПОСТРОИТЕЛЬ ЗАМКНУТОЙ СЕТКИ С ГАРАНТИЕЙ НАРУЖНЫХ НОРМАЛЕЙ ---------- */
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

  /* Соединяет кольца (phi от -PI до +PI, передняя точка на s = segs/2 имеет +Z, dP/ds = +X):
     - если кольца идут СНИЗУ ВВЕРХ (ascendingY = true, dP/dr = +Y): (+X) x (+Y) = +Z -> (r0[s], r0[s+1], r1[s+1], r1[s])
     - если кольца идут СВЕРХУ ВНИЗ (ascendingY = false, dP/dr = -Y): (-Y) x (+X) = +Z -> (r0[s], r1[s], r1[s+1], r0[s+1]) */
  connectRings(rings, ascendingY = true) {
    for (let r = 0; r < rings.length - 1; r++) {
      const r0 = rings[r];
      const r1 = rings[r + 1];
      const segs = r0.length - 1;
      for (let s = 0; s < segs; s++) {
        if (ascendingY) {
          this.addQuad(r0[s], r0[s + 1], r1[s + 1], r1[s]);
        } else {
          this.addQuad(r0[s], r1[s], r1[s + 1], r0[s + 1]);
        }
      }
    }
  }

  /* Закрывает торец кольца полюсной вершиной с гарантированной нормалью вверх (+Y) или вниз (-Y) */
  capRing(ring, apexIdx, outwardUp = true) {
    const segs = ring.length - 1;
    for (let s = 0; s < segs; s++) {
      if (outwardUp) {
        /* (ring[s] - apex)(+Z) x (ring[s+1] - apex)(+X) = +Y */
        this.addTri(apexIdx, ring[s], ring[s + 1]);
      } else {
        /* (ring[s+1] - apex)(+X) x (ring[s] - apex)(+Z) = -Y */
        this.addTri(apexIdx, ring[s + 1], ring[s]);
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

    /* Сварка нормалей на заднем UV-шве для гладкой закруглённой поверхности */
    const nAttr = geo.attributes.normal;
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

/* ---------- СОЗДАНИЕ 18-КОСТНОГО ГУМАНОИДНОГО СКЕЛЕТА ---------- */
export function createHumanoidSkeleton(female = false) {
  const bones = [];
  for (let i = 0; i < 18; i++) {
    bones.push(new THREE.Bone());
  }

  const hipY      = female ? 0.91 : 0.95;
  const spineY    = female ? 1.07 : 1.12;
  const chestY    = female ? 1.24 : 1.30;
  /* Компактная человеческая шея без «жирафьей» вытянутости (плотная посадка головы как в Zomboid!) */
  const neckY     = female ? 1.385 : 1.455;
  const headY     = female ? 1.450 : 1.525;

  const shoulderX = female ? 0.168 : 0.204;
  const shoulderY = female ? 1.35  : 1.42;
  const upperArmLen = female ? 0.255 : 0.275;
  const forearmLen  = female ? 0.235 : 0.255;

  /* Компактная анатомическая посадка тазобедренных суставов — чтобы ноги стояли и шли РОВНО! */
  const hipX     = female ? 0.082 : 0.086;
  const thighLen = female ? 0.41  : 0.43;
  const shinLen  = female ? 0.40  : 0.42;

  bones[BONE_IDX.ROOT].name = "root";
  bones[BONE_IDX.ROOT].position.set(0, 0, 0);

  bones[BONE_IDX.PELVIS].name = "pelvis";
  bones[BONE_IDX.PELVIS].position.set(0, hipY, 0);
  bones[BONE_IDX.ROOT].add(bones[BONE_IDX.PELVIS]);

  bones[BONE_IDX.SPINE].name = "spine";
  bones[BONE_IDX.SPINE].position.set(0, spineY - hipY, 0);
  bones[BONE_IDX.PELVIS].add(bones[BONE_IDX.SPINE]);

  bones[BONE_IDX.CHEST].name = "chest";
  bones[BONE_IDX.CHEST].position.set(0, chestY - spineY, 0);
  bones[BONE_IDX.SPINE].add(bones[BONE_IDX.CHEST]);

  bones[BONE_IDX.NECK].name = "neck";
  bones[BONE_IDX.NECK].position.set(0, neckY - chestY, 0);
  bones[BONE_IDX.CHEST].add(bones[BONE_IDX.NECK]);

  bones[BONE_IDX.HEAD].name = "head";
  bones[BONE_IDX.HEAD].position.set(0, headY - neckY, 0);
  bones[BONE_IDX.NECK].add(bones[BONE_IDX.HEAD]);

  /* Левая рука (+X) */
  bones[BONE_IDX.UPPER_ARM_L].name = "upperArmL";
  bones[BONE_IDX.FOREARM_L].name = "forearmL";
  bones[BONE_IDX.HAND_L].name = "handL";
  bones[BONE_IDX.UPPER_ARM_L].position.set(shoulderX, shoulderY - chestY, -0.006);
  bones[BONE_IDX.FOREARM_L].position.set(0, -upperArmLen, 0);
  bones[BONE_IDX.HAND_L].position.set(0, -forearmLen, 0);
  bones[BONE_IDX.CHEST].add(bones[BONE_IDX.UPPER_ARM_L]);
  bones[BONE_IDX.UPPER_ARM_L].add(bones[BONE_IDX.FOREARM_L]);
  bones[BONE_IDX.FOREARM_L].add(bones[BONE_IDX.HAND_L]);

  /* Правая рука (-X) */
  bones[BONE_IDX.UPPER_ARM_R].name = "upperArmR";
  bones[BONE_IDX.FOREARM_R].name = "forearmR";
  bones[BONE_IDX.HAND_R].name = "handR";
  bones[BONE_IDX.UPPER_ARM_R].position.set(-shoulderX, shoulderY - chestY, -0.006);
  bones[BONE_IDX.FOREARM_R].position.set(0, -upperArmLen, 0);
  bones[BONE_IDX.HAND_R].position.set(0, -forearmLen, 0);
  bones[BONE_IDX.CHEST].add(bones[BONE_IDX.UPPER_ARM_R]);
  bones[BONE_IDX.UPPER_ARM_R].add(bones[BONE_IDX.FOREARM_R]);
  bones[BONE_IDX.FOREARM_R].add(bones[BONE_IDX.HAND_R]);

  /* Левая нога (+X) */
  bones[BONE_IDX.THIGH_L].name = "thighL";
  bones[BONE_IDX.SHIN_L].name = "shinL";
  bones[BONE_IDX.FOOT_L].name = "footL";
  bones[BONE_IDX.THIGH_L].position.set(hipX, -0.03, 0);
  bones[BONE_IDX.SHIN_L].position.set(0, -thighLen, 0);
  bones[BONE_IDX.FOOT_L].position.set(0, -shinLen, 0.008);
  bones[BONE_IDX.PELVIS].add(bones[BONE_IDX.THIGH_L]);
  bones[BONE_IDX.THIGH_L].add(bones[BONE_IDX.SHIN_L]);
  bones[BONE_IDX.SHIN_L].add(bones[BONE_IDX.FOOT_L]);

  /* Правая нога (-X) */
  bones[BONE_IDX.THIGH_R].name = "thighR";
  bones[BONE_IDX.SHIN_R].name = "shinR";
  bones[BONE_IDX.FOOT_R].name = "footR";
  bones[BONE_IDX.THIGH_R].position.set(-hipX, -0.03, 0);
  bones[BONE_IDX.SHIN_R].position.set(0, -thighLen, 0);
  bones[BONE_IDX.FOOT_R].position.set(0, -shinLen, 0.008);
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

/* ---------- 1. ПОСТРОЕНИЕ ТЕЛА С ЧЕСТНЫМИ НОРМАЛЯМИ И МОНОЛИТНОЙ ШЕЕЙ ---------- */
export function buildSeamlessBodyGeometry(female = false, rawOutfit = "villager", metrics) {
  const outfit = normalizeOutfitKey(rawOutfit);
  const mb = new MeshBuilder(true);
  const m = metrics;

  /* === А. ТОРС, ТАЗ И СТВОЛ ШЕИ (идёт СНИЗУ ВВЕРХ -> ascendingY = true!) ===
     ВАЖНО: верхние кольца шеи уходят внутрь основания головы до headY + 0.055
     с весом 1.0 на кости HEAD, поэтому щель на шее исключена физически! */
  const torsoRows = female
    ? [
        [0.00, 0.85, 0.080, 0.068, 0.084, -0.006, BONE_IDX.PELVIS, 1.0, BONE_IDX.SPINE, 0.0],
        [0.10, 0.90, 0.154, 0.082, 0.112, -0.010, BONE_IDX.PELVIS, 0.95, BONE_IDX.SPINE, 0.05], // женственные бёдра
        [0.20, 0.96, 0.150, 0.082, 0.108, -0.008, BONE_IDX.PELVIS, 0.75, BONE_IDX.SPINE, 0.25],
        [0.32, 1.02, 0.122, 0.078, 0.090, -0.002, BONE_IDX.PELVIS, 0.30, BONE_IDX.SPINE, 0.70],
        [0.42, 1.08, 0.110, 0.076, 0.084,  0.002, BONE_IDX.SPINE,  0.85, BONE_IDX.CHEST, 0.15], // тонкая талия
        [0.52, 1.15, 0.122, 0.086, 0.090,  0.004, BONE_IDX.SPINE,  0.40, BONE_IDX.CHEST, 0.60],
        [0.62, 1.21, 0.132, 0.108, 0.094,  0.004, BONE_IDX.CHEST,  1.00, BONE_IDX.SPINE, 0.00],
        [0.70, 1.26, 0.136, 0.120, 0.096,  0.004, BONE_IDX.CHEST,  1.00, BONE_IDX.NECK,  0.00], // грудь
        [0.78, 1.32, 0.144, 0.092, 0.092, -0.002, BONE_IDX.CHEST,  0.95, BONE_IDX.NECK,  0.05],
        [0.85, 1.36, 0.146, 0.078, 0.084, -0.005, BONE_IDX.CHEST,  0.85, BONE_IDX.NECK,  0.15], // плавный скат к дельте рукава
        [0.90, 1.39, 0.098, 0.062, 0.068, -0.005, BONE_IDX.NECK,   0.55, BONE_IDX.CHEST, 0.45], // трапеция
        [0.94, 1.42, 0.053, 0.049, 0.054, -0.004, BONE_IDX.NECK,   0.80, BONE_IDX.HEAD,  0.20], // аккуратная короткая шея
        [0.97, 1.46, 0.048, 0.047, 0.052, -0.002, BONE_IDX.HEAD,   0.80, BONE_IDX.NECK,  0.20],
        [1.00, 1.51, 0.044, 0.044, 0.048,  0.000, BONE_IDX.HEAD,   1.00, BONE_IDX.NECK,  0.00]
      ]
    : [
        [0.00, 0.88, 0.088, 0.072, 0.090, -0.006, BONE_IDX.PELVIS, 1.0, BONE_IDX.SPINE, 0.0],
        [0.10, 0.94, 0.146, 0.088, 0.112, -0.008, BONE_IDX.PELVIS, 0.92, BONE_IDX.SPINE, 0.08],
        [0.21, 1.00, 0.144, 0.092, 0.106, -0.004, BONE_IDX.PELVIS, 0.65, BONE_IDX.SPINE, 0.35],
        [0.33, 1.08, 0.142, 0.096, 0.102,  0.002, BONE_IDX.SPINE,  0.85, BONE_IDX.PELVIS, 0.15],
        [0.46, 1.17, 0.156, 0.108, 0.110,  0.004, BONE_IDX.SPINE,  0.45, BONE_IDX.CHEST, 0.55],
        [0.58, 1.26, 0.168, 0.118, 0.116,  0.004, BONE_IDX.CHEST,  1.00, BONE_IDX.SPINE, 0.00],
        [0.70, 1.34, 0.178, 0.118, 0.116,  0.000, BONE_IDX.CHEST,  1.00, BONE_IDX.NECK,  0.00],
        [0.81, 1.42, 0.182, 0.096, 0.102, -0.005, BONE_IDX.CHEST,  0.88, BONE_IDX.NECK,  0.12], // плавный мужской разворот плеч
        [0.88, 1.46, 0.126, 0.078, 0.084, -0.006, BONE_IDX.NECK,   0.50, BONE_IDX.CHEST, 0.50], // крепкие трапеции
        [0.93, 1.49, 0.066, 0.060, 0.065, -0.004, BONE_IDX.NECK,   0.80, BONE_IDX.HEAD,  0.20], // коренастая мужская шея
        [0.97, 1.54, 0.059, 0.057, 0.062, -0.002, BONE_IDX.HEAD,   0.85, BONE_IDX.NECK,  0.15],
        [1.00, 1.59, 0.052, 0.052, 0.056,  0.000, BONE_IDX.HEAD,   1.00, BONE_IDX.NECK,  0.00]
      ];

  const armorBulk = outfit === "warrior" ? 1.05 : (outfit === "villager" ? 1.02 : 1.0);
  const segsTorso = 20;
  const torsoRings = [];

  for (let r = 0; r < torsoRows.length; r++) {
    const [tTorso, y, rxBase, rzFBase, rzBBase, zOff, b0, w0, b1, w1] = torsoRows[r];
    /* Не раздуваем шею (tTorso > 0.88) бронёй! */
    const bulk = tTorso > 0.88 ? 1.0 : armorBulk;
    const rx = rxBase * bulk;
    const rzF = rzFBase * bulk;
    const rzB = rzBBase * bulk;

    /* Полоса 0 в текстуре: cy = 2..190 (снизу вверх: tTorso=0 -> cy=190, tTorso=1 -> cy=2) */
    const vTex = 1 - lerp(190, 2, tTorso) / 512;
    const ring = [];

    for (let s = 0; s <= segsTorso; s++) {
      const uFrac = s / segsTorso;
      const phi = (uFrac - 0.5) * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      let rz = cosP >= 0 ? rzF : rzB;
      if (female && cosP > 0.15 && tTorso > 0.56 && tTorso < 0.78) {
        const breastWindow = Math.sin(((tTorso - 0.56) / 0.22) * Math.PI);
        const twinCup = Math.pow(Math.sin(Math.min(1, Math.abs(sinP) * 1.85) * Math.PI), 1.3);
        rz += 0.016 * breastWindow * twinCup;
      }

      const x = sinP * rx;
      const z = zOff + cosP * rz;
      ring.push(mb.addVertex(x, y, z, uFrac, vTex, b0, w0, b1, w1));
    }
    mb.seamPairs.push([ring[0], ring[segsTorso]]);
    torsoRings.push(ring);
  }

  /* ВАЖНО: кольца торса идут СНИЗУ ВВЕРХ -> ascendingY = true (наружные нормали!) */
  mb.connectRings(torsoRings, true);

  /* Нижняя крышка таза (смотрит вниз -> outwardUp = false) */
  const crotchCenter = mb.addVertex(0, torsoRows[0][1] - 0.012, -0.008, 0.5, 1 - 190 / 512, BONE_IDX.PELVIS, 1, 0, 0);
  mb.capRing(torsoRings[0], crotchCenter, false);

  /* === Б. РУКИ С ЦЕЛЬНЫМ ПЛЕЧОМ И КИСТЯМИ (идут СВЕРХУ ВНИЗ -> ascendingY = false!) === */
  function buildArm(isLeft) {
    const sign = isLeft ? 1 : -1;
    const bUpper = isLeft ? BONE_IDX.UPPER_ARM_L : BONE_IDX.UPPER_ARM_R;
    const bFore  = isLeft ? BONE_IDX.FOREARM_L   : BONE_IDX.FOREARM_R;
    const bHand  = isLeft ? BONE_IDX.HAND_L      : BONE_IDX.HAND_R;

    const sx = sign * m.shoulderX;
    const sy = m.shoulderY;
    const ex = sx + sign * 0.008;
    const ey = sy - m.upperArmLen;
    const wx = ex + sign * 0.006;
    const wy = ey - m.forearmLen;

    const musc = female ? 0.85 : 1.04;
    const sleeveBulk = outfit === "warrior" ? 1.09 : (outfit === "villager" ? 1.04 : 1.0);

    const armStations = [
      /* 0: Внутренний корень плеча плавно утоплен в скат ключицы (никакой ступеньки на плече!) */
      [0.00, sx - sign * 0.056, sy + 0.022, -0.005, 0.030 * musc * sleeveBulk, 0.036 * musc * sleeveBulk, BONE_IDX.CHEST, 0.90, bUpper, 0.10],
      /* 1: Округлый купол дельты плеча */
      [0.08, sx - sign * 0.014, sy + 0.004, -0.005, 0.054 * musc * sleeveBulk, 0.058 * musc * sleeveBulk, BONE_IDX.CHEST, 0.52, bUpper, 0.48],
      /* 2: Низ дельты */
      [0.18, sx + sign * 0.004, sy - 0.040, -0.005, 0.053 * musc * sleeveBulk, 0.056 * musc * sleeveBulk, BONE_IDX.CHEST, 0.15, bUpper, 0.85],
      /* 3: Середина плеча (бицепс/трицепс) */
      [0.32, lerp(sx, ex, 0.52), lerp(sy, ey, 0.52), -0.004, 0.046 * musc * sleeveBulk, 0.049 * musc * sleeveBulk, bUpper, 1.0, bFore, 0.0],
      /* 4: Над локтем */
      [0.44, lerp(sx, ex, 0.88), lerp(sy, ey, 0.88), -0.006, 0.039 * musc, 0.041 * musc, bUpper, 0.72, bFore, 0.28],
      /* 5: Локтевой сустав */
      [0.50, ex, ey, -0.007, 0.038 * musc, 0.040 * musc, bUpper, 0.48, bFore, 0.52],
      /* 6: Верх предплечья */
      [0.60, lerp(ex, wx, 0.26), lerp(ey, wy, 0.26), -0.002, 0.041 * musc, 0.042 * musc, bFore, 0.92, bUpper, 0.08],
      /* 7: Середина предплечья */
      [0.74, lerp(ex, wx, 0.66), lerp(ey, wy, 0.66),  0.003, 0.033 * musc, 0.035 * musc, bFore, 1.0, bHand, 0.0],
      /* 8: Запястье */
      [0.85, wx, wy, 0.008, 0.026 * musc, 0.023 * musc, bFore, 0.45, bHand, 0.55],
      /* 9: Ладонь */
      [0.92, wx + sign * 0.002, wy - 0.040, 0.012, 0.020 * musc, 0.036 * musc, bHand, 1.0, bFore, 0.0],
      /* 10: Пальцы */
      [0.98, wx - sign * 0.004, wy - 0.082, 0.016, 0.016 * musc, 0.030 * musc, bHand, 1.0, bFore, 0.0],
      /* 11: Кончики пальцев */
      [1.00, wx - sign * 0.008, wy - 0.106, 0.018, 0.010 * musc, 0.020 * musc, bHand, 1.0, bFore, 0.0]
    ];

    const segsArm = 12;
    const rings = [];
    for (let i = 0; i < armStations.length; i++) {
      const [tA, cx, cy, cz, rx, rz, b0, w0, b1, w1] = armStations[i];
      const vTex = lerp(1 - 194 / 512, 1 - 302 / 512, tA);
      const ring = [];
      for (let s = 0; s <= segsArm; s++) {
        const uFrac = s / segsArm;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        ring.push(mb.addVertex(cx + Math.sin(phi) * rx, cy, cz + Math.cos(phi) * rz, uFrac, vTex, b0, w0, b1, w1));
      }
      mb.seamPairs.push([ring[0], ring[segsArm]]);
      rings.push(ring);
    }

    /* ВАЖНО: кольца руки идут СВЕРХУ ВНИЗ -> ascendingY = false (честные наружные нормали — 0 прозрачности!) */
    const capTop = mb.addVertex(sx - sign * 0.062, sy + 0.024, -0.005, 0.5, 1 - 194 / 512, BONE_IDX.CHEST, 0.92, bUpper, 0.08);
    mb.capRing(rings[0], capTop, true);
    mb.connectRings(rings, false);

    const tip = mb.addVertex(wx - sign * 0.010, wy - 0.114, 0.018, 0.5, 1 - 302 / 512, bHand, 1, 0, 0);
    mb.capRing(rings[rings.length - 1], tip, false);

    /* Большой палец (тоже СВЕРХУ ВНИЗ -> ascendingY = false) */
    const thumbRings = [];
    const thumbSteps = [
      [0.88, wx - sign * 0.005, wy - 0.024, 0.032, 0.012 * musc],
      [0.95, wx - sign * 0.010, wy - 0.052, 0.046, 0.010 * musc],
      [0.99, wx - sign * 0.012, wy - 0.072, 0.052, 0.007 * musc]
    ];
    for (let ti = 0; ti < thumbSteps.length; ti++) {
      const [tT, tx, ty, tz, tr] = thumbSteps[ti];
      const vTex = lerp(1 - 194 / 512, 1 - 302 / 512, tT);
      const tring = [];
      for (let s = 0; s <= 6; s++) {
        const uFrac = s / 6;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        tring.push(mb.addVertex(tx + Math.sin(phi) * tr, ty, tz + Math.cos(phi) * tr, uFrac, vTex, bHand, 1, 0, 0));
      }
      mb.seamPairs.push([tring[0], tring[6]]);
      thumbRings.push(tring);
    }
    mb.connectRings(thumbRings, false);
    const tTip = mb.addVertex(wx - sign * 0.012, wy - 0.078, 0.054, 0.5, 1 - 302 / 512, bHand, 1, 0, 0);
    mb.capRing(thumbRings[2], tTip, false);
  }

  buildArm(true);
  buildArm(false);

  /* === В. РОВНЫЕ СТРОЙНЫЕ НОГИ И ОБУВЬ (идут СВЕРХУ ВНИЗ -> ascendingY = false!) === */
  function buildLeg(isLeft) {
    const sign = isLeft ? 1 : -1;
    const bThigh = isLeft ? BONE_IDX.THIGH_L : BONE_IDX.THIGH_R;
    const bShin  = isLeft ? BONE_IDX.SHIN_L  : BONE_IDX.SHIN_R;
    const bFoot  = isLeft ? BONE_IDX.FOOT_L  : BONE_IDX.FOOT_R;

    const hx = sign * m.hipX;
    const hy = m.hipY - 0.03;
    const kx = sign * (m.hipX * 0.94); // прямая вертикальная ось ноги без дуги «колесом»!
    const ky = hy - m.thighLen;
    const ax = sign * (m.hipX * 0.90);
    const ay = ky - m.shinLen;

    const pantsBulk = outfit === "underwear" ? 1.0 : 1.05;

    const legStations = [
      [0.00, hx * 0.96, hy + 0.075, -0.005, (female ? 0.074 : 0.074) * pantsBulk, (female ? 0.080 : 0.082) * pantsBulk, BONE_IDX.PELVIS, 0.68, bThigh, 0.32],
      [0.14, hx * 0.99, lerp(hy, ky, 0.14), 0.000, (female ? 0.079 : 0.078) * pantsBulk, (female ? 0.082 : 0.084) * pantsBulk, BONE_IDX.PELVIS, 0.18, bThigh, 0.82],
      [0.34, lerp(hx, kx, 0.52), lerp(hy, ky, 0.52),  0.004, (female ? 0.067 : 0.070) * pantsBulk, (female ? 0.072 : 0.076) * pantsBulk, bThigh, 1.0, bShin, 0.0],
      [0.46, lerp(hx, kx, 0.88), lerp(hy, ky, 0.88),  0.000, (female ? 0.053 : 0.056) * pantsBulk, (female ? 0.056 : 0.060) * pantsBulk, bThigh, 0.74, bShin, 0.26],
      [0.52, kx, ky, 0.002, (female ? 0.050 : 0.054) * pantsBulk, (female ? 0.054 : 0.058) * pantsBulk, bThigh, 0.48, bShin, 0.52],
      [0.66, lerp(kx, ax, 0.30), lerp(ky, ay, 0.30), -0.010, (female ? 0.052 : 0.058) * pantsBulk, (female ? 0.058 : 0.065) * pantsBulk, bShin, 0.95, bThigh, 0.05],
      [0.83, lerp(kx, ax, 0.68), lerp(ky, ay, 0.68), -0.005, (female ? 0.042 : 0.046) * pantsBulk, (female ? 0.045 : 0.050) * pantsBulk, bShin, 1.0, bFoot, 0.0],
      [0.96, ax, ay + 0.022, -0.002, (female ? 0.036 : 0.041) * pantsBulk, (female ? 0.040 : 0.045) * pantsBulk, bShin, 0.50, bFoot, 0.50]
    ];

    const segsLeg = 14;
    const rings = [];
    for (let i = 0; i < legStations.length; i++) {
      const [tL, cx, cy, cz, rx, rz, b0, w0, b1, w1] = legStations[i];
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

    /* Обувь (продолжается вниз до самой подошвы y = 0.002 -> тоже СВЕРХУ ВНИЗ!) */
    const bootScale = female ? 0.92 : 1.02;
    const footSpecs = [
      [0.25, ax, 0.052, 0.018, 0.044 * bootScale, 0.068 * bootScale],
      [0.65, ax, 0.028, 0.046, 0.048 * bootScale, 0.104 * bootScale],
      [0.95, ax, 0.004, 0.046, 0.046 * bootScale, 0.102 * bootScale]
    ];
    for (let f = 0; f < footSpecs.length; f++) {
      const [tF, fx, fy, fz, frx, frz] = footSpecs[f];
      const vTex = lerp(1 - 434 / 512, 1 - 508 / 512, tF);
      const ring = [];
      for (let s = 0; s <= segsLeg; s++) {
        const uFrac = s / segsLeg;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        const cosP = Math.cos(phi);
        const zStretch = cosP >= 0 ? frz * 1.12 : frz * 0.68;
        ring.push(mb.addVertex(fx + Math.sin(phi) * frx, fy, fz + cosP * zStretch, uFrac, vTex, bFoot, 1.0, bShin, 0.0));
      }
      mb.seamPairs.push([ring[0], ring[segsLeg]]);
      rings.push(ring);
    }

    /* ВАЖНО: все кольца ноги и ботинка идут СВЕРХУ ВНИЗ -> ascendingY = false! */
    mb.connectRings(rings, false);

    const soleCenter = mb.addVertex(ax, 0.002, 0.042, 0.5, 1 - 510 / 512, bFoot, 1, 0, 0);
    mb.capRing(rings[rings.length - 1], soleCenter, false);
  }

  buildLeg(true);
  buildLeg(false);

  return mb.toGeometry();
}

/* ---------- 2. СПОКОЙНАЯ КРЕПКАЯ 3D-ГОЛОВА В СТИЛЕ PROJECT ZOMBOID ----------
   Никакой «груши» и «клюва»! Чёткая линия нижней челюсти, прямой лоб,
   умеренный прямой нос и глубокая посадка на шею без щели. */
export function buildSculptedHeadGeometry(female = false, hasBeard = false) {
  const mb = new MeshBuilder(false);
  const segsU = 22;
  const segsV = 16;

  /* Благородная человеческая пропорция ширины к высоте ~0.68 (никакого «круглого колобка»!) */
  const rxBase = female ? 0.075 : 0.081;
  const ryHalf = female ? 0.114 : 0.120;
  const rzBase = female ? 0.095 : 0.102;
  const centerY = female ? 0.092 : 0.096;

  const rings = [];
  for (let r = 0; r <= segsV; r++) {
    const vFrac = r / segsV; // 0 = под челюстью, 1 = темя (идёт СНИЗУ ВВЕРХ!)
    const theta = (vFrac - 0.5) * Math.PI;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const ring = [];
    for (let s = 0; s <= segsU; s++) {
      const uFrac = s / segsU;
      const phi = (uFrac - 0.5) * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      let rx = rxBase * Math.pow(Math.max(0.14, cosT), 0.85);
      let rz = rzBase * Math.pow(Math.max(0.14, cosT), 0.82);
      let y = centerY + sinT * ryHalf;

      /* Плоские человеческие виски (вместо раздутых боков шара!) */
      const templeFlatten = Math.pow(Math.abs(sinP), 2.2) * Math.exp(-Math.pow((vFrac - 0.56) / 0.26, 2));
      rx *= (1 - 0.08 * templeFlatten);

      /* 1. Естественное сужение щёк книзу + крепкие углы челюсти и подбородка */
      if (vFrac < 0.48) {
        const jawT = Math.max(0, (0.48 - vFrac) / 0.48);
        /* Мягкое анатомическое сужение от скул к нижней челюсти */
        rx *= lerp(1.0, female ? 0.82 : 0.90, jawT * 0.65);

        if (cosP > 0) {
          const chinMask = Math.exp(-Math.pow(phi / (female ? 0.42 : 0.56), 2)) * Math.exp(-Math.pow((vFrac - 0.17) / 0.12, 2));
          rz += chinMask * (female ? 0.011 : (hasBeard ? 0.022 : 0.015));
          if (!female && hasBeard && vFrac < 0.24) {
            y -= chinMask * 0.009;
          }
        } else {
          rz *= lerp(1.0, 0.76, jawT);
        }
      }

      /* 2. Плоский спокойный лоб и надбровная полка (vFrac = 0.54..0.78) */
      if (cosP > 0.2 && vFrac > 0.52 && vFrac < 0.80) {
        const browRidge = Math.exp(-Math.pow(phi / 0.65, 2)) * Math.exp(-Math.pow((vFrac - 0.57) / 0.045, 2));
        rz += browRidge * (female ? 0.004 : 0.009);
      }

      let x = sinP * rx;
      let z = cosP * rz;

      /* 3. Неглубокая тень глазниц (vFrac ~ 0.515) */
      if (cosP > 0.45) {
        const eyeDist = Math.min(Math.abs(phi - 0.36), Math.abs(phi + 0.36));
        const socket = Math.exp(-Math.pow(eyeDist / 0.16, 2)) * Math.exp(-Math.pow((vFrac - 0.515) / 0.045, 2));
        z -= socket * 0.006;
      }

      /* 4. Умеренный прямой нос с переносицей (БЕЗ острого птичьего клюва!) */
      if (Math.abs(phi) < 0.20 && vFrac > 0.39 && vFrac < 0.56) {
        const noseW = Math.cos((phi / 0.20) * Math.PI * 0.5);
        /* Плавная прямая спинка от переносицы (0.54) к кончику (0.43) и крутой срез под носом */
        let noseProfile = 0;
        if (vFrac >= 0.43) {
          noseProfile = lerp(1.0, 0.42, (vFrac - 0.43) / 0.13);
        } else {
          noseProfile = Math.max(0, (vFrac - 0.39) / 0.04);
        }
        z += noseW * noseProfile * (female ? 0.015 : 0.018);
      }

      /* 5. Компактные уши по бокам (phi ~ +-1.55) */
      const earMask = Math.exp(-Math.pow((Math.abs(phi) - 1.55) / 0.13, 2)) * Math.exp(-Math.pow((vFrac - 0.50) / 0.08, 2));
      x += Math.sign(sinP || 1) * earMask * 0.012;

      ring.push(mb.addVertex(x, y, z, uFrac, vFrac));
    }
    mb.seamPairs.push([ring[0], ring[segsU]]);
    rings.push(ring);
  }

  /* Кольца головы идут СНИЗУ ВВЕРХ -> ascendingY = true! */
  const bottomPole = mb.addVertex(0, centerY - ryHalf, -0.004, 0.5, 0.0);
  mb.capRing(rings[0], bottomPole, false);
  mb.connectRings(rings, true);
  const topPole = mb.addVertex(0, centerY + ryHalf, -0.002, 0.5, 1.0);
  mb.capRing(rings[rings.length - 1], topPole, true);

  return mb.toGeometry();
}

/* ---------- 3. ПРИЧЁСКИ И ГОЛОВНЫЕ УБОРЫ «КАК ЦЕЛЬНАЯ ШАПКА» (SOLID CAP MESH) ----------
   Никаких «штор» и никаких дырок на макушке!
   Каждая причёска — замкнутый цельный 3D-объект с полюсом на темени и подворотом внутрь черепа:
   - "classic": северная стрижка «шапкой» у мужчины / собранные назад волосы с пучком кос у женщины
   - "long": удлинённый зачёс за уши у мужчины / убранные за плечи волосы у женщины
   - "headwear": суконная шапка с меховым околышем у мужчины / средневековый льняной плат-убрус у женщины */
export function buildZomboidHairGeometry(female = false, styleKey = "classic") {
  const mb = new MeshBuilder(false);
  const segsU = 22;

  /* Вспомогательная сборка замкнутого купола «шапки» от макушки вниз (СВЕРХУ ВНИЗ -> ascendingY = false!).
     Каждая строка profileRows: [vTex, baseY, frontLiftY, rx, rzFront, rzBack, zShift]
     За счёт frontLiftY кромка шапки спереди поднимается надо лбом и открывает лицо без всяких разрезов и дыр! */
  function buildSolidCap(apexY, apexZ, profileRows) {
    const capRings = [];
    for (let r = 0; r < profileRows.length; r++) {
      const [vTex, baseY, frontLiftY, rx, rzF, rzB, zShift] = profileRows[r];
      const ring = [];
      for (let s = 0; s <= segsU; s++) {
        const uFrac = s / segsU;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);

        /* Плавный купол надо лбом и лицом (cosP > 0 — передняя сторона головы) */
        const faceArch = Math.pow(Math.max(0, cosP), 1.35);
        /* Уши на боках тоже чуть приоткрываем при необходимости */
        const y = baseY + faceArch * frontLiftY;
        const rz = cosP >= 0 ? rzF : rzB;
        const x = sinP * rx;
        const z = zShift + cosP * rz;

        ring.push(mb.addVertex(x, y, z, uFrac, vTex));
      }
      mb.seamPairs.push([ring[0], ring[segsU]]);
      capRings.push(ring);
    }

    const apex = mb.addVertex(0, apexY, apexZ, 0.5, 0.99);
    mb.capRing(capRings[0], apex, true);
    mb.connectRings(capRings, false);
    const innerClose = mb.addVertex(0, profileRows[profileRows.length - 1][1] + 0.02, -0.02, 0.5, 0.02);
    mb.capRing(capRings[capRings.length - 1], innerClose, false);
  }

  /* Вспомогательная замкнутая сфера-пучок кос на затылке */
  function addBackBun(cy, cz, rx, ry, rz) {
    const bunRings = [];
    const rows = 6;
    const cols = 12;
    for (let r = 1; r < rows; r++) {
      const t = r / rows; // сверху вниз
      const th = (0.5 - t) * Math.PI;
      const cT = Math.cos(th);
      const sT = Math.sin(th);
      const ring = [];
      for (let s = 0; s <= cols; s++) {
        const u = s / cols;
        const phi = (u - 0.5) * Math.PI * 2;
        ring.push(mb.addVertex(Math.sin(phi) * rx * cT, cy + sT * ry, cz + Math.cos(phi) * rz * cT, u, 1 - t));
      }
      mb.seamPairs.push([ring[0], ring[cols]]);
      bunRings.push(ring);
    }
    const topP = mb.addVertex(0, cy + ry, cz, 0.5, 0.98);
    const botP = mb.addVertex(0, cy - ry, cz, 0.5, 0.02);
    mb.capRing(bunRings[0], topP, true);
    mb.connectRings(bunRings, false);
    mb.capRing(bunRings[bunRings.length - 1], botP, false);
  }

  if (styleKey === "headwear") {
    if (female) {
      /* Средневековый женский плат / убрус: аккуратно обрамляет лоб и щёки, закрывая голову и шею сзади */
      buildSolidCap(0.220, -0.006, [
        [0.92, 0.210, 0.002, 0.044, 0.050, 0.054, -0.005],
        [0.76, 0.184, 0.006, 0.086, 0.100, 0.108, -0.005],
        [0.54, 0.128, 0.032, 0.092, 0.096, 0.114, -0.008], // надо лбом край плата на y ~ 0.160!
        [0.30, 0.048, 0.108, 0.096, 0.084, 0.118, -0.014],
        [0.08, -0.022, 0.172, 0.092, 0.070, 0.112, -0.020],
        [0.02, -0.016, 0.168, 0.064, 0.054, 0.082, -0.018]
      ]);
    } else {
      /* Тёплая северная средневековая суконная шапка с меховым околышем */
      buildSolidCap(0.242, -0.005, [
        [0.94, 0.232, 0.000, 0.050, 0.056, 0.058, -0.004],
        [0.74, 0.200, 0.002, 0.090, 0.106, 0.110, -0.004],
        [0.45, 0.160, 0.004, 0.096, 0.112, 0.116, -0.004],
        [0.14, 0.124, 0.018, 0.097, 0.112, 0.117, -0.005], // меховой околыш сидит уверенно надо бровями (y=0.142)!
        [0.02, 0.130, 0.016, 0.076, 0.088, 0.092, -0.005]
      ]);
    }
    return mb.toGeometry();
  }

  if (styleKey === "long") {
    if (female) {
      /* Цельная шапка женских волос, обрамляющая лоб и плавно спускающаяся по спине */
      buildSolidCap(0.216, -0.006, [
        [0.94, 0.206, 0.002, 0.042, 0.048, 0.052, -0.005],
        [0.80, 0.180, 0.006, 0.084, 0.099, 0.108, -0.006],
        [0.62, 0.128, 0.032, 0.090, 0.094, 0.114, -0.010], // естественная линия волос надо лбом (y=0.160)!
        [0.42, 0.052, 0.104, 0.094, 0.072, 0.120, -0.022],
        [0.20, -0.032, 0.184, 0.088, 0.058, 0.116, -0.032],
        [0.06, -0.068, 0.216, 0.070, 0.048, 0.094, -0.034],
        [0.02, -0.055, 0.205, 0.048, 0.040, 0.066, -0.028]
      ]);
    } else {
      /* Северный мужской зачёс средней длины до затылка */
      buildSolidCap(0.224, -0.006, [
        [0.94, 0.214, 0.002, 0.044, 0.050, 0.056, -0.005],
        [0.78, 0.188, 0.006, 0.090, 0.105, 0.112, -0.006],
        [0.56, 0.136, 0.030, 0.094, 0.098, 0.116, -0.010], // естественный лоб (y=0.166)!
        [0.30, 0.070, 0.092, 0.092, 0.076, 0.116, -0.018],
        [0.10, 0.022, 0.138, 0.080, 0.062, 0.102, -0.022],
        [0.02, 0.032, 0.130, 0.058, 0.050, 0.074, -0.018]
      ]);
    }
    return mb.toGeometry();
  }

  /* === ПО УМОЛЧАНИЮ ("classic"): СРЕДНЕВЕКОВЫЕ ПРИЧЁСКИ-ШАПКИ === */
  if (female) {
    buildSolidCap(0.215, -0.005, [
      [0.94, 0.206, 0.002, 0.042, 0.048, 0.052, -0.004],
      [0.78, 0.180, 0.005, 0.084, 0.098, 0.106, -0.005],
      [0.54, 0.126, 0.032, 0.088, 0.094, 0.110, -0.008], // нормальная высота женского лба (y=0.158)!
      [0.26, 0.066, 0.088, 0.084, 0.074, 0.106, -0.014],
      [0.06, 0.042, 0.110, 0.066, 0.058, 0.086, -0.014],
      [0.02, 0.050, 0.104, 0.050, 0.046, 0.064, -0.012]
    ]);
    addBackBun(0.084, -0.112, 0.045, 0.044, 0.040);
  } else {
    buildSolidCap(0.224, -0.004, [
      [0.94, 0.214, 0.002, 0.044, 0.050, 0.054, -0.004],
      [0.76, 0.188, 0.005, 0.089, 0.104, 0.110, -0.005],
      [0.50, 0.136, 0.028, 0.092, 0.098, 0.112, -0.008], // крепкий мужской лоб (y=0.164)!
      [0.22, 0.082, 0.080, 0.085, 0.076, 0.106, -0.014],
      [0.04, 0.064, 0.096, 0.068, 0.060, 0.084, -0.014],
      [0.01, 0.072, 0.090, 0.054, 0.050, 0.066, -0.012]
    ]);
  }

  return mb.toGeometry();
}

/* ---------- 4. СБОРКА ГОТОВОГО 3D-ПЕРСОНАЖА ---------- */
export function createZomboidCharacter3D(opts = {}) {
  const female = !!opts.female;
  const outfit = normalizeOutfitKey(opts.outfit);
  const hairStyle = opts.hairStyle || "classic";
  const hairColor = opts.hairColor || (female ? "#4f2d1b" : "#5a361e");
  const hasBeard = !female && opts.beard !== false;

  const group = new THREE.Group();
  group.name = female ? "ZomboidFemale" : "ZomboidMale";

  const { bones, skeleton, metrics } = createHumanoidSkeleton(female);
  group.add(bones[BONE_IDX.ROOT]);

  const bodyCv = buildBodyTextureCanvas({ female, outfit }, opts.canvasFactory);
  const headCv = buildHeadTextureCanvas({ female, hairColor, beard: hasBeard }, opts.canvasFactory);
  const hairCv = buildHairTextureCanvas(hairColor, hairStyle, female, opts.canvasFactory);

  const bodyTex = canvasToThreeTexture(bodyCv);
  const headTex = canvasToThreeTexture(headCv);
  const hairTex = canvasToThreeTexture(hairCv);

  const bodyMat = new THREE.MeshLambertMaterial({ map: bodyTex });
  const headMat = new THREE.MeshLambertMaterial({ map: headTex });
  const hairMat = new THREE.MeshLambertMaterial({ map: hairTex }); // замкнутая шапка — даже DoubleSide не нужен!

  const bodyGeo = buildSeamlessBodyGeometry(female, outfit, metrics);
  const bodyMesh = new THREE.SkinnedMesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.frustumCulled = false;
  bodyMesh.bind(skeleton);
  group.add(bodyMesh);

  /* Естественный масштаб 1:1 (без раздувания и отрыва от шеи!) */
  const headGeo = buildSculptedHeadGeometry(female, hasBeard);
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  bones[BONE_IDX.HEAD].add(headMesh);

  const hairGeo = buildZomboidHairGeometry(female, hairStyle);
  const hairMesh = new THREE.Mesh(hairGeo, hairMat);
  hairMesh.castShadow = true;
  hairMesh.receiveShadow = true;
  bones[BONE_IDX.HEAD].add(hairMesh);

  /* Мягкое контактное пятно тени под подошвами */
  const shadowGeo = new THREE.CircleGeometry(0.28, 20);
  shadowGeo.rotateX(-Math.PI * 0.5);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x0b0d10,
    transparent: true,
    opacity: 0.34,
    depthWrite: false
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.002;
  group.add(contactShadow);

  const rig = {
    group,
    female,
    outfit,
    hairStyle,
    bones,
    skeleton,
    metrics,
    bodyMesh,
    headMesh,
    hairMesh,
    textures: { bodyCv, headCv, hairCv, bodyTex, headTex, hairTex },
    setOutfit(nextRawOutfit, canvasFactory = null) {
      const nextOutfit = normalizeOutfitKey(nextRawOutfit);
      if (rig.outfit === nextOutfit) return;
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
    },
    setHairStyle(nextStyle, canvasFactory = null) {
      if (rig.hairStyle === nextStyle) return;
      rig.hairStyle = nextStyle;
      const nextHairCv = buildHairTextureCanvas(hairColor, nextStyle, female, canvasFactory);
      const nextHairTex = canvasToThreeTexture(nextHairCv);
      hairMat.map.dispose();
      hairMat.map = nextHairTex;
      hairMat.needsUpdate = true;

      const nextHairGeo = buildZomboidHairGeometry(female, nextStyle);
      hairMesh.geometry.dispose();
      hairMesh.geometry = nextHairGeo;
    }
  };

  poseZomboidCharacter(rig, "idle", 0);
  return rig;
}

/* ---------- 5. СДЕРЖАННАЯ ЕСТЕСТВЕННАЯ СКЕЛЕТНАЯ АНИМАЦИЯ (БЕЗ НОГ «КОЛЕСОМ»!) ---------- */
export function poseZomboidCharacter(rig, mode = "idle", timeSec = 0, opts = {}) {
  const b = rig.bones;
  const fem = rig.female;
  const lookYaw = opts.lookYaw || 0;

  for (let i = 0; i < b.length; i++) {
    b[i].rotation.set(0, 0, 0);
  }
  b[BONE_IDX.PELVIS].position.y = rig.metrics.hipY;

  if (mode === "walk") {
    /* Спокойный человеческий шаг в духе Zomboid: компактная амплитуда ~16°, прямые колени без «колеса»! */
    const w = timeSec * 4.0;
    const s = Math.sin(w);
    const c = Math.cos(w);

    b[BONE_IDX.PELVIS].position.y = rig.metrics.hipY - 0.012 + Math.abs(c) * 0.016;
    b[BONE_IDX.PELVIS].rotation.y = s * (fem ? 0.06 : 0.045);
    b[BONE_IDX.PELVIS].rotation.z = c * (fem ? 0.022 : 0.014);

    b[BONE_IDX.SPINE].rotation.y = -s * 0.035;
    b[BONE_IDX.CHEST].rotation.y = -s * 0.055;
    b[BONE_IDX.CHEST].rotation.x = 0.025;
    b[BONE_IDX.HEAD].rotation.y = s * 0.03;

    b[BONE_IDX.UPPER_ARM_L].rotation.z = fem ? 0.09 : 0.11;
    b[BONE_IDX.UPPER_ARM_R].rotation.z = fem ? -0.09 : -0.11;
    b[BONE_IDX.UPPER_ARM_L].rotation.x = s * 0.28;
    b[BONE_IDX.UPPER_ARM_R].rotation.x = -s * 0.28;
    b[BONE_IDX.FOREARM_L].rotation.x = -0.22 - Math.max(0, -s) * 0.18;
    b[BONE_IDX.FOREARM_R].rotation.x = -0.22 - Math.max(0, s) * 0.18;

    /* Строго продольный компактный мах бедра (никаких разведённых в стороны коленей!) */
    b[BONE_IDX.THIGH_L].rotation.x = -s * 0.28;
    b[BONE_IDX.THIGH_R].rotation.x = s * 0.28;
    b[BONE_IDX.SHIN_L].rotation.x = Math.max(0, s) * 0.46 + 0.04;
    b[BONE_IDX.SHIN_R].rotation.x = Math.max(0, -s) * 0.46 + 0.04;
    b[BONE_IDX.FOOT_L].rotation.x = -b[BONE_IDX.THIGH_L].rotation.x * 0.45 - b[BONE_IDX.SHIN_L].rotation.x * 0.38;
    b[BONE_IDX.FOOT_R].rotation.x = -b[BONE_IDX.THIGH_R].rotation.x * 0.45 - b[BONE_IDX.SHIN_R].rotation.x * 0.38;
  } else if (mode === "combat") {
    const br = Math.sin(timeSec * 2.6);
    b[BONE_IDX.PELVIS].position.y = rig.metrics.hipY - 0.03 + br * 0.005;
    b[BONE_IDX.PELVIS].rotation.y = -0.24;
    b[BONE_IDX.CHEST].rotation.y = -0.12;
    b[BONE_IDX.CHEST].rotation.x = 0.10;
    b[BONE_IDX.HEAD].rotation.y = 0.32;
    b[BONE_IDX.HEAD].rotation.x = -0.05;

    b[BONE_IDX.UPPER_ARM_L].rotation.set(-0.58, -0.14, 0.20);
    b[BONE_IDX.FOREARM_L].rotation.x = -0.92 + br * 0.04;
    b[BONE_IDX.UPPER_ARM_R].rotation.set(-0.42, 0.14, -0.22);
    b[BONE_IDX.FOREARM_R].rotation.x = -0.78 - br * 0.04;

    b[BONE_IDX.THIGH_L].rotation.set(-0.18, 0.04, 0.02);
    b[BONE_IDX.SHIN_L].rotation.x = 0.26;
    b[BONE_IDX.FOOT_L].rotation.x = -0.08;
    b[BONE_IDX.THIGH_R].rotation.set(0.15, -0.04, -0.02);
    b[BONE_IDX.SHIN_R].rotation.x = 0.18;
    b[BONE_IDX.FOOT_R].rotation.x = -0.26;
  } else {
    /* Спокойная естественная стойка */
    const breath = Math.sin(timeSec * 1.7);
    b[BONE_IDX.PELVIS].rotation.z = fem ? 0.024 : -0.010;
    b[BONE_IDX.PELVIS].rotation.y = fem ? 0.05 : -0.04;
    b[BONE_IDX.SPINE].rotation.z = fem ? -0.016 : 0.008;
    b[BONE_IDX.CHEST].rotation.x = breath * 0.014;
    b[BONE_IDX.HEAD].rotation.y = (fem ? -0.05 : 0.04) + Math.sin(timeSec * 0.65) * 0.045;

    b[BONE_IDX.UPPER_ARM_L].rotation.z = fem ? 0.10 : 0.11;
    b[BONE_IDX.UPPER_ARM_R].rotation.z = fem ? -0.10 : -0.11;
    b[BONE_IDX.UPPER_ARM_L].rotation.x = 0.03 + breath * 0.012;
    b[BONE_IDX.UPPER_ARM_R].rotation.x = -0.01 - breath * 0.012;
    b[BONE_IDX.FOREARM_L].rotation.x = -0.14;
    b[BONE_IDX.FOREARM_R].rotation.x = -0.16;

    b[BONE_IDX.THIGH_L].rotation.y = 0.04;
    b[BONE_IDX.THIGH_R].rotation.y = -0.05;
    b[BONE_IDX.THIGH_L].rotation.x = fem ? -0.02 : 0.01;
    b[BONE_IDX.SHIN_L].rotation.x = fem ? 0.04 : 0.02;
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
