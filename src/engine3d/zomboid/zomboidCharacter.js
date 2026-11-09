/* ============================================================================
   ГЕНЕРАТОР 3D-ПЕРСОНАЖЕЙ ЗЕМЕЛЬ ЭДЕМА В СТИЛЕ PROJECT ZOMBOID B41+
   - Два народа на контрасте: "north" (Хладные Ветра) и "eden" (Златодвор)
   - Честная бесшовная бифуркация таза в обе ноги общими вершинами (0 швов и 0 клина!)
   - Парные UV-кольца с микро-рельефом на всех обшлагах, наручах, поясе и сапогах (0 размытия!)
   - Анатомически точная фаза сгиба колена в походке (0 хромоты!)
   - Мрачные суровые лица северян и златодворцев без кукольных белков глаз
   ============================================================================ */

import * as THREE from "three";
import {
  buildHeadTextureCanvas,
  buildHairTextureCanvas,
  buildBodyTextureCanvas,
  normalizeOutfitKey,
  normalizeKingdomKey,
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

/* Перевод пиксельной координаты Y на текстуре 512×512 в V-координату WebGL */
function cyToV(cy) {
  return 1 - cy / 512;
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

  getVertexData(idx) {
    return {
      x: this.positions[idx * 3],
      y: this.positions[idx * 3 + 1],
      z: this.positions[idx * 3 + 2],
      b0: this.skinned ? this.skinIndices[idx * 4] : 0,
      b1: this.skinned ? this.skinIndices[idx * 4 + 1] : 0,
      w0: this.skinned ? this.skinWeights[idx * 4] : 1,
      w1: this.skinned ? this.skinWeights[idx * 4 + 1] : 0
    };
  }

  addTri(a, b, c) {
    this.indices.push(a, b, c);
  }

  addQuad(a, b, c, d) {
    this.indices.push(a, b, d, b, c, d);
  }

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

  capRing(ring, apexIdx, outwardUp = true) {
    const segs = ring.length - 1;
    for (let s = 0; s < segs; s++) {
      if (outwardUp) {
        this.addTri(apexIdx, ring[s], ring[s + 1]);
      } else {
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

    /* Сварка нормалей на UV-швах и на бесшовном стыке таза со штанинами! */
    const nAttr = geo.attributes.normal;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.seamPairs.length; i++) {
        const [i0, i1] = this.seamPairs[i];
        const nx = nAttr.getX(i0) + nAttr.getX(i1);
        const ny = nAttr.getY(i0) + nAttr.getY(i1);
        const nz = nAttr.getZ(i0) + nAttr.getZ(i1);
        const len = Math.hypot(nx, ny, nz) || 1;
        nAttr.setXYZ(i0, nx / len, ny / len, nz / len);
        nAttr.setXYZ(i1, nx / len, ny / len, nz / len);
      }
    }
    nAttr.needsUpdate = true;
    return geo;
  }
}

/* ---------- СОЗДАНИЕ 18-КОСТНОГО ГУМАНОИДНОГО СКЕЛЕТА ---------- */
export function createHumanoidSkeleton(female = false, kingdom = "north") {
  const isEden = normalizeKingdomKey(kingdom) === "eden";
  const bones = [];
  for (let i = 0; i < 18; i++) {
    bones.push(new THREE.Bone());
  }

  /* Северяне Хладных Ветров чуть коренастее и шире в кости; жители Златодвора чуть статнее и суше */
  const hScale = isEden ? 1.015 : 0.995;
  const wScale = isEden ? 0.955 : 1.035;

  const hipY      = (female ? 0.91 : 0.95) * hScale;
  const spineY    = (female ? 1.07 : 1.12) * hScale;
  const chestY    = (female ? 1.24 : 1.30) * hScale;
  const neckY     = (female ? 1.385 : 1.455) * hScale;
  const headY     = (female ? 1.450 : 1.525) * hScale;

  const shoulderX = (female ? 0.166 : 0.204) * wScale;
  const shoulderY = (female ? 1.35  : 1.42)  * hScale;
  const upperArmLen = (female ? 0.255 : 0.275) * hScale;
  const forearmLen  = (female ? 0.235 : 0.255) * hScale;

  const hipX     = (female ? 0.080 : 0.084) * wScale;
  const thighLen = (female ? 0.41  : 0.43)  * hScale;
  const shinLen  = (female ? 0.40  : 0.42)  * hScale;

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

  /* Руки */
  bones[BONE_IDX.UPPER_ARM_L].position.set(shoulderX, shoulderY - chestY, -0.006);
  bones[BONE_IDX.FOREARM_L].position.set(0, -upperArmLen, 0);
  bones[BONE_IDX.HAND_L].position.set(0, -forearmLen, 0);
  bones[BONE_IDX.CHEST].add(bones[BONE_IDX.UPPER_ARM_L]);
  bones[BONE_IDX.UPPER_ARM_L].add(bones[BONE_IDX.FOREARM_L]);
  bones[BONE_IDX.FOREARM_L].add(bones[BONE_IDX.HAND_L]);

  bones[BONE_IDX.UPPER_ARM_R].position.set(-shoulderX, shoulderY - chestY, -0.006);
  bones[BONE_IDX.FOREARM_R].position.set(0, -upperArmLen, 0);
  bones[BONE_IDX.HAND_R].position.set(0, -forearmLen, 0);
  bones[BONE_IDX.CHEST].add(bones[BONE_IDX.UPPER_ARM_R]);
  bones[BONE_IDX.UPPER_ARM_R].add(bones[BONE_IDX.FOREARM_R]);
  bones[BONE_IDX.FOREARM_R].add(bones[BONE_IDX.HAND_R]);

  /* Ноги */
  bones[BONE_IDX.THIGH_L].position.set(hipX, -0.03, 0);
  bones[BONE_IDX.SHIN_L].position.set(0, -thighLen, 0);
  bones[BONE_IDX.FOOT_L].position.set(0, -shinLen, 0.008);
  bones[BONE_IDX.PELVIS].add(bones[BONE_IDX.THIGH_L]);
  bones[BONE_IDX.THIGH_L].add(bones[BONE_IDX.SHIN_L]);
  bones[BONE_IDX.SHIN_L].add(bones[BONE_IDX.FOOT_L]);

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
      hScale, wScale,
      hipY, spineY, chestY, neckY, headY,
      shoulderX, shoulderY, upperArmLen, forearmLen,
      hipX, thighLen, shinLen
    }
  };
}

/* ---------- 1. ПОСТРОЕНИЕ БЕСШОВНОГО ТЕЛА С РАЗВИЛКОЙ ШТАНИН И ЧЁТКИМИ ОБШЛАГАМИ ---------- */
export function buildSeamlessBodyGeometry(female = false, rawOutfit = "villager", metrics) {
  const outfit = normalizeOutfitKey(rawOutfit);
  const mb = new MeshBuilder(true);
  const m = metrics;
  const hs = m.hScale || 1;
  const ws = m.wScale || 1;

  const isUnderwear = outfit === "underwear";
  const isWarrior   = outfit === "warrior";
  const torsoClothBulk = isWarrior ? 1.055 : (isUnderwear ? 1.0 : 1.022);
  const beltBulk       = isUnderwear ? 1.0 : torsoClothBulk + 0.018;
  const pantsBulk      = isUnderwear ? 1.0 : 1.038;

  /* === А. ТОРС, ПОЯС И ТАЗ (segsTorso = 20, идёт СНИЗУ ВВЕРХ -> ascendingY = true) ===
     Каждая строка: [cyTex, yUnscaled, rxBase, rzFBase, rzBBase, zOff, scaleMult, b0, w0, b1, w1]
     Обратите внимание на ПАРНЫЕ кольца на границе ремня (cy=152 -> 149 и 137 -> 134) и ворота (cy=31 -> 25):
     это даёт идеально чёткий край ремня и ворота без единого размытого пикселя! */
  const torsoRows = female
    ? [
        /* 0: Нижний срез таза (развилка в две ноги! s=0..10 правое бедро, s=10..20 левое бедро) */
        [188, 0.875, 0.152, 0.080, 0.106, -0.008, pantsBulk, BONE_IDX.PELVIS, 0.82, BONE_IDX.SPINE, 0.18],
        /* 1: Широкая женственная линия таза и ягодиц под ремнём */
        [154, 0.945, 0.154, 0.082, 0.112, -0.008, pantsBulk, BONE_IDX.PELVIS, 0.85, BONE_IDX.SPINE, 0.15],
        /* 2-3: Чёткий ремень на бедрах/талии (cy = 149..137) */
        [149, 0.950, 0.149, 0.081, 0.108, -0.006, beltBulk,  BONE_IDX.PELVIS, 0.72, BONE_IDX.SPINE, 0.28],
        [137, 0.985, 0.136, 0.080, 0.098, -0.004, beltBulk,  BONE_IDX.PELVIS, 0.50, BONE_IDX.SPINE, 0.50],
        /* 4: Сразу над ремнём — ткань блузы/рубахи (cy = 133) */
        [133, 0.988, 0.133, 0.079, 0.095, -0.003, torsoClothBulk, BONE_IDX.PELVIS, 0.45, BONE_IDX.SPINE, 0.55],
        /* 5: Тонкая талия */
        [108, 1.080, 0.110, 0.076, 0.084,  0.002, torsoClothBulk, BONE_IDX.SPINE,  0.85, BONE_IDX.CHEST, 0.15],
        [ 88, 1.155, 0.122, 0.088, 0.090,  0.004, torsoClothBulk, BONE_IDX.SPINE,  0.40, BONE_IDX.CHEST, 0.60],
        [ 72, 1.215, 0.133, 0.108, 0.094,  0.004, torsoClothBulk, BONE_IDX.CHEST,  1.00, BONE_IDX.SPINE, 0.00],
        [ 58, 1.265, 0.136, 0.120, 0.096,  0.004, torsoClothBulk, BONE_IDX.CHEST,  1.00, BONE_IDX.NECK,  0.00],
        [ 44, 1.325, 0.144, 0.092, 0.092, -0.002, torsoClothBulk, BONE_IDX.CHEST,  0.95, BONE_IDX.NECK,  0.05],
        [ 35, 1.360, 0.144, 0.078, 0.084, -0.005, torsoClothBulk, BONE_IDX.CHEST,  0.85, BONE_IDX.NECK,  0.15],
        /* Чёткий край ворота у ключиц (cy = 31 -> 25) */
        [ 31, 1.388, 0.098, 0.063, 0.069, -0.005, torsoClothBulk, BONE_IDX.NECK,   0.55, BONE_IDX.CHEST, 0.45],
        [ 25, 1.391, 0.095, 0.061, 0.067, -0.005, 1.0,            BONE_IDX.NECK,   0.58, BONE_IDX.CHEST, 0.42],
        [ 16, 1.420, 0.052, 0.048, 0.053, -0.004, 1.0,            BONE_IDX.NECK,   0.80, BONE_IDX.HEAD,  0.20],
        [  8, 1.460, 0.047, 0.046, 0.051, -0.002, 1.0,            BONE_IDX.HEAD,   0.82, BONE_IDX.NECK,  0.18],
        [  2, 1.510, 0.043, 0.043, 0.047,  0.000, 1.0,            BONE_IDX.HEAD,   1.00, BONE_IDX.NECK,  0.00]
      ]
    : [
        /* 0: Нижний срез мужского таза (бесшовная развилка в две штанины!) */
        [188, 0.905, 0.146, 0.086, 0.108, -0.006, pantsBulk, BONE_IDX.PELVIS, 0.82, BONE_IDX.SPINE, 0.18],
        /* 1: Таз под ремнём */
        [154, 0.975, 0.146, 0.090, 0.108, -0.006, pantsBulk, BONE_IDX.PELVIS, 0.80, BONE_IDX.SPINE, 0.20],
        /* 2-3: Чёткий ремень (cy = 149..137) */
        [149, 0.980, 0.147, 0.092, 0.109, -0.005, beltBulk,  BONE_IDX.PELVIS, 0.68, BONE_IDX.SPINE, 0.32],
        [137, 1.020, 0.145, 0.094, 0.105, -0.002, beltBulk,  BONE_IDX.PELVIS, 0.45, BONE_IDX.SPINE, 0.55],
        /* 4: Сразу над ремнём — рубаха / бригантина / сюрко (cy = 133) */
        [133, 1.023, 0.143, 0.093, 0.103, -0.001, torsoClothBulk, BONE_IDX.SPINE,  0.65, BONE_IDX.PELVIS, 0.35],
        [108, 1.110, 0.146, 0.100, 0.105,  0.002, torsoClothBulk, BONE_IDX.SPINE,  0.80, BONE_IDX.CHEST, 0.20],
        [ 84, 1.210, 0.162, 0.114, 0.113,  0.004, torsoClothBulk, BONE_IDX.SPINE,  0.30, BONE_IDX.CHEST, 0.70],
        [ 60, 1.320, 0.178, 0.118, 0.116,  0.000, torsoClothBulk, BONE_IDX.CHEST,  1.00, BONE_IDX.NECK,  0.00],
        [ 40, 1.415, 0.180, 0.096, 0.102, -0.005, torsoClothBulk, BONE_IDX.CHEST,  0.88, BONE_IDX.NECK,  0.12],
        /* Чёткий край ворота / оплечья у трапеций (cy = 31 -> 25) */
        [ 31, 1.458, 0.124, 0.078, 0.084, -0.006, torsoClothBulk, BONE_IDX.NECK,   0.50, BONE_IDX.CHEST, 0.50],
        [ 25, 1.462, 0.120, 0.076, 0.082, -0.006, 1.0,            BONE_IDX.NECK,   0.54, BONE_IDX.CHEST, 0.46],
        [ 16, 1.492, 0.065, 0.059, 0.064, -0.004, 1.0,            BONE_IDX.NECK,   0.80, BONE_IDX.HEAD,  0.20],
        [  8, 1.540, 0.058, 0.056, 0.061, -0.002, 1.0,            BONE_IDX.HEAD,   0.85, BONE_IDX.NECK,  0.15],
        [  2, 1.590, 0.051, 0.051, 0.055,  0.000, 1.0,            BONE_IDX.HEAD,   1.00, BONE_IDX.NECK,  0.00]
      ];

  const segsTorso = 20; // s = 0..10 правый бок (-X), s = 10..20 левый бок (+X)
  const torsoRings = [];

  for (let r = 0; r < torsoRows.length; r++) {
    const [cyTex, yRaw, rxBase, rzFBase, rzBBase, zOff, mult, b0, w0, b1, w1] = torsoRows[r];
    const yBase = yRaw * hs;
    const rx = rxBase * ws * mult;
    const rzF = rzFBase * mult;
    const rzB = rzBBase * mult;
    const vTex = cyToV(cyTex);
    const ring = [];

    for (let s = 0; s <= segsTorso; s++) {
      const uFrac = s / segsTorso;
      const phi = (uFrac - 0.5) * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      let rz = cosP >= 0 ? rzF : rzB;
      if (female && cosP > 0.15 && cyTex > 46 && cyTex < 86) {
        const breastW = Math.sin(((86 - cyTex) / 40) * Math.PI);
        const twinCup = Math.pow(Math.sin(Math.min(1, Math.abs(sinP) * 1.85) * Math.PI), 1.3);
        rz += 0.015 * breastW * twinCup;
      }

      /* На самом нижнем кольце таза (r === 0) формируем естественную анатомическую седловину штанов:
         сбоку линия таза плавно переходит во внешнее бедро, а по центру спереди и сзади (x ~ 0)
         опускается в паховый свод и присваивает боковым точкам вес соответствующего бедра! */
      let y = yBase;
      let vb0 = b0, vw0 = w0, vb1 = b1, vw1 = w1;
      if (r === 0) {
        const centerDip = Math.pow(Math.abs(cosP), 1.6) * 0.022 * hs;
        y -= centerDip;
        const sideWeight = Math.abs(sinP); // 1 на внешнем бедре, 0 по паховому шву
        if (sinP < -0.05) {
          vb0 = BONE_IDX.PELVIS; vw0 = 1 - sideWeight * 0.42;
          vb1 = BONE_IDX.THIGH_R; vw1 = sideWeight * 0.42;
        } else if (sinP > 0.05) {
          vb0 = BONE_IDX.PELVIS; vw0 = 1 - sideWeight * 0.42;
          vb1 = BONE_IDX.THIGH_L; vw1 = sideWeight * 0.42;
        } else {
          vb0 = BONE_IDX.PELVIS; vw0 = 1.0; vb1 = 0; vw1 = 0;
        }
      }

      ring.push(mb.addVertex(sinP * rx, y, zOff + cosP * rz, uFrac, vTex, vb0, vw0, vb1, vw1));
    }
    mb.seamPairs.push([ring[0], ring[segsTorso]]);
    torsoRings.push(ring);
  }

  mb.connectRings(torsoRings, true);

  /* === Б. ЦЕЛЬНАЯ БЕСШОВНАЯ РАЗВИЛКА ТАЗА В ЛЕВУЮ И ПРАВУЮ НОГИ (0 ШВОВ, 0 «ПАМПЕРСА»!) ===
     Никакой крышки под тазом! Вместо этого создаём 5 общих точек центрального шагового шва (x = 0)
     между задней точкой таза (sT = 0/20) и передней точкой таза (sT = 10):
     10 сегментов внешнего бедра от torsoRings[0] + 6 сегментов шагового шва = 16 сегментов каждой ноги! */
  const hipRing = torsoRings[0];
  const backHipData  = mb.getVertexData(hipRing[0]);  // x = 0, сзади
  const frontHipData = mb.getVertexData(hipRing[10]); // x = 0, спереди

  /* 7 точек центрального пахового шва от зада (k=0) к переду (k=6) */
  const seam3DPts = [];
  for (let k = 0; k <= 6; k++) {
    const t = k / 6; // 0 = сзади, 1 = спереди
    const archDip = Math.sin(t * Math.PI) * 0.026 * hs;
    seam3DPts.push({
      x: 0,
      y: lerp(backHipData.y, frontHipData.y, t) - archDip,
      z: lerp(backHipData.z, frontHipData.z, t)
    });
  }

  function buildBifurcatedLeg(isLeft) {
    const sign = isLeft ? 1 : -1;
    const bThigh = isLeft ? BONE_IDX.THIGH_L : BONE_IDX.THIGH_R;
    const bShin  = isLeft ? BONE_IDX.SHIN_L  : BONE_IDX.SHIN_R;
    const bFoot  = isLeft ? BONE_IDX.FOOT_L  : BONE_IDX.FOOT_R;

    const hx = sign * m.hipX;
    const hy = m.hipY - 0.03 * hs;
    const kx = sign * (m.hipX * 0.94);
    const ky = hy - m.thighLen;
    const ax = sign * (m.hipX * 0.90);
    const ay = ky - m.shinLen;

    const segsLeg = 16;
    const rings = [];

    /* --- КОЛЬЦО 0 НОГИ: ТОЧНАЯ СШИВКА С НИЖНИМ КОЛЬЦОМ ТАЗА И ПАХОВЫМ ШВОМ --- */
    const startRing = [];
    const vStart = cyToV(307);
    if (!isLeft) {
      /* Правая нога (-X):
         sL = 0..10 -> внешняя дуга hipRing[0..10] (от зада по правому боку к переду);
         sL = 11..16 -> внутренняя дуга по паховому шву от переда (k=5) обратно к заду (k=0). */
      for (let sL = 0; sL <= segsLeg; sL++) {
        const uFrac = sL / segsLeg;
        if (sL <= 10) {
          const srcIdx = hipRing[sL];
          const d = mb.getVertexData(srcIdx);
          const vIdx = mb.addVertex(d.x, d.y, d.z, uFrac, vStart, d.b0, d.w0, d.b1, d.w1);
          mb.seamPairs.push([srcIdx, vIdx]); // свариваем нормаль с тазом!
          startRing.push(vIdx);
        } else {
          const k = 16 - sL; // 5, 4, 3, 2, 1, 0
          const sp = seam3DPts[k];
          const vIdx = mb.addVertex(sp.x, sp.y, sp.z, uFrac, vStart, BONE_IDX.PELVIS, 0.85, bThigh, 0.15);
          if (k === 0) mb.seamPairs.push([hipRing[0], vIdx]);
          startRing.push(vIdx);
        }
      }
    } else {
      /* Левая нога (+X):
         sL = 0..6 -> внутренняя дуга по паховому шву от зада (k=0) к переду (k=6);
         sL = 6..16 -> внешняя дуга hipRing[10..20] (от переда по левому боку к заду). */
      for (let sL = 0; sL <= segsLeg; sL++) {
        const uFrac = sL / segsLeg;
        if (sL < 6) {
          const sp = seam3DPts[sL]; // k = 0..5
          const vIdx = mb.addVertex(sp.x, sp.y, sp.z, uFrac, vStart, BONE_IDX.PELVIS, 0.85, bThigh, 0.15);
          if (sL === 0) mb.seamPairs.push([hipRing[20], vIdx]);
          startRing.push(vIdx);
        } else {
          const srcIdx = hipRing[10 + (sL - 6)]; // hipRing[10..20]
          const d = mb.getVertexData(srcIdx);
          const vIdx = mb.addVertex(d.x, d.y, d.z, uFrac, vStart, d.b0, d.w0, d.b1, d.w1);
          mb.seamPairs.push([srcIdx, vIdx]); // свариваем нормаль с тазом!
          startRing.push(vIdx);
        }
      }
    }
    mb.seamPairs.push([startRing[0], startRing[segsLeg]]);
    rings.push(startRing);

    /* --- ДАЛЬНЕЙШИЕ СТАНЦИИ НОГИ С ПАРНЫМИ ЧЁТКИМИ КОЛЬЦАМИ НА ШОРТАХ, САПОГАХ И БАШМАКАХ! ---
       [cyTex, cx, cy, cz, rx, rz, b0, w0, b1, w1] */
    const rThighX = (female ? 0.075 : 0.075) * ws * pantsBulk;
    const rThighZ = (female ? 0.080 : 0.082) * pantsBulk;
    const bootBulk = isWarrior ? 1.07 : pantsBulk;

    const legStations = [
      /* 1: Верх бедра сразу под развилкой — плавный переход в цилиндр штанины */
      [320, hx * 0.96, lerp(hy, ky, 0.13), 0.000, rThighX, rThighZ, BONE_IDX.PELVIS, 0.20, bThigh, 0.80]
    ];

    /* Если мужские боксеры (underwear) — ставим чёткий парный край шорт на cy = 336! */
    if (isUnderwear && !female) {
      legStations.push(
        [333, lerp(hx, kx, 0.28), lerp(hy, ky, 0.28), 0.003, rThighX * 0.96, rThighZ * 0.96, bThigh, 1.0, 0, 0],
        [340, lerp(hx, kx, 0.29), lerp(hy, ky, 0.29), 0.003, rThighX * 0.94, rThighZ * 0.94, bThigh, 1.0, 0, 0]
      );
    }

    legStations.push(
      /* Середина бедра */
      [350, lerp(hx, kx, 0.54), lerp(hy, ky, 0.54), 0.004, (female ? 0.065 : 0.068) * ws * pantsBulk, (female ? 0.070 : 0.074) * pantsBulk, bThigh, 1.0, bShin, 0.0],
      /* Над коленом и колено */
      [364, lerp(hx, kx, 0.88), lerp(hy, ky, 0.88), 0.000, (female ? 0.052 : 0.055) * ws * pantsBulk, (female ? 0.055 : 0.059) * pantsBulk, bThigh, 0.74, bShin, 0.26],
      [371, kx, ky, 0.002, (female ? 0.049 : 0.053) * ws * pantsBulk, (female ? 0.053 : 0.057) * pantsBulk, bThigh, 0.48, bShin, 0.52],
      /* ЧЁТКИЙ ПАРНЫЙ КРАЙ ВЕРХА ВЫСОКИХ САПОГ ВОИНА (cy = 376 -> 383, НИКАКОЙ РАЗМАЗНИ!) */
      [376, lerp(kx, ax, 0.20), lerp(ky, ay, 0.20), -0.007, (female ? 0.050 : 0.055) * ws * pantsBulk, (female ? 0.055 : 0.061) * pantsBulk, bShin, 0.92, bThigh, 0.08],
      [383, lerp(kx, ax, 0.21), lerp(ky, ay, 0.21), -0.008, (female ? 0.052 : 0.057) * ws * bootBulk,  (female ? 0.057 : 0.064) * bootBulk,  bShin, 0.94, bThigh, 0.06],
      /* Икра и середина голени */
      [402, lerp(kx, ax, 0.52), lerp(ky, ay, 0.52), -0.008, (female ? 0.046 : 0.051) * ws * bootBulk,  (female ? 0.050 : 0.056) * bootBulk,  bShin, 1.0, bFoot, 0.0],
      /* ЧЁТКИЙ ПАРНЫЙ КРАЙ ЩИКОЛОТКИ / БАШМАКА (cy = 428 -> 436) */
      [428, ax, ay + 0.032 * hs, -0.002, (female ? 0.036 : 0.041) * ws * bootBulk, (female ? 0.040 : 0.045) * bootBulk, bShin, 0.65, bFoot, 0.35],
      [436, ax, ay + 0.028 * hs,  0.002, (female ? 0.038 : 0.043) * ws * bootBulk, (female ? 0.043 : 0.048) * bootBulk, bShin, 0.40, bFoot, 0.60]
    );

    for (let i = 0; i < legStations.length; i++) {
      const [cyTex, cx, cy, cz, rx, rz, b0, w0, b1, w1] = legStations[i];
      const vTex = cyToV(cyTex);
      const ring = [];
      for (let s = 0; s <= segsLeg; s++) {
        const uFrac = s / segsLeg;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        ring.push(mb.addVertex(cx + Math.sin(phi) * rx, cy, cz + Math.cos(phi) * rz, uFrac, vTex, b0, w0, b1, w1));
      }
      mb.seamPairs.push([ring[0], ring[segsLeg]]);
      rings.push(ring);
    }

    /* Стопа и подошва (cy = 452..508) */
    const bootScale = (female ? 0.92 : 1.02) * ws;
    const footSpecs = [
      [456, ax, 0.050 * hs, 0.018, 0.044 * bootScale, 0.068 * bootScale],
      [482, ax, 0.026 * hs, 0.046, 0.047 * bootScale, 0.104 * bootScale],
      [506, ax, 0.004 * hs, 0.046, 0.045 * bootScale, 0.102 * bootScale]
    ];
    for (let f = 0; f < footSpecs.length; f++) {
      const [cyTex, fx, fy, fz, frx, frz] = footSpecs[f];
      const vTex = cyToV(cyTex);
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

    mb.connectRings(rings, false);
    const soleCenter = mb.addVertex(ax, 0.002, 0.042, 0.5, cyToV(510), bFoot, 1, 0, 0);
    mb.capRing(rings[rings.length - 1], soleCenter, false);
  }

  buildBifurcatedLeg(false);
  buildBifurcatedLeg(true);

  /* === В. РУКИ С БРИТВЕННО-ЧЁТКИМИ ОБШЛАГАМИ РУКАВОВ И НАРУЧЕЙ (cy = 244 и cy = 284!) === */
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

    const musc = (female ? 0.85 : 1.04) * ws;
    const upperBulk   = isWarrior ? 1.08 : (isUnderwear ? 1.0 : 1.045);
    const bracerBulk  = isWarrior ? 1.08 : 1.0;

    /* [cyTex, cx, cy, cz, rx, rz, b0, w0, b1, w1] */
    const armStations = [
      [194, sx - sign * 0.056, sy + 0.022 * hs, -0.005, 0.030 * musc * upperBulk, 0.036 * musc * upperBulk, BONE_IDX.CHEST, 0.90, bUpper, 0.10],
      [204, sx - sign * 0.014, sy + 0.004 * hs, -0.005, 0.054 * musc * upperBulk, 0.058 * musc * upperBulk, BONE_IDX.CHEST, 0.52, bUpper, 0.48],
      [216, sx + sign * 0.004, sy - 0.040 * hs, -0.005, 0.051 * musc * upperBulk, 0.054 * musc * upperBulk, BONE_IDX.CHEST, 0.15, bUpper, 0.85],
      [230, lerp(sx, ex, 0.54), lerp(sy, ey, 0.54), -0.004, 0.045 * musc * upperBulk, 0.048 * musc * upperBulk, bUpper, 1.0, bFore, 0.0],
      /* Локоть */
      [238, ex, ey, -0.007, 0.039 * musc * upperBulk, 0.041 * musc * upperBulk, bUpper, 0.50, bFore, 0.50],
      /* ЧЁТКИЙ ПАРНЫЙ ОБШЛАГ РУКАВА / ВЕРХА НАРУЧА СРАЗУ ПОД ЛОКТЕМ (cy = 241 -> 247, 0% РАЗМАЗНИ!) */
      [241, lerp(ex, wx, 0.14), lerp(ey, wy, 0.14), -0.004, 0.040 * musc * upperBulk,  0.042 * musc * upperBulk,  bFore, 0.88, bUpper, 0.12],
      [247, lerp(ex, wx, 0.15), lerp(ey, wy, 0.15), -0.004, 0.039 * musc * bracerBulk, 0.041 * musc * bracerBulk, bFore, 0.90, bUpper, 0.10],
      /* Середина предплечья (кожа или наруч) */
      [264, lerp(ex, wx, 0.55), lerp(ey, wy, 0.55),  0.002, 0.034 * musc * bracerBulk, 0.036 * musc * bracerBulk, bFore, 1.0, bHand, 0.0],
      /* ЧЁТКИЙ ПАРНЫЙ КРАЙ НАРУЧА / МАНЖЕТЫ У ЗАПЯСТЬЯ (cy = 281 -> 287, 0% РАЗМАЗНИ!) */
      [281, lerp(ex, wx, 0.92), lerp(ey, wy, 0.92),  0.007, 0.028 * musc * bracerBulk, 0.026 * musc * bracerBulk, bFore, 0.65, bHand, 0.35],
      [287, wx, wy, 0.008, 0.025 * musc, 0.022 * musc, bFore, 0.45, bHand, 0.55],
      /* Кисть и пальцы (чистая кожа cy = 291..302) */
      [292, wx + sign * 0.002, wy - 0.040 * hs, 0.012, 0.020 * musc, 0.035 * musc, bHand, 1.0, bFore, 0.0],
      [298, wx - sign * 0.004, wy - 0.080 * hs, 0.016, 0.016 * musc, 0.029 * musc, bHand, 1.0, bFore, 0.0],
      [302, wx - sign * 0.008, wy - 0.104 * hs, 0.018, 0.010 * musc, 0.019 * musc, bHand, 1.0, bFore, 0.0]
    ];

    const segsArm = 12;
    const rings = [];
    for (let i = 0; i < armStations.length; i++) {
      const [cyTex, cx, cy, cz, rx, rz, b0, w0, b1, w1] = armStations[i];
      const vTex = cyToV(cyTex);
      const ring = [];
      for (let s = 0; s <= segsArm; s++) {
        const uFrac = s / segsArm;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        ring.push(mb.addVertex(cx + Math.sin(phi) * rx, cy, cz + Math.cos(phi) * rz, uFrac, vTex, b0, w0, b1, w1));
      }
      mb.seamPairs.push([ring[0], ring[segsArm]]);
      rings.push(ring);
    }

    const capTop = mb.addVertex(sx - sign * 0.062, sy + 0.024 * hs, -0.005, 0.5, cyToV(194), BONE_IDX.CHEST, 0.92, bUpper, 0.08);
    mb.capRing(rings[0], capTop, true);
    mb.connectRings(rings, false);

    const tip = mb.addVertex(wx - sign * 0.010, wy - 0.112 * hs, 0.018, 0.5, cyToV(302), bHand, 1, 0, 0);
    mb.capRing(rings[rings.length - 1], tip, false);

    /* Большой палец (строго в зоне чистой кожи кисти cy = 288..301!) */
    const thumbRings = [];
    const thumbSteps = [
      [288, wx - sign * 0.005, wy - 0.024 * hs, 0.032, 0.012 * musc],
      [295, wx - sign * 0.010, wy - 0.052 * hs, 0.046, 0.010 * musc],
      [301, wx - sign * 0.012, wy - 0.072 * hs, 0.052, 0.007 * musc]
    ];
    for (let ti = 0; ti < thumbSteps.length; ti++) {
      const [cyTex, tx, ty, tz, tr] = thumbSteps[ti];
      const vTex = cyToV(cyTex);
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
    const tTip = mb.addVertex(wx - sign * 0.012, wy - 0.078 * hs, 0.054, 0.5, cyToV(302), bHand, 1, 0, 0);
    mb.capRing(thumbRings[2], tTip, false);
  }

  buildArm(true);
  buildArm(false);

  return mb.toGeometry();
}

/* ---------- 2. СУРОВАЯ СКУЛЬПТУРА ГОЛОВЫ ZOMBOID (РЕЛЬЕФНЫЕ НАДБРОВНЫЕ ДУГИ И СКУЛЫ) ---------- */
export function buildSculptedHeadGeometry(female = false, hasBeard = false, kingdom = "north") {
  const isEden = normalizeKingdomKey(kingdom) === "eden";
  const mb = new MeshBuilder(false);
  const segsU = 22;
  const segsV = 16;

  const rxBase = (female ? 0.074 : 0.081) * (isEden ? 0.96 : 1.02);
  const ryHalf = female ? 0.114 : 0.120;
  const rzBase = female ? 0.095 : 0.102;
  const centerY = female ? 0.092 : 0.096;

  const rings = [];
  for (let r = 0; r <= segsV; r++) {
    const vFrac = r / segsV;
    const theta = (vFrac - 0.5) * Math.PI;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const ring = [];
    for (let s = 0; s <= segsU; s++) {
      const uFrac = s / segsU;
      const phi = (uFrac - 0.5) * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      let rx = rxBase * Math.pow(Math.max(0.14, cosT), 0.84);
      let rz = rzBase * Math.pow(Math.max(0.14, cosT), 0.82);
      let y = centerY + sinT * ryHalf;

      /* Плоские виски и впадины под скулами (осунувшееся северное/военное лицо без детской пухлости!) */
      const templeFlatten = Math.pow(Math.abs(sinP), 2.2) * Math.exp(-Math.pow((vFrac - 0.56) / 0.25, 2));
      rx *= (1 - 0.09 * templeFlatten);

      const cheekBone = Math.exp(-Math.pow((Math.abs(phi) - 0.65) / 0.28, 2)) * Math.exp(-Math.pow((vFrac - 0.46) / 0.07, 2));
      const cheekHollow = Math.exp(-Math.pow((Math.abs(phi) - 0.68) / 0.30, 2)) * Math.exp(-Math.pow((vFrac - 0.33) / 0.08, 2));
      rx += cheekBone * 0.004 - cheekHollow * 0.005;

      /* Крепкая угловатая челюсть */
      if (vFrac < 0.48) {
        const jawT = Math.max(0, (0.48 - vFrac) / 0.48);
        rx *= lerp(1.0, female ? 0.80 : (isEden ? 0.86 : 0.92), jawT * 0.62);

        if (cosP > 0) {
          const chinMask = Math.exp(-Math.pow(phi / (female ? 0.40 : 0.58), 2)) * Math.exp(-Math.pow((vFrac - 0.17) / 0.12, 2));
          const beardBulk = (!female && hasBeard) ? (isEden ? 0.018 : 0.025) : (female ? 0.010 : 0.015);
          rz += chinMask * beardBulk;
          if (!female && hasBeard && vFrac < 0.25) {
            y -= chinMask * (isEden ? 0.008 : 0.012);
          }
        } else {
          rz *= lerp(1.0, 0.76, jawT);
        }
      }

      /* Широкий плавный надбровный рельеф (даёт верхнему свету естественную тень на глаза, как в Zomboid!) */
      if (cosP > 0.2 && vFrac > 0.50 && vFrac < 0.78) {
        const browRidge = Math.exp(-Math.pow(phi / 0.86, 2)) * Math.exp(-Math.pow((vFrac - 0.555) / 0.046, 2));
        rz += browRidge * (female ? 0.005 : 0.010);
      }

      let x = sinP * rx;
      let z = cosP * rz;

      /* Плавные глазницы под бровью без заломов нормалей на переносице */
      if (cosP > 0.42) {
        const eyeDist = Math.min(Math.abs(phi - 0.44), Math.abs(phi + 0.44));
        const socket = Math.exp(-Math.pow(eyeDist / 0.22, 2)) * Math.exp(-Math.pow((vFrac - 0.495) / 0.048, 2));
        z -= socket * (female ? 0.004 : 0.006);
      }

      /* Анатомичный прямой нос: вогнутый корень на уровне глаз (vFrac ~ 0.50) и плавный выход к кончику (vFrac ~ 0.415) */
      if (Math.abs(phi) < 0.19 && vFrac > 0.385 && vFrac < 0.525) {
        const noseW = Math.cos((phi / 0.19) * Math.PI * 0.5);
        let noseProfile = 0;
        if (vFrac >= 0.415) {
          const tBridge = (vFrac - 0.415) / 0.110; // 0 на кончике, 1 на корне носа
          noseProfile = Math.pow(Math.max(0, 1 - tBridge), 1.35);
        } else {
          noseProfile = Math.max(0, (vFrac - 0.385) / 0.030);
        }
        z += noseW * noseProfile * (female ? 0.015 : 0.019);
      }

      /* Компактные уши */
      const earMask = Math.exp(-Math.pow((Math.abs(phi) - 1.55) / 0.13, 2)) * Math.exp(-Math.pow((vFrac - 0.50) / 0.08, 2));
      x += Math.sign(sinP || 1) * earMask * 0.011;

      ring.push(mb.addVertex(x, y, z, uFrac, vFrac));
    }
    mb.seamPairs.push([ring[0], ring[segsU]]);
    rings.push(ring);
  }

  const bottomPole = mb.addVertex(0, centerY - ryHalf, -0.004, 0.5, 0.0);
  mb.capRing(rings[0], bottomPole, false);
  mb.connectRings(rings, true);
  const topPole = mb.addVertex(0, centerY + ryHalf, -0.002, 0.5, 1.0);
  mb.capRing(rings[rings.length - 1], topPole, true);

  return mb.toGeometry();
}

/* ---------- 3. ЦЕЛЬНЫЕ «ШАПКИ» ПРИЧЁСОК И ГОЛОВНЫХ УБОРОВ СЕВЕРА И ЗЛАТОДВОРА ---------- */
export function buildZomboidHairGeometry(female = false, styleKey = "classic", kingdom = "north") {
  const isEden = normalizeKingdomKey(kingdom) === "eden";
  const wMul = isEden ? 0.96 : 1.02;
  const mb = new MeshBuilder(false);
  const segsU = 22;

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
        const faceArch = Math.pow(Math.max(0, cosP), 1.35);
        const y = baseY + faceArch * frontLiftY;
        const rz = cosP >= 0 ? rzF : rzB;
        ring.push(mb.addVertex(sinP * rx * wMul, y, zShift + cosP * rz, uFrac, vTex));
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

  function addBackBun(cy, cz, rx, ry, rz) {
    const bunRings = [];
    const rows = 6;
    const cols = 12;
    for (let r = 1; r < rows; r++) {
      const t = r / rows;
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
    if (isEden) {
      if (female) {
        /* Златодвор: высокий парчовый чепец-венец с ниспадающей назад светлой вуалью */
        buildSolidCap(0.258, -0.016, [
          [0.95, 0.246, 0.000, 0.068, 0.072, 0.078, -0.012],
          [0.72, 0.205, 0.002, 0.092, 0.102, 0.110, -0.008],
          [0.42, 0.148, 0.016, 0.094, 0.098, 0.114, -0.008], // золотой обруч надо лбом
          [0.24, 0.062, 0.098, 0.096, 0.082, 0.122, -0.018], // вуаль за щеками
          [0.06, -0.028, 0.184, 0.090, 0.066, 0.118, -0.026],
          [0.01, -0.020, 0.178, 0.062, 0.050, 0.084, -0.022]
        ]);
      } else {
        /* Златодвор: придворный пурпурный берет / шаперон с широким мягким верхом */
        buildSolidCap(0.244, -0.004, [
          [0.95, 0.236, 0.000, 0.082, 0.086, 0.090, -0.004],
          [0.68, 0.208, 0.002, 0.116, 0.118, 0.122, -0.004], // характерная корона берета Златодвора!
          [0.36, 0.166, 0.006, 0.098, 0.108, 0.112, -0.005],
          [0.12, 0.132, 0.020, 0.094, 0.106, 0.110, -0.006], // золотой кант и околыш
          [0.02, 0.138, 0.018, 0.074, 0.086, 0.090, -0.006]
        ]);
      }
    } else {
      if (female) {
        buildSolidCap(0.220, -0.006, [
          [0.92, 0.210, 0.002, 0.044, 0.050, 0.054, -0.005],
          [0.76, 0.184, 0.006, 0.086, 0.100, 0.108, -0.005],
          [0.54, 0.128, 0.032, 0.092, 0.096, 0.114, -0.008],
          [0.30, 0.048, 0.108, 0.096, 0.084, 0.118, -0.014],
          [0.08, -0.022, 0.172, 0.092, 0.070, 0.112, -0.020],
          [0.02, -0.016, 0.168, 0.064, 0.054, 0.082, -0.018]
        ]);
      } else {
        buildSolidCap(0.242, -0.005, [
          [0.94, 0.232, 0.000, 0.050, 0.056, 0.058, -0.004],
          [0.74, 0.200, 0.002, 0.090, 0.106, 0.110, -0.004],
          [0.45, 0.160, 0.004, 0.096, 0.112, 0.116, -0.004],
          [0.14, 0.124, 0.018, 0.097, 0.112, 0.117, -0.005],
          [0.02, 0.130, 0.016, 0.076, 0.088, 0.092, -0.005]
        ]);
      }
    }
    return mb.toGeometry();
  }

  if (styleKey === "long") {
    if (female) {
      buildSolidCap(0.216, -0.006, [
        [0.94, 0.206, 0.002, 0.042, 0.048, 0.052, -0.005],
        [0.80, 0.180, 0.006, 0.084, 0.099, 0.108, -0.006],
        [0.62, 0.128, 0.032, 0.090, 0.094, 0.114, -0.010],
        [0.42, 0.052, 0.104, 0.094, 0.072, 0.120, -0.022],
        [0.20, -0.032, 0.184, 0.088, 0.058, 0.116, -0.032],
        [0.06, -0.068, 0.216, 0.070, 0.048, 0.094, -0.034],
        [0.02, -0.055, 0.205, 0.048, 0.040, 0.066, -0.028]
      ]);
    } else {
      buildSolidCap(0.224, -0.006, [
        [0.94, 0.214, 0.002, 0.044, 0.050, 0.056, -0.005],
        [0.78, 0.188, 0.006, 0.090, 0.105, 0.112, -0.006],
        [0.56, 0.136, 0.030, 0.094, 0.098, 0.116, -0.010],
        [0.30, 0.070, 0.092, 0.092, 0.076, 0.116, -0.018],
        [0.10, 0.022, 0.138, 0.080, 0.062, 0.102, -0.022],
        [0.02, 0.032, 0.130, 0.058, 0.050, 0.074, -0.018]
      ]);
    }
    return mb.toGeometry();
  }

  /* "classic" */
  if (female) {
    buildSolidCap(0.215, -0.005, [
      [0.94, 0.206, 0.002, 0.042, 0.048, 0.052, -0.004],
      [0.78, 0.180, 0.005, 0.084, 0.098, 0.106, -0.005],
      [0.54, 0.126, 0.032, 0.088, 0.094, 0.110, -0.008],
      [0.26, 0.066, 0.088, 0.084, 0.074, 0.106, -0.014],
      [0.06, 0.042, 0.110, 0.066, 0.058, 0.086, -0.014],
      [0.02, 0.050, 0.104, 0.050, 0.046, 0.064, -0.012]
    ]);
    addBackBun(isEden ? 0.108 : 0.084, -0.112, 0.046, 0.045, 0.040);
  } else {
    buildSolidCap(0.224, -0.004, [
      [0.94, 0.214, 0.002, 0.044, 0.050, 0.054, -0.004],
      [0.76, 0.188, 0.005, 0.089, 0.104, 0.110, -0.005],
      [0.50, 0.136, 0.028, 0.092, 0.098, 0.112, -0.008],
      [0.22, 0.082, 0.080, 0.085, 0.076, 0.106, -0.014],
      [0.04, 0.064, 0.096, 0.068, 0.060, 0.084, -0.014],
      [0.01, 0.072, 0.090, 0.054, 0.050, 0.066, -0.012]
    ]);
  }

  return mb.toGeometry();
}

/* ---------- 4. СБОРКА ГОТОВОГО 3D-ПЕРСОНАЖА (СЕВЕРЯНИН / ЗЛАТОДВОРЕЦ) ---------- */
export function createZomboidCharacter3D(opts = {}) {
  const female = !!opts.female;
  const kingdom = normalizeKingdomKey(opts.kingdom);
  const isEden = kingdom === "eden";
  const outfit = normalizeOutfitKey(opts.outfit);
  const hairStyle = opts.hairStyle || "classic";
  const hairColor = opts.hairColor || (isEden
    ? (female ? "#301f17" : "#261912")
    : (female ? "#4c3222" : "#4a2e1b"));
  const hasBeard = !female && opts.beard !== false;

  const group = new THREE.Group();
  group.name = `${isEden ? "Eden" : "North"}${female ? "Female" : "Male"}`;

  const { bones, skeleton, metrics } = createHumanoidSkeleton(female, kingdom);
  group.add(bones[BONE_IDX.ROOT]);

  const bodyCv = buildBodyTextureCanvas({ female, outfit, kingdom }, opts.canvasFactory);
  const headCv = buildHeadTextureCanvas({ female, hairColor, beard: hasBeard, kingdom }, opts.canvasFactory);
  const hairCv = buildHairTextureCanvas(hairColor, hairStyle, female, kingdom, opts.canvasFactory);

  const bodyTex = canvasToThreeTexture(bodyCv);
  const headTex = canvasToThreeTexture(headCv);
  const hairTex = canvasToThreeTexture(hairCv);

  const bodyMat = new THREE.MeshLambertMaterial({ map: bodyTex });
  const headMat = new THREE.MeshLambertMaterial({ map: headTex });
  const hairMat = new THREE.MeshLambertMaterial({ map: hairTex });

  const bodyGeo = buildSeamlessBodyGeometry(female, outfit, metrics);
  const bodyMesh = new THREE.SkinnedMesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.frustumCulled = false;
  bodyMesh.bind(skeleton);
  group.add(bodyMesh);

  const headGeo = buildSculptedHeadGeometry(female, hasBeard, kingdom);
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  bones[BONE_IDX.HEAD].add(headMesh);

  const hairGeo = buildZomboidHairGeometry(female, hairStyle, kingdom);
  const hairMesh = new THREE.Mesh(hairGeo, hairMat);
  hairMesh.castShadow = true;
  hairMesh.receiveShadow = true;
  bones[BONE_IDX.HEAD].add(hairMesh);

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
    kingdom,
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
      const nextBodyCv = buildBodyTextureCanvas({ female, outfit: nextOutfit, kingdom }, canvasFactory);
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
      const nextHairCv = buildHairTextureCanvas(hairColor, nextStyle, female, kingdom, canvasFactory);
      const nextHairTex = canvasToThreeTexture(nextHairCv);
      hairMat.map.dispose();
      hairMat.map = nextHairTex;
      hairMat.needsUpdate = true;

      const nextHairGeo = buildZomboidHairGeometry(female, nextStyle, kingdom);
      hairMesh.geometry.dispose();
      hairMesh.geometry = nextHairGeo;
    }
  };

  poseZomboidCharacter(rig, "idle", 0);
  return rig;
}

/* ---------- 5. ИСПРАВЛЕННАЯ БИОМЕХАНИКА ПОХОДКИ И СТОЙКИ (БЕЗ ХРОМОТЫ!) ----------
   Главный фикс шага:
   - Бедро левой ноги качается -sin(w): при w = 0 нога проходит вертикаль ВПЕРЁД в воздухе (swing),
     при w = PI нога проходит вертикаль НАЗАД по земле (stance / опора).
   - Колено сгибается по +cos(w) (строго в фазе ПЕРЕНОСА ноги в воздухе!), а на ОПОРЕ (cos(w) < 0)
     опорная нога выпрямлена и держит вес тела без провала и хромоты! */
export function poseZomboidCharacter(rig, mode = "idle", timeSec = 0, opts = {}) {
  const b = rig.bones;
  const fem = rig.female;
  const lookYaw = opts.lookYaw || 0;

  for (let i = 0; i < b.length; i++) {
    b[i].rotation.set(0, 0, 0);
  }
  b[BONE_IDX.PELVIS].position.y = rig.metrics.hipY;

  if (mode === "walk") {
    const w = timeSec * 5.0; // естественный живой каденс шага (~100 шагов/мин)
    const s = Math.sin(w);
    const c = Math.cos(w);

    /* Симметричное вертикальное движение центра тяжести (2 цикла за полный шаг обеих ног:
       вверх при прохождении прямой опорной ноги через вертикаль w=0/PI, чуть вниз на широком шаге w=PI/2) */
    b[BONE_IDX.PELVIS].position.y = rig.metrics.hipY - 0.008 + Math.cos(w * 2) * 0.011;
    b[BONE_IDX.PELVIS].rotation.y = -s * (fem ? 0.065 : 0.045);
    b[BONE_IDX.PELVIS].rotation.z = s * (fem ? 0.024 : 0.016);

    b[BONE_IDX.SPINE].rotation.y = s * 0.035;
    b[BONE_IDX.CHEST].rotation.y = s * 0.060;
    b[BONE_IDX.CHEST].rotation.x = 0.030;
    b[BONE_IDX.HEAD].rotation.y = -s * 0.035;
    b[BONE_IDX.HEAD].rotation.x = -0.02;

    /* Естественная отмашка рук в противофазе ногам (левая нога вперёд -> правая рука вперёд!) */
    b[BONE_IDX.UPPER_ARM_L].rotation.z = fem ? 0.09 : 0.11;
    b[BONE_IDX.UPPER_ARM_R].rotation.z = fem ? -0.09 : -0.11;
    b[BONE_IDX.UPPER_ARM_L].rotation.x = s * 0.30;
    b[BONE_IDX.UPPER_ARM_R].rotation.x = -s * 0.30;
    b[BONE_IDX.FOREARM_L].rotation.x = -0.18 - Math.max(0, -s) * 0.22;
    b[BONE_IDX.FOREARM_R].rotation.x = -0.18 - Math.max(0, s) * 0.22;

    /* Симметричный упругий шаг ног с правильной фазой колена cos(w)! */
    const swingL = Math.max(0, c);  // левая нога в воздухе движется вперёд
    const swingR = Math.max(0, -c); // правая нога в воздухе движется вперёд

    b[BONE_IDX.THIGH_L].rotation.x = -s * 0.33 + swingL * 0.10;
    b[BONE_IDX.THIGH_R].rotation.x =  s * 0.33 + swingR * 0.10;

    /* На переносе колено сгибается (~34°), а на опоре остаётся почти прямым (~2°) — никакой хромоты! */
    b[BONE_IDX.SHIN_L].rotation.x = swingL * 0.58 + 0.03;
    b[BONE_IDX.SHIN_R].rotation.x = swingR * 0.58 + 0.03;

    /* Стопа: при выносе вперёд носок взят на себя (пятка первой!), при толчке сзади — толчок носком */
    b[BONE_IDX.FOOT_L].rotation.x = s * 0.18 - swingL * 0.22;
    b[BONE_IDX.FOOT_R].rotation.x = -s * 0.18 - swingR * 0.22;
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
    const breath = Math.sin(timeSec * 1.7);
    b[BONE_IDX.PELVIS].rotation.z = fem ? 0.022 : -0.010;
    b[BONE_IDX.PELVIS].rotation.y = fem ? 0.05 : -0.04;
    b[BONE_IDX.SPINE].rotation.z = fem ? -0.015 : 0.008;
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
