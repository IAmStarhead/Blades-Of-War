/* ============================================================================
   BLADES OF WAR — ГЕНЕРАТОР 3D-ПЕРСОНАЖЕЙ ДВУХ НАРОДОВ ЗЕМЛИ ЭДЕМА
   - Полное разделение слоёв: чистое анатомическое базовое тело (кожа + исподнее)
     и ОТДЕЛЬНАЯ геометрия верхней одежды, наручей и сапог поверх того же скелета.
     На голых руках и ногах нет ни ступенек рукавов, ни «ботинок цвета кожи»!
   - Женственная женская фигура: покатые плечи, грудь, талия, округлые бёдра.
   - Честная бесшовная бифуркация таза в обе ноги общими вершинами.
   - Привязка всех SkinnedMesh строго к эталонной rest-позе (bind c явной
     единичной матрицей) — смена одежды в любой момент анимации больше
     никогда не выворачивает руки и ноги.
   - Заземлённая походка: высота таза считается из угла опорной ноги, подошва
     держит пол всю фазу опоры, стопы развёрнуты наружу с живой асимметрией.
   ============================================================================ */

import * as THREE from "three";
import {
  buildHeadTextureCanvas,
  buildHairTextureCanvas,
  buildBaseBodyTextureCanvas,
  buildGarmentTextureCanvas,
  normalizeOutfitKey,
  normalizeKingdomKey,
  canvasToThreeTexture
} from "./bowTextures.js";

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
  FOOT_R: 17,
  TOE_L: 18,
  TOE_R: 19
};

export const BONE_COUNT = 20;

const IDENTITY_BIND = new THREE.Matrix4();

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

    /* Сварка нормалей на UV-швах и на бесшовном стыке таза со штанинами */
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

/* ---------- СОЗДАНИЕ 18-КОСТНОГО ГУМАНОИДНОГО СКЕЛЕТА (REST-ПОЗА) ---------- */
export function createHumanoidSkeleton(female = false, kingdom = "north") {
  const isEden = normalizeKingdomKey(kingdom) === "eden";
  const bones = [];
  for (let i = 0; i < BONE_COUNT; i++) {
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

  /* Женские плечи заметно уже и покатее мужских.
     Руки анатомической длины: кисть достаёт до середины бедра (канон 7.5 голов роста) */
  const shoulderX = (female ? 0.154 : 0.204) * wScale;
  const shoulderY = (female ? 1.345 : 1.42)  * hScale;
  const upperArmLen = (female ? 0.257 : 0.284) * hScale;
  const forearmLen  = (female ? 0.236 : 0.263) * hScale;

  const hipX     = (female ? 0.082 : 0.084) * wScale;
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

  /* Ноги (с суставом плюсны: стопа умеет перекатываться с пятки на пальцы!) */
  bones[BONE_IDX.THIGH_L].position.set(hipX, -0.03, 0);
  bones[BONE_IDX.SHIN_L].position.set(0, -thighLen, 0);
  bones[BONE_IDX.FOOT_L].position.set(0, -shinLen, 0.008);
  bones[BONE_IDX.TOE_L].position.set(0, -0.048 * hScale, 0.062); // сустав у подушечки стопы
  bones[BONE_IDX.PELVIS].add(bones[BONE_IDX.THIGH_L]);
  bones[BONE_IDX.THIGH_L].add(bones[BONE_IDX.SHIN_L]);
  bones[BONE_IDX.SHIN_L].add(bones[BONE_IDX.FOOT_L]);
  bones[BONE_IDX.FOOT_L].add(bones[BONE_IDX.TOE_L]);

  bones[BONE_IDX.THIGH_R].position.set(-hipX, -0.03, 0);
  bones[BONE_IDX.SHIN_R].position.set(0, -thighLen, 0);
  bones[BONE_IDX.FOOT_R].position.set(0, -shinLen, 0.008);
  bones[BONE_IDX.TOE_R].position.set(0, -0.048 * hScale, 0.062);
  bones[BONE_IDX.PELVIS].add(bones[BONE_IDX.THIGH_R]);
  bones[BONE_IDX.THIGH_R].add(bones[BONE_IDX.SHIN_R]);
  bones[BONE_IDX.SHIN_R].add(bones[BONE_IDX.FOOT_R]);
  bones[BONE_IDX.FOOT_R].add(bones[BONE_IDX.TOE_R]);

  bones[BONE_IDX.ROOT].updateMatrixWorld(true);
  return {
    bones,
    skeleton: new THREE.Skeleton(bones), // boneInverses зафиксированы в rest-позе!
    metrics: {
      hScale, wScale, limbBulk: female ? 1 : (isEden ? 1.06 : 1.12),
      hipY, spineY, chestY, neckY, headY,
      shoulderX, shoulderY, upperArmLen, forearmLen,
      hipX, thighLen, shinLen
    }
  };
}

/* ---------- 1. ЧИСТОЕ АНАТОМИЧЕСКОЕ БАЗОВОЕ ТЕЛО (КОЖА + ИСПОДНЕЕ) ----------
   НИКАКИХ геометрических ступенек одежды: гладкие предплечья, гладкие голени и
   настоящие босые стопы. Края исподнего — парные кольца С ОДИНАКОВОЙ геометрией
   (чёткая граница цвета без малейшего рельефа и размазывания).
   Зоны UV базовой текстуры: кожа cy=0..232, исподний верх cy=236..368, низ cy=376..512. */
export function buildBaseBodyGeometry(female = false, metrics) {
  const mb = new MeshBuilder(true);
  const m = metrics;
  const hs = m.hScale || 1;
  const ws = m.wScale || 1;
  const P = BONE_IDX.PELVIS, S = BONE_IDX.SPINE, C = BONE_IDX.CHEST, N = BONE_IDX.NECK, H = BONE_IDX.HEAD;

  /* === А. ТОРС (segs = 20, снизу вверх, ascendingY = true) ===
     [cyTex, yRaw, rx, rzF, rzB, zOff, b0, w0, b1, w1] */
  const torsoRows = female
    ? [
        /* Таз в исподнем (низ развилки) и округлые женские бёдра */
        [496, 0.875, 0.156, 0.082, 0.110, -0.008, P, 0.82, S, 0.18],
        [468, 0.945, 0.160, 0.084, 0.114, -0.008, P, 0.85, S, 0.15],
        /* Верхний край исподнего: ПАРНЫЕ кольца одинаковой геометрии (чёткий край без ступеньки!) */
        [382, 1.012, 0.128, 0.079, 0.096, -0.005, P, 0.68, S, 0.32],
        [198, 1.012, 0.128, 0.079, 0.096, -0.005, P, 0.68, S, 0.32],
        /* Тонкая высокая талия */
        [187, 1.045, 0.121, 0.077, 0.092, -0.002, S, 0.75, P, 0.25],
        [176, 1.080, 0.114, 0.078, 0.088,  0.002, S, 0.85, C, 0.15],
        [164, 1.110, 0.113, 0.080, 0.087,  0.003, S, 0.70, C, 0.30],
        /* Под грудью: кожа -> нательная льняная повязка (парные кольца) */
        [152, 1.140, 0.114, 0.082, 0.088,  0.004, S, 0.45, C, 0.55],
        [360, 1.140, 0.114, 0.082, 0.088,  0.004, S, 0.45, C, 0.55],
        /* Объёмная женская грудь (bump добавляется в цикле по yRaw) */
        [336, 1.170, 0.124, 0.090, 0.092,  0.004, S, 0.25, C, 0.75],
        [300, 1.215, 0.132, 0.096, 0.094,  0.004, C, 1.00, S, 0.00],
        [268, 1.265, 0.134, 0.098, 0.096,  0.004, C, 1.00, N, 0.00],
        /* Верхний край повязки: парные кольца -> чистая кожа груди и ключиц */
        [248, 1.302, 0.134, 0.086, 0.090, -0.002, C, 0.95, N, 0.05],
        [ 52, 1.302, 0.134, 0.086, 0.090, -0.002, C, 0.95, N, 0.05],
        [ 40, 1.336, 0.136, 0.078, 0.086, -0.004, C, 0.90, N, 0.10],
        /* Узкие покатые женские плечи и изящная шея */
        [ 30, 1.364, 0.130, 0.070, 0.078, -0.005, C, 0.82, N, 0.18],
        [ 20, 1.392, 0.088, 0.060, 0.066, -0.005, N, 0.55, C, 0.45],
        [ 14, 1.422, 0.048, 0.045, 0.050, -0.004, N, 0.80, H, 0.20],
        [  9, 1.462, 0.044, 0.043, 0.048, -0.002, H, 0.82, N, 0.18],
        [  5, 1.510, 0.041, 0.041, 0.045,  0.000, H, 1.00, N, 0.00]
      ]
    : [
        /* Мужской таз в исподнем */
        [496, 0.905, 0.148, 0.086, 0.110, -0.006, P, 0.82, S, 0.18],
        [466, 0.975, 0.148, 0.090, 0.110, -0.006, P, 0.80, S, 0.20],
        /* Верхний край исподнего: парные кольца -> голый торс */
        [382, 1.018, 0.146, 0.092, 0.106, -0.004, P, 0.60, S, 0.40],
        [208, 1.018, 0.146, 0.092, 0.106, -0.004, P, 0.60, S, 0.40],
        [184, 1.110, 0.146, 0.100, 0.106,  0.002, S, 0.80, C, 0.20],
        [156, 1.165, 0.153, 0.107, 0.110,  0.003, S, 0.55, C, 0.45],
        [128, 1.210, 0.164, 0.114, 0.114,  0.004, S, 0.30, C, 0.70],
        [102, 1.270, 0.175, 0.119, 0.117,  0.002, C, 0.90, S, 0.10],
        [ 76, 1.320, 0.180, 0.118, 0.117,  0.000, C, 1.00, N, 0.00],
        [ 60, 1.365, 0.183, 0.109, 0.111, -0.002, C, 0.95, N, 0.05],
        [ 46, 1.415, 0.182, 0.096, 0.102, -0.005, C, 0.88, N, 0.12],
        [ 32, 1.455, 0.128, 0.078, 0.085, -0.006, N, 0.50, C, 0.50],
        [ 20, 1.490, 0.066, 0.059, 0.064, -0.004, N, 0.80, H, 0.20],
        [ 12, 1.540, 0.058, 0.056, 0.061, -0.002, H, 0.85, N, 0.15],
        [  6, 1.590, 0.051, 0.051, 0.055,  0.000, H, 1.00, N, 0.00]
      ];

  const segsTorso = 20;
  const torsoRings = [];

  for (let r = 0; r < torsoRows.length; r++) {
    const [cyTex, yRaw, rxBase, rzFBase, rzBBase, zOff, b0, w0, b1, w1] = torsoRows[r];
    const yBase = yRaw * hs;
    const rx = rxBase * ws;
    const vTex = cyToV(cyTex);
    const ring = [];

    for (let s = 0; s <= segsTorso; s++) {
      const uFrac = s / segsTorso;
      const phi = (uFrac - 0.5) * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      let rz = cosP >= 0 ? rzFBase : rzBBase;
      /* Мягкий объём груди без раздельных заострённых куполов. */
      if (female && cosP > 0.1 && yRaw > 1.150 && yRaw < 1.310) {
        const tB = (yRaw - 1.150) / 0.160;
        const breastW = Math.sin(tB * Math.PI);
        rz += 0.016 * breastW * Math.max(0, cosP);
      }

      // Небольшая, непрерывная форма грудных мышц в той же поверхности торса.
      if (!female && cosP > 0.15) {
        const height = Math.exp(-(((yRaw - 1.30) / 0.075) ** 2));
        const chest = Math.exp(-(((Math.abs(sinP) - 0.45) / 0.34) ** 2));
        rz += 0.027 * height * chest * cosP;
      }
      // Небольшой профиль живота и спины, без текстурных полос на общей UV-зоне.
      const bellyY = female ? 1.075 : 1.105;
      const belly = Math.exp(-(((yRaw - bellyY) / 0.075) ** 2));
      if (cosP > 0) rz += (female ? 0.004 : 0.006) * belly * cosP;
      let y = yBase;
      let vb0 = b0, vw0 = w0, vb1 = b1, vw1 = w1;
      if (r === 0) {
        /* Нижнее кольцо таза: паховый свод и веса бёдер по бокам */
        const centerDip = Math.pow(Math.abs(cosP), 1.6) * 0.022 * hs;
        y -= centerDip;
        const sideWeight = Math.abs(sinP);
        if (sinP < -0.05) {
          vb0 = P; vw0 = 1 - sideWeight * 0.42;
          vb1 = BONE_IDX.THIGH_R; vw1 = sideWeight * 0.42;
        } else if (sinP > 0.05) {
          vb0 = P; vw0 = 1 - sideWeight * 0.42;
          vb1 = BONE_IDX.THIGH_L; vw1 = sideWeight * 0.42;
        } else {
          vb0 = P; vw0 = 1.0; vb1 = 0; vw1 = 0;
        }
      }

      // Мягко расширяем верхние боковые сечения грудной клетки к дельте.
      const shoulderY = female ? 1.345 : 1.415;
      const shoulder = Math.exp(-(((yRaw - shoulderY) / 0.055) ** 2)) * Math.pow(Math.abs(sinP), 4);
      const shoulderX = sinP * (rx + (female ? 0.013 : 0.010) * ws * shoulder);
      ring.push(mb.addVertex(shoulderX, y, zOff + cosP * rz, uFrac, vTex, vb0, vw0, vb1, vw1));
    }
    mb.seamPairs.push([ring[0], ring[segsTorso]]);
    torsoRings.push(ring);
  }

  mb.connectRings(torsoRings, true);

  /* === Б. БЕСШОВНАЯ РАЗВИЛКА ТАЗА В ОБЕ НОГИ (общие вершины пахового шва) === */
  const hipRing = torsoRings[0];
  const backHipData  = mb.getVertexData(hipRing[0]);
  const frontHipData = mb.getVertexData(hipRing[10]);

  const seam3DPts = [];
  for (let k = 0; k <= 6; k++) {
    const t = k / 6;
    const archDip = Math.sin(t * Math.PI) * 0.026 * hs;
    seam3DPts.push({
      x: 0,
      y: lerp(backHipData.y, frontHipData.y, t) - archDip,
      z: lerp(backHipData.z, frontHipData.z, t)
    });
  }

  function buildLeg(isLeft) {
    const sign = isLeft ? 1 : -1;
    const bThigh = isLeft ? BONE_IDX.THIGH_L : BONE_IDX.THIGH_R;
    const bShin  = isLeft ? BONE_IDX.SHIN_L  : BONE_IDX.SHIN_R;
    const bFoot  = isLeft ? BONE_IDX.FOOT_L  : BONE_IDX.FOOT_R;
    const bToe   = isLeft ? BONE_IDX.TOE_L   : BONE_IDX.TOE_R;

    const hx = sign * m.hipX;
    const hy = m.hipY - 0.03 * hs;
    const kx = sign * (m.hipX * 0.94);
    const ky = hy - m.thighLen;
    const ax = sign * (m.hipX * 0.90);
    const ay = ky - m.shinLen;

    const segsLeg = 16;
    const rings = [];

    /* Кольцо 0: сшивка с нижним кольцом таза и паховым швом (зона исподнего, cy = 502) */
    const startRing = [];
    const vStart = cyToV(502);
    if (!isLeft) {
      for (let sL = 0; sL <= segsLeg; sL++) {
        const uFrac = sL / segsLeg;
        if (sL <= 10) {
          const srcIdx = hipRing[sL];
          const d = mb.getVertexData(srcIdx);
          const vIdx = mb.addVertex(d.x, d.y, d.z, uFrac, vStart, d.b0, d.w0, d.b1, d.w1);
          mb.seamPairs.push([srcIdx, vIdx]);
          startRing.push(vIdx);
        } else {
          const k = 16 - sL;
          const sp = seam3DPts[k];
          const vIdx = mb.addVertex(sp.x, sp.y, sp.z, uFrac, vStart, P, 0.85, bThigh, 0.15);
          if (k === 0) mb.seamPairs.push([hipRing[0], vIdx]);
          startRing.push(vIdx);
        }
      }
    } else {
      for (let sL = 0; sL <= segsLeg; sL++) {
        const uFrac = sL / segsLeg;
        if (sL < 6) {
          const sp = seam3DPts[sL];
          const vIdx = mb.addVertex(sp.x, sp.y, sp.z, uFrac, vStart, P, 0.85, bThigh, 0.15);
          if (sL === 0) mb.seamPairs.push([hipRing[20], vIdx]);
          startRing.push(vIdx);
        } else {
          const srcIdx = hipRing[10 + (sL - 6)];
          const d = mb.getVertexData(srcIdx);
          const vIdx = mb.addVertex(d.x, d.y, d.z, uFrac, vStart, d.b0, d.w0, d.b1, d.w1);
          mb.seamPairs.push([srcIdx, vIdx]);
          startRing.push(vIdx);
        }
      }
    }
    mb.seamPairs.push([startRing[0], startRing[segsLeg]]);
    rings.push(startRing);

    /* Станции ГЛАДКОЙ голой ноги: единственный «край» — кромка исподнего (парные кольца
       ОДИНАКОВОЙ геометрии). Дальше — чистая кожа до самых босых пальцев.
       [cyTex, cx, cy3d, cz, rx, rz, b0, w0, b1, w1] */
    const rThighX = (female ? 0.072 : 0.075) * ws;
    const rThighZ = (female ? 0.078 : 0.082);
    const hemX = lerp(hx, kx, 0.26);
    const hemY = lerp(hy, ky, 0.26);
    const hemRx = rThighX * 0.965;
    const hemRz = rThighZ * 0.965;

    const legStations = [
      [506, hx * 0.96, lerp(hy, ky, 0.13), 0.000, rThighX, rThighZ, P, 0.20, bThigh, 0.80],
      /* Кромка исподнего: пара без изменения радиуса! */
      [510, hemX, hemY, 0.003, hemRx, hemRz, bThigh, 1.0, 0, 0],
      [ 66, hemX, hemY, 0.003, hemRx, hemRz, bThigh, 1.0, 0, 0],
      /* Гладкое голое бедро, колено, икра и щиколотка */
      [ 92, lerp(hx, kx, 0.54), lerp(hy, ky, 0.54),  0.004, (female ? 0.063 : 0.067) * ws, (female ? 0.068 : 0.073), bThigh, 1.0,  bShin, 0.0],
      [106, lerp(hx, kx, 0.72), lerp(hy, ky, 0.72), 0.003, (female ? 0.057 : 0.060) * ws, (female ? 0.061 : 0.066), bThigh, 0.92, bShin, 0.08],
      [122, lerp(hx, kx, 0.88), lerp(hy, ky, 0.88),  0.000, (female ? 0.050 : 0.054) * ws, (female ? 0.053 : 0.058), bThigh, 0.74, bShin, 0.26],
      [136, kx, ky, 0.002, (female ? 0.047 : 0.052) * ws, (female ? 0.051 : 0.056), bThigh, 0.48, bShin, 0.52],
      [143, lerp(kx, ax, 0.09), lerp(ky, ay, 0.09), -0.003, (female ? 0.047 : 0.050) * ws, (female ? 0.051 : 0.054), bShin, 0.76, bThigh, 0.24],
      [150, lerp(kx, ax, 0.20), lerp(ky, ay, 0.20), -0.006, (female ? 0.048 : 0.050) * ws, (female ? 0.052 : 0.054), bShin, 0.92, bThigh, 0.08],
      [158, lerp(kx, ax, 0.35), lerp(ky, ay, 0.35), -0.009, (female ? 0.049 : 0.051) * ws, (female ? 0.054 : 0.056), bShin, 1.0, bFoot, 0.0],
      [168, lerp(kx, ax, 0.52), lerp(ky, ay, 0.52), -0.008, (female ? 0.048 : 0.047) * ws, (female ? 0.052 : 0.052), bShin, 1.0,  bFoot, 0.0],
      [181, lerp(kx, ax, 0.75), lerp(ky, ay, 0.75), -0.006, (female ? 0.041 : 0.043) * ws, (female ? 0.046 : 0.049), bShin, 0.90, bFoot, 0.10],
      [196, ax, ay + 0.060 * hs, -0.002, (female ? 0.035 : 0.040) * ws, (female ? 0.038 : 0.044), bShin, 0.60, bFoot, 0.40],
      [204, ax, ay + 0.030 * hs,  0.004, (female ? 0.034 : 0.039) * ws, (female ? 0.042 : 0.047), bShin, 0.35, bFoot, 0.65]
    ];

    for (let i = 0; i < legStations.length; i++) {
      const [cyTex, cx, cy3d, cz, rx, rz, b0, w0, b1, w1] = legStations[i];
      const vTex = cyToV(cyTex);
      const ring = [];
      for (let s = 0; s <= segsLeg; s++) {
        const uFrac = s / segsLeg;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        // Утолщаем бедро и икру, мягко возвращая исходную ширину к щиколотке.
        const blend = [0.75, 1, 1, 1, 0.95, 0.9, 0.8, 0.9, 1, 1, 1, 0.7, 0.25, 0][i];
        const bulk = 1 + ((m.limbBulk || 1) - 1) * blend;
        const front = Math.max(0, Math.cos(phi));
        const back = Math.max(0, -Math.cos(phi));
        // Мягкая выпуклость квадрицепса и икры без рисованных полос.
        const quad = female ? 0 : [0, 0.003, 0.003, 0.007, 0.005, 0.002, 0, 0, 0, 0, 0, 0, 0, 0][i] * front * front;
        const calf = female ? 0 : [0, 0, 0, 0, 0, 0, 0, 0.002, 0.004, 0.006, 0.005, 0.002, 0, 0][i] * back * back;
        ring.push(mb.addVertex(cx + Math.sin(phi) * rx * bulk, cy3d, cz + Math.cos(phi) * rz * bulk + quad - calf, uFrac, vTex, b0, w0, b1, w1));
      }
      mb.seamPairs.push([ring[0], ring[segsLeg]]);
      rings.push(ring);
    }

    /* Настоящая БОСАЯ стопа: плавный спуск от щиколотки, низкий подъём,
       вытянутый вперёд носок и округлая пятка — человеческая ступня, а не обрубок! */
    const footScale = (female ? 0.88 : 1.00) * ws;
    const footSpecs = [
      [205, ax, 0.070 * hs, 0.009, 0.034 * ws, 0.048],
      [208, ax, 0.052 * hs, 0.014, 0.037 * footScale, 0.053 * footScale],
      [214, ax, 0.035 * hs, 0.018, 0.038 * footScale, 0.058 * footScale],
      [222, ax, 0.018 * hs, 0.029, 0.041 * footScale, 0.076 * footScale],
      [228, ax, 0.004 * hs, 0.022, 0.039 * footScale, 0.075 * footScale]
    ];
    for (let f = 0; f < footSpecs.length; f++) {
      const [cyTex, fx, fy, fz, frx, frz] = footSpecs[f];
      const vTex = cyToV(cyTex);
      const ring = [];
      for (let s = 0; s <= segsLeg; s++) {
        const uFrac = s / segsLeg;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        const cosP = Math.cos(phi);
        // Переход от круглой голени к стопе постепенный, без резкого «манжета».
        const footBlend = Math.min(1, f / 3);
        const zStretch = cosP >= 0 ? frz * (1 + 0.28 * footBlend) : frz * (1 - 0.18 * footBlend);
        // Более широкая линия передка, не заострённый «носок».
        const toeShape = Math.max(0, Math.min(1, (0.045 * hs - fy) / (0.025 * hs)));
        const front = cosP > 0 ? cosP * (1 - toeShape) + Math.sqrt(cosP) * toeShape : cosP;
        const vz = fz + front * zStretch;
        /* Передняя часть стопы (плюсна и пальцы) принадлежит кости носка:
           плавный переход весов за суставом подушечки — стопа ПЕРЕКАТЫВАЕТСЯ, а не гнётся доской */
        const toeW = Math.max(0, Math.min(1, (vz - 0.052) / 0.055)) * Math.max(0, Math.min(1, (0.055 * hs - fy) / (0.025 * hs)));
        ring.push(mb.addVertex(fx + Math.sin(phi) * frx, fy, vz, uFrac, vTex, bFoot, 1.0 - toeW, bToe, toeW));
      }
      mb.seamPairs.push([ring[0], ring[segsLeg]]);
      rings.push(ring);
    }

    mb.connectRings(rings, false);
    const soleCenter = mb.addVertex(ax, 0.002, 0.050, 0.5, cyToV(230), bFoot, 1, 0, 0);
    mb.capRing(rings[rings.length - 1], soleCenter, false);
  }

  /* Диапазоны вершин конечностей — задел под механику отсечения (Kenshi-style):
     [от, до) в индексах вершин итоговой геометрии */
  const limbRanges = { torso: [0, mb.vertCount] };

  let mark = mb.vertCount;
  buildLeg(false);
  limbRanges.legR = [mark, mb.vertCount];
  mark = mb.vertCount;
  buildLeg(true);
  limbRanges.legL = [mark, mb.vertCount];

  /* === В. ГЛАДКИЕ ГОЛЫЕ РУКИ (ни одной ступеньки обшлага — только чистая кожа) === */
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

    const musc = (female ? 0.89 : 1.02) * ws;

    const armStations = [
      [ 26, sx - sign * 0.040, sy + 0.022 * hs, -0.005, 0.026 * musc, 0.034 * musc, C, 0.90, bUpper, 0.10],
      [ 31, sx - sign * 0.025, sy + 0.012 * hs, -0.005, 0.045 * musc, 0.052 * musc, C, 0.70, bUpper, 0.30],
      [ 36, sx - sign * 0.014, sy - 0.006 * hs, -0.005, 0.054 * musc, 0.059 * musc, C, 0.52, bUpper, 0.48],
      [ 50, sx + sign * 0.004, sy - 0.040 * hs, -0.005, 0.049 * musc, 0.052 * musc, C, 0.15, bUpper, 0.85],
      [ 84, lerp(sx, ex, 0.54), lerp(sy, ey, 0.54), -0.004, 0.043 * musc, 0.046 * musc, bUpper, 1.0, bFore, 0.0],
      [101, lerp(sx, ex, 0.78), lerp(sy, ey, 0.78), -0.006, 0.039 * musc, 0.042 * musc, bUpper, 0.85, bFore, 0.15],
      [116, ex, ey, -0.007, 0.037 * musc, 0.039 * musc, bUpper, 0.50, bFore, 0.50],
      [133, lerp(ex, wx, 0.23), lerp(ey, wy, 0.23), -0.004, 0.035 * musc, 0.037 * musc, bFore, 0.80, bUpper, 0.20],
      [150, lerp(ex, wx, 0.55), lerp(ey, wy, 0.55), 0.002, 0.032 * musc, 0.034 * musc, bFore, 1.0, bHand, 0.0],
      [184, lerp(ex, wx, 0.95), lerp(ey, wy, 0.95), 0.007, 0.025 * musc, 0.022 * musc, bFore, 0.55, bHand, 0.45],
      /* Кисть и пальцы */
      [196, wx + sign * 0.002, wy - 0.040 * hs, 0.012, 0.020 * musc, 0.034 * musc, bHand, 1.0, bFore, 0.0],
      [208, wx - sign * 0.004, wy - 0.080 * hs, 0.016, 0.016 * musc, 0.028 * musc, bHand, 1.0, bFore, 0.0],
      [218, wx - sign * 0.008, wy - 0.104 * hs, 0.018, 0.010 * musc, 0.018 * musc, bHand, 1.0, bFore, 0.0]
    ];

    const segsArm = 20;
    const rings = [];
    for (let i = 0; i < armStations.length; i++) {
      const [cyTex, cx, cy3d, cz, rx, rz, b0, w0, b1, w1] = armStations[i];
      const vTex = cyToV(cyTex);
      const ring = [];
      for (let s = 0; s <= segsArm; s++) {
        const uFrac = s / segsArm;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        // Объём руки постепенно сходит к запястью, кисти не увеличиваются.
        const blend = [0.45, 0.75, 1, 1, 1, 1, 1, 0.9, 0.8, 0.15, 0, 0, 0][i];
        const bulk = 1 + ((m.limbBulk || 1) - 1) * blend;
        const front = Math.max(0, Math.cos(phi));
        // Бицепс в расслабленной руке: лёгкий объём спереди, без отдельного шара.
        const bicep = female ? 0 : [0, 0, 0, 0.002, 0.007, 0.004, 0.0015, 0, 0, 0, 0, 0, 0][i] * front * front;
        // Скругляем торец дельты, чтобы верх руки не выглядел плоской площадкой.
        const shoulderRound = (i <= 2 ? [0.002, 0.005, 0.006][i] : 0) * Math.pow(Math.abs(Math.sin(phi)), 2);
        ring.push(mb.addVertex(cx + Math.sin(phi) * rx * bulk, cy3d - shoulderRound, cz + Math.cos(phi) * rz * bulk + bicep, uFrac, vTex, b0, w0, b1, w1));
      }
      mb.seamPairs.push([ring[0], ring[segsArm]]);
      rings.push(ring);
    }

    const capTop = mb.addVertex(sx - sign * 0.065, sy + 0.024 * hs, -0.005, 0.5, cyToV(26), C, 0.92, bUpper, 0.08);
    mb.capRing(rings[0], capTop, true);
    mb.connectRings(rings, false);

    const tip = mb.addVertex(wx - sign * 0.010, wy - 0.112 * hs, 0.018, 0.5, cyToV(222), bHand, 1, 0, 0);
    mb.capRing(rings[rings.length - 1], tip, false);

    /* Большой палец */
    const thumbRings = [];
    const thumbSteps = [
      [200, wx - sign * 0.005, wy - 0.024 * hs, 0.030, 0.012 * musc],
      [210, wx - sign * 0.010, wy - 0.052 * hs, 0.044, 0.010 * musc],
      [218, wx - sign * 0.012, wy - 0.072 * hs, 0.050, 0.007 * musc]
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
    const tTip = mb.addVertex(wx - sign * 0.012, wy - 0.078 * hs, 0.052, 0.5, cyToV(222), bHand, 1, 0, 0);
    mb.capRing(thumbRings[2], tTip, false);
  }

  mark = mb.vertCount;
  buildArm(true);
  limbRanges.armL = [mark, mb.vertCount];
  mark = mb.vertCount;
  buildArm(false);
  limbRanges.armR = [mark, mb.vertCount];

  const geo = mb.toGeometry();
  geo.userData.limbRanges = limbRanges;
  return geo;
}

/* ---------- 2. ОТДЕЛЬНАЯ ГЕОМЕТРИЯ ВЕРХНЕЙ ОДЕЖДЫ, НАРУЧЕЙ, ШТАНОВ И САПОГ ----------
   Самостоятельный слой поверх того же скелета. Каждый край одежды — настоящий
   геометрический край объекта. UV-полосы гардеробного атласа изолированы:
   А(0..168) торс, Б(176..216) пояс, В(224..304) верх рукава, Г(312..376) наруч/нижний
   рукав, Д(384..448) штаны, Е(456..512) обувь. */
export function buildGarmentGeometry(female = false, rawOutfit = "villager", kingdom = "north", metrics = null) {
  const outfit = normalizeOutfitKey(rawOutfit);
  if (outfit === "underwear" || !metrics) return null;

  const isEden = normalizeKingdomKey(kingdom) === "eden";
  const isWarrior = outfit === "warrior";
  const mb = new MeshBuilder(true);
  const m = metrics;
  const hs = m.hScale || 1;
  const ws = m.wScale || 1;
  const P = BONE_IDX.PELVIS, S = BONE_IDX.SPINE, C = BONE_IDX.CHEST, N = BONE_IDX.NECK;

  const bulk = isWarrior ? 1.035 : 1.0;

  /* === А+Б. ТУНИКА / КОТАРДИ / БРИГАНТИНА / СЮРКО с поясом (снизу вверх) === */
  const dress = female && !isWarrior; /* женское котарди Златодвора/Севера — юбка-клёш до середины бедра */
  const hemY = dress ? 0.620 : (female ? 0.740 : 0.760);

  /* Запас одежды над телом везде >= 6-12 мм (никакого z-fighting и «рваных» дыр!),
     на выпуклой груди — частые кольца, чтобы хорда одежды не резала дугу тела. */
  const torsoRows = female
    ? [
        dress
          ? [164, hemY, 0.195, 0.195, 0.190, -0.004, P, 1.00, S, 0.00]
          : [164, hemY, 0.170, 0.124, 0.136, -0.006, P, 1.00, S, 0.00],
        [150, dress ? 0.760 : 0.820, 0.168, dress ? 0.165 : 0.135, dress ? 0.165 : 0.145, -0.006, P, 1.00, S, 0.00],
        [138, 0.875, 0.172, 0.096, 0.126, -0.008, P, 0.85, S, 0.15],
        [128, 0.950, 0.174, 0.094, 0.126, -0.007, P, 0.80, S, 0.20],
        /* Пояс (парные кольца на границах полосы Б) */
        [122, 1.004, 0.146, 0.090, 0.108, -0.005, P, 0.60, S, 0.40],
        [212, 1.004, 0.146, 0.090, 0.108, -0.005, P, 0.60, S, 0.40],
        [180, 1.048, 0.140, 0.088, 0.104, -0.004, P, 0.45, S, 0.55],
        [116, 1.052, 0.139, 0.088, 0.103, -0.004, S, 0.60, P, 0.40],
        /* Приталенный лиф с плотной сеткой колец по дуге груди */
        [104, 1.082, 0.122, 0.087, 0.094,  0.002, S, 0.85, C, 0.15],
        [ 88, 1.140, 0.126, 0.091, 0.096,  0.004, S, 0.45, C, 0.55],
        [ 76, 1.180, 0.134, 0.099, 0.098,  0.004, C, 0.80, S, 0.20],
        [ 64, 1.225, 0.144, 0.108, 0.100,  0.004, C, 1.00, S, 0.00],
        [ 52, 1.268, 0.144, 0.104, 0.099,  0.002, C, 1.00, N, 0.00],
        [ 40, 1.302, 0.144, 0.094, 0.097, -0.002, C, 0.95, N, 0.05],
        [ 22, 1.355, 0.144, 0.084, 0.090, -0.005, C, 0.85, N, 0.15],
        [  8, 1.390, 0.104, 0.068, 0.074, -0.005, N, 0.55, C, 0.45]
      ]
    : [
        [164, hemY, 0.185, 0.165, 0.165, -0.006, P, 1.00, S, 0.00],
        [150, 0.870, 0.170, 0.135, 0.145, -0.006, P, 0.85, S, 0.15],
        [140, 0.975, 0.160, 0.103, 0.124, -0.006, P, 0.80, S, 0.20],
        [130, 1.016, 0.158, 0.103, 0.119, -0.004, P, 0.55, S, 0.45],
        [212, 1.016, 0.158, 0.103, 0.119, -0.004, P, 0.55, S, 0.45],
        [180, 1.058, 0.156, 0.104, 0.117, -0.002, P, 0.40, S, 0.60],
        [116, 1.062, 0.156, 0.104, 0.116, -0.002, S, 0.65, P, 0.35],
        [104, 1.115, 0.158, 0.110, 0.117,  0.002, S, 0.80, C, 0.20],
        [ 76, 1.215, 0.174, 0.140, 0.125,  0.004, S, 0.30, C, 0.70],
        [ 44, 1.325, 0.190, 0.147, 0.127,  0.000, C, 1.00, N, 0.00],
        [ 24, 1.420, 0.192, 0.106, 0.112, -0.005, C, 0.88, N, 0.12],
        [  8, 1.462, 0.160, 0.086, 0.092, -0.006, N, 0.50, C, 0.50]
      ];

  const segsTorso = 20;
  const tunicRings = [];
  for (let r = 0; r < torsoRows.length; r++) {
    const [cyTex, yRaw, rxBase, rzFBase, rzBBase, zOff, b0, w0, b1, w1] = torsoRows[r];
    const vTex = cyToV(cyTex);
    const ring = [];
    for (let s = 0; s <= segsTorso; s++) {
      const uFrac = s / segsTorso;
      const phi = (uFrac - 0.5) * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      let rz = (cosP >= 0 ? rzFBase : rzBBase) * bulk;
      /* Плавный объём одежды поверх груди. */
      if (female && cosP > 0.1 && yRaw > 1.125 && yRaw < 1.315) {
        const tB = (yRaw - 1.125) / 0.190;
        const breastW = Math.sin(tB * Math.PI);
        rz += 0.021 * breastW * Math.max(0, cosP);
      }
      /* Нижние кольца подола: боковые вершины частично следуют за бедром своей стороны —
         нога при шаге частично увлекает ткань; пересечения требуют визуальной проверки */
      let vb0 = b0, vw0 = w0, vb1 = b1, vw1 = w1;
      if (b0 === P && yRaw < 0.90) {
        const follow = Math.max(0, Math.min(1, (0.95 - yRaw) / 0.40));
        const thighShare = Math.abs(sinP) * follow * 0.90;
        if (thighShare > 0.03) {
          vb0 = P; vw0 = 1 - thighShare;
          vb1 = sinP > 0 ? BONE_IDX.THIGH_L : BONE_IDX.THIGH_R;
          vw1 = thighShare;
        }
      }
      ring.push(mb.addVertex(sinP * rxBase * ws * bulk, yRaw * hs, zOff + cosP * rz, uFrac, vTex, vb0, vw0, vb1, vw1));
    }
    mb.seamPairs.push([ring[0], ring[segsTorso]]);
    tunicRings.push(ring);
  }
  mb.connectRings(tunicRings, true);

  /* === В+Г. РУКАВА И НАРУЧИ (сверху вниз, ascendingY = false) ===
     lowerKind: "none" (открытое предплечье), "cloth", "leather", "steel" */
  const lowerKind = isWarrior ? (isEden ? "steel" : "leather") : (isEden ? "cloth" : "none");

  function buildSleeve(isLeft) {
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

    const sc = (female ? 0.99 : 1.06 * (m.limbBulk || 1)) * ws * (isWarrior ? 1.05 : 1.0);

    /* Высокий округлый кат плеча: купол рукава поднят НАД дельтой тела (без прорех на плечах) */
    const rows = [
      [228, sx - sign * 0.050, sy + 0.026 * hs, -0.005, 0.045 * sc, 0.052 * sc, C, 0.90, bUpper, 0.10],
      [238, sx - sign * 0.012, sy + 0.008 * hs, -0.005, 0.064 * sc, 0.067 * sc, C, 0.52, bUpper, 0.48],
      [252, sx + sign * 0.004, sy - 0.040 * hs, -0.005, 0.054 * sc, 0.056 * sc, C, 0.15, bUpper, 0.85],
      [274, lerp(sx, ex, 0.54), lerp(sy, ey, 0.54), -0.004, (female ? 0.048 : 0.052) * sc, (female ? 0.050 : 0.058) * sc, bUpper, 1.0, bFore, 0.0],
      [298, ex, ey, -0.007, 0.043 * sc, 0.045 * sc, bUpper, 0.50, bFore, 0.50]
    ];

    if (lowerKind === "none") {
      /* Северный рукав 3/4: открытый край чуть ниже локтя */
      rows.push([303, lerp(ex, wx, 0.16), lerp(ey, wy, 0.16), -0.004, 0.044 * sc, 0.046 * sc, bFore, 0.85, bUpper, 0.15]);
    } else {
      const brc = lowerKind === "cloth" ? 0.92 : 1.0;
      /* Парный переход В -> Г без геометрической ступеньки */
      const jx = lerp(ex, wx, 0.10), jy = lerp(ey, wy, 0.10);
      rows.push(
        [303, jx, jy, -0.004, 0.042 * sc * brc, 0.044 * sc * brc, bFore, 0.80, bUpper, 0.20],
        [316, jx, jy, -0.004, 0.042 * sc * brc, 0.044 * sc * brc, bFore, 0.80, bUpper, 0.20],
        [340, lerp(ex, wx, 0.52), lerp(ey, wy, 0.52), 0.002, 0.036 * sc * brc, 0.038 * sc * brc, bFore, 1.0, bHand, 0.0],
        [368, lerp(ex, wx, 0.93), lerp(ey, wy, 0.93), 0.006, 0.030 * sc * brc, 0.028 * sc * brc, bFore, 0.60, bHand, 0.40]
      );
    }

    const segsArm = 12;
    const rings = [];
    for (let i = 0; i < rows.length; i++) {
      const [cyTex, cx, cy3d, cz, rx, rz, b0, w0, b1, w1] = rows[i];
      const vTex = cyToV(cyTex);
      const ring = [];
      for (let s = 0; s <= segsArm; s++) {
        const uFrac = s / segsArm;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        ring.push(mb.addVertex(cx + Math.sin(phi) * rx, cy3d, cz + Math.cos(phi) * rz, uFrac, vTex, b0, w0, b1, w1));
      }
      mb.seamPairs.push([ring[0], ring[segsArm]]);
      rings.push(ring);
    }

    const capTop = mb.addVertex(sx - sign * 0.065, sy + 0.034 * hs, -0.005, 0.5, cyToV(226), C, 0.92, bUpper, 0.08);
    mb.capRing(rings[0], capTop, true);
    mb.connectRings(rings, false);
  }

  buildSleeve(true);
  buildSleeve(false);

  /* === Д. ШТАНЫ / ШОССЫ (две штанины сверху вниз; верх скрыт под подолом) ===
     Радиусы по X и Z масштабируются раздельно: глубина ноги тела НЕ зависит от ширины
     кости народа, поэтому запас по Z обязан быть собственным (фикс «прогрызенных» штанин). */
  const pantsSX = (female ? 0.97 : (m.limbBulk || 1)) * ws;
  const pantsSZ = female ? 0.98 : 1.06 * (m.limbBulk || 1);

  function buildPantLeg(isLeft) {
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

    const rows = [
      [388, hx * 0.97, lerp(hy, ky, 0.08), 0.000, 0.080 * pantsSX, 0.091 * pantsSZ, P, 0.25, bThigh, 0.75],
      [402, lerp(hx, kx, 0.38), lerp(hy, ky, 0.38), 0.003, 0.079 * pantsSX, 0.086 * pantsSZ, bThigh, 1.0, 0, 0],
      [416, lerp(hx, kx, 0.72), lerp(hy, ky, 0.72), 0.001, 0.066 * pantsSX, 0.072 * pantsSZ, bThigh, 0.80, bShin, 0.20],
      [428, kx, ky, 0.002, 0.060 * pantsSX, 0.065 * pantsSZ, bThigh, 0.50, bShin, 0.50]
    ];
    if (isWarrior) {
      /* Штанина заходит ГЛУБОКО в голенище сапога (широкая зона перекрытия, без рваного стыка) */
      rows.push([440, lerp(kx, ax, 0.30), lerp(ky, ay, 0.30), -0.007, 0.056 * pantsSX, 0.061 * pantsSZ, bShin, 0.95, bThigh, 0.05]);
    } else {
      rows.push(
        [436, lerp(kx, ax, 0.34), lerp(ky, ay, 0.34), -0.006, 0.054 * pantsSX, 0.059 * pantsSZ, bShin, 1.0, 0, 0],
        [444, ax, ay + 0.040 * hs, -0.002, 0.047 * pantsSX, 0.052 * pantsSZ, bShin, 0.80, bFoot, 0.20]
      );
    }

    const segsLeg = 12;
    const rings = [];
    for (let i = 0; i < rows.length; i++) {
      const [cyTex, cx, cy3d, cz, rx, rz, b0, w0, b1, w1] = rows[i];
      const vTex = cyToV(cyTex);
      const ring = [];
      for (let s = 0; s <= segsLeg; s++) {
        const uFrac = s / segsLeg;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        ring.push(mb.addVertex(cx + Math.sin(phi) * rx, cy3d, cz + Math.cos(phi) * rz, uFrac, vTex, b0, w0, b1, w1));
      }
      mb.seamPairs.push([ring[0], ring[segsLeg]]);
      rings.push(ring);
    }
    mb.connectRings(rings, false);
  }

  buildPantLeg(true);
  buildPantLeg(false);

  /* === Е. ОБУВЬ: туфли/башмаки мирных жителей ИЛИ высокие сапоги воинов === */
  const footSX = (female ? 0.97 : 1.08) * ws;
  const footSZ = female ? 1.00 : 1.10;

  function buildFootwear(isLeft) {
    const sign = isLeft ? 1 : -1;
    const bShin = isLeft ? BONE_IDX.SHIN_L : BONE_IDX.SHIN_R;
    const bFoot = isLeft ? BONE_IDX.FOOT_L : BONE_IDX.FOOT_R;
    const bThigh = isLeft ? BONE_IDX.THIGH_L : BONE_IDX.THIGH_R;
    const bToe  = isLeft ? BONE_IDX.TOE_L : BONE_IDX.TOE_R;

    const hy = m.hipY - 0.03 * hs;
    const kx = sign * (m.hipX * 0.94);
    const ky = hy - m.thighLen;
    const ax = sign * (m.hipX * 0.90);
    const ay = ky - m.shinLen;

    const rows = isWarrior
      ? [
          /* Высокий сапог: голенище от-под колена, заведомо шире штанины внутри */
          [458, lerp(kx, ax, 0.24), lerp(ky, ay, 0.24), -0.008, 0.063 * footSX, 0.066 * footSZ, bShin, 0.90, bThigh, 0.10],
          [466, lerp(kx, ax, 0.55), lerp(ky, ay, 0.55), -0.008, 0.057 * footSX, 0.061 * footSZ, bShin, 1.0, 0, 0],
          [476, ax, ay + 0.030 * hs, -0.002, 0.049 * footSX, 0.053 * footSZ, bShin, 0.50, bFoot, 0.50],
          [488, ax, 0.052 * hs, 0.018, 0.051 * footSX, 0.078 * footSZ, bFoot, 1.0, 0, 0],
          [500, ax, 0.026 * hs, 0.044, 0.054 * footSX, 0.110 * footSZ, bFoot, 1.0, 0, 0],
          [508, ax, 0.006 * hs, 0.044, 0.052 * footSX, 0.108 * footSZ, bFoot, 1.0, 0, 0]
        ]
      : [
          /* Низкие кожаные башмаки */
          [462, ax, ay + 0.052 * hs, 0.000, 0.048 * footSX, 0.052 * footSZ, bShin, 0.50, bFoot, 0.50],
          [474, ax, ay + 0.026 * hs, 0.004, 0.049 * footSX, 0.053 * footSZ, bShin, 0.25, bFoot, 0.75],
          [488, ax, 0.050 * hs, 0.018, 0.050 * footSX, 0.076 * footSZ, bFoot, 1.0, 0, 0],
          [500, ax, 0.024 * hs, 0.044, 0.053 * footSX, 0.108 * footSZ, bFoot, 1.0, 0, 0],
          [508, ax, 0.005 * hs, 0.044, 0.051 * footSX, 0.106 * footSZ, bFoot, 1.0, 0, 0]
        ];

    const segsFoot = 12;
    const rings = [];
    for (let i = 0; i < rows.length; i++) {
      const [cyTex, cx, cy3d, cz, rx, rz, b0, w0, b1, w1] = rows[i];
      const vTex = cyToV(cyTex);
      const ring = [];
      for (let s = 0; s <= segsFoot; s++) {
        const uFrac = s / segsFoot;
        const phi = (uFrac - 0.5) * Math.PI * 2;
        const cosP = Math.cos(phi);
        /* Носок обуви вытянут вперёд, пятка короче */
        const isFootRow = cy3d < 0.09;
        const zStretch = isFootRow ? (cosP >= 0 ? rz * 1.12 : rz * 0.68) : rz;
        const vz = cz + cosP * zStretch;
        /* Передок обуви переходит на кость носка — башмак перекатывается вместе со стопой */
        let vb0 = b0, vw0 = w0, vb1 = b1, vw1 = w1;
        if (isFootRow && b0 === bFoot) {
          const toeW = Math.max(0, Math.min(1, (vz - 0.052) / 0.055));
          if (toeW > 0.01) { vb0 = bFoot; vw0 = 1 - toeW; vb1 = bToe; vw1 = toeW; }
        }
        ring.push(mb.addVertex(cx + Math.sin(phi) * rx, cy3d, vz, uFrac, vTex, vb0, vw0, vb1, vw1));
      }
      mb.seamPairs.push([ring[0], ring[segsFoot]]);
      rings.push(ring);
    }
    mb.connectRings(rings, false);
    const soleCenter = mb.addVertex(ax, 0.002, 0.042, 0.5, cyToV(510), bFoot, 1, 0, 0);
    mb.capRing(rings[rings.length - 1], soleCenter, false);
  }

  buildFootwear(true);
  buildFootwear(false);

  return mb.toGeometry();
}

/* ---------- 3. СКУЛЬПТУРА ГОЛОВЫ (живые лица двух народов) ---------- */
export function buildSculptedHeadGeometry(female = false, hasBeard = false, kingdom = "north") {
  const isEden = normalizeKingdomKey(kingdom) === "eden";
  const mb = new MeshBuilder(false);
  // Более частая сетка нужна самой поверхности лица, а не накладным примитивам.
  const segsU = 64;
  const segsV = 40;

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

      /* Деликатные виски и скулы (у женщин мягче — без осунувшихся впадин) */
      const templeFlatten = Math.pow(Math.abs(sinP), 2.2) * Math.exp(-Math.pow((vFrac - 0.56) / 0.25, 2));
      rx *= (1 - (female ? 0.06 : 0.09) * templeFlatten);

      /* ПОРОДА: у златодворцев высокие точёные скулы с лёгкой подскуловой тенью,
         у северян кость шире и грубее без аристократической лепки */
      const cheekBone = Math.exp(-Math.pow((Math.abs(phi) - 0.65) / 0.28, 2)) * Math.exp(-Math.pow((vFrac - 0.46) / 0.07, 2));
      const cheekHollow = Math.exp(-Math.pow((Math.abs(phi) - 0.68) / 0.30, 2)) * Math.exp(-Math.pow((vFrac - 0.33) / 0.08, 2));
      rx += cheekBone * (female ? 0.003 : (isEden ? 0.006 : 0.004)) - cheekHollow * (female ? 0.002 : (isEden ? 0.005 : 0.003));

      /* Челюсть: у северян тяжёлая и широкая, у златодворцев узкая аристократическая */
      if (vFrac < 0.48) {
        const jawT = Math.max(0, (0.48 - vFrac) / 0.48);
        rx *= lerp(1.0, female ? 0.88 : (isEden ? 0.95 : 1.02), jawT * 0.62);
        const jawAngle = Math.exp(-(((vFrac - 0.27) / 0.115) ** 2));
        rx *= 1 + (female ? 0.06 : 0.10) * jawAngle;

        if (cosP > 0) {
          const chinMask = Math.exp(-Math.pow(phi / (female ? 0.40 : 0.58), 2)) * Math.exp(-Math.pow((vFrac - 0.17) / 0.12, 2));
          const beardBulk = (!female && hasBeard) ? 0.032 : (female ? 0.010 : 0.014);
          rz += chinMask * beardBulk;
          if (!female && hasBeard && vFrac < 0.25) {
            y -= chinMask * 0.012;
          }
        } else {
          rz *= lerp(1.0, 0.76, jawT);
        }
      }

      /* Надбровный рельеф: у северян ТЯЖЁЛАЯ нависающая дуга, у златодворцев лёгкая */
      if (cosP > 0.2 && vFrac > 0.50 && vFrac < 0.78) {
        const browRidge = Math.exp(-Math.pow(phi / 0.86, 2)) * Math.exp(-Math.pow((vFrac - 0.555) / 0.046, 2));
        rz += browRidge * (female ? 0.004 : (isEden ? 0.006 : 0.013));
      }

      let x = sinP * rx;
      let z = cosP * rz;

      // У лица есть нижняя челюсть и подбородок, а не сферический срез под носом.
      // Поддерживаем профиль широкой плавной формой в самой поверхности головы.
      if (cosP > 0) {
        const lowerFace = Math.exp(-((phi / 0.80) ** 2)) * Math.exp(-(((vFrac - 0.245) / 0.14) ** 2));
        z += lowerFace * (hasBeard ? 0.010 : (female ? 0.016 : 0.018));
        const jawSide = Math.exp(-(((Math.abs(phi) - 0.75) / 0.30) ** 2)) * Math.exp(-(((vFrac - 0.27) / 0.12) ** 2));
        x += Math.sign(sinP) * jawSide * (female ? 0.002 : 0.004);
      }

      // Скулы и поверхность вокруг рта лепятся на той же сетке, что и кожа.
      if (cosP > 0.1) {
        const cheek = Math.exp(-(((Math.abs(phi) - 0.64) / 0.28) ** 2)) * Math.exp(-(((vFrac - 0.435) / 0.085) ** 2));
        z += cheek * (female ? 0.004 : 0.006);
        if (!hasBeard) {
          const muzzle = Math.exp(-((phi / 0.36) ** 2)) * Math.exp(-(((vFrac - 0.34) / 0.07) ** 2));
          const lips = Math.exp(-((phi / 0.25) ** 2)) * Math.exp(-(((vFrac - 0.325) / 0.025) ** 2));
          z += muzzle * 0.005 + lips * (female ? 0.003 : 0.002);
        }
      }

      /* Плавные глазницы */
      if (cosP > 0.42) {
        const eyeDist = Math.min(Math.abs(phi - 0.44), Math.abs(phi + 0.44));
        const socket = Math.exp(-Math.pow(eyeDist / 0.22, 2)) * Math.exp(-Math.pow((vFrac - 0.495) / 0.048, 2));
        z -= socket * (female ? 0.004 : 0.006);
        const eyelid = Math.exp(-Math.pow(eyeDist / 0.19, 2)) * Math.exp(-Math.pow((vFrac - 0.52) / 0.024, 2));
        z += eyelid * (female ? 0.003 : 0.004);
      }

      /* Переносица, кончик и крылья носа — непрерывное изменение поверхности лица. */
      if (cosP > 0.5) {
        const noseWidth = female ? 0.14 : (isEden ? 0.145 : 0.16);
        const bridge = Math.exp(-((phi / noseWidth) ** 2)) * Math.exp(-(((vFrac - 0.47) / 0.085) ** 2));
        const tip = Math.exp(-((phi / (noseWidth * 0.82)) ** 2)) * Math.exp(-(((vFrac - 0.405) / 0.034) ** 2));
        const wings = Math.exp(-(((Math.abs(phi) - noseWidth * 0.85) / (noseWidth * 0.42)) ** 2)) * Math.exp(-(((vFrac - 0.405) / 0.025) ** 2));
        z += bridge * (female ? 0.012 : 0.015) + tip * (female ? 0.008 : 0.010) + wings * 0.003;
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

  // Небольшие прилегающие ушные раковины: вытянутый силуэт, мягкая мочка,
  // без отверстия. Кольца вшиты в геометрию головы и используют участок кожи.
  for (const side of [-1, 1]) {
    const earRings = [];
    const baseX = rxBase * 0.94;
    const scale = female ? 0.92 : 1;
    const count = 16;
    for (const radial of [0.34, 0.68, 1]) {
      const earRing = [];
      for (let j = 0; j <= count; j++) {
        const a = 2 * Math.PI * j / count;
        const c = Math.cos(a), sin = Math.sin(a);
        const height = 0.027 * scale * radial * c;
        const width = 0.014 * scale * radial * sin * (c < 0 ? 0.72 : 1);
        const y = centerY + height;
        const z = 0.012 + width + height * 0.12;
        const x = side * (baseX + 0.006 + 0.012 * (1 - radial * radial));
        earRing.push(mb.addVertex(x, y, z, 0.31, 0.48));
      }
      mb.seamPairs.push([earRing[0], earRing[count]]);
      earRings.push(earRing);
    }
    const center = mb.addVertex(side * (baseX + 0.018), centerY, 0.012, 0.31, 0.48);
    mb.capRing(earRings[0], center, side > 0);
    mb.connectRings(earRings, side < 0);
  }

  return mb.toGeometry();
}

/* ---------- 4. ПРИЧЁСКИ И ГОЛОВНЫЕ УБОРЫ ДВУХ НАРОДОВ ----------
   У златодворцев свои причёски: ухоженные русые волосы с открытым лбом у мужчин,
   высокая причёска с венцом у женщин. Северяне — плотные тёмно-русые шапки волос. */
export function buildHairGeometry(female = false, styleKey = "classic", kingdom = "north") {
  const isEden = normalizeKingdomKey(kingdom) === "eden";
  const wMul = isEden ? 0.96 : 1.02;
  const mb = new MeshBuilder(false);
  const segsU = 36;

  function buildSolidCap(apexY, apexZ, profileRows, sideSweep = 0) {
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
        /* sideSweep: диагональная чёлка причёсанных на косой пробор волос */
        // Незначительный плавный рельеф пробора и линии роста, без острых зубцов.
        const hairlineWave = styleKey !== "headwear" && r >= profileRows.length - 3
          ? 0.003 * Math.cos(phi * 3 + (female ? 0.3 : 0.8)) * faceArch : 0;
        let y = baseY + faceArch * (frontLiftY + sinP * sideSweep) + hairlineWave;
        // В короткой причёске приподнимаем край у виска, открывая ухо;
        // длинные волосы и головные уборы могут его закрывать.
        if (styleKey !== "long" && styleKey !== "headwear") {
          const temple = Math.exp(-(((Math.abs(phi) - Math.PI / 2) / 0.33) ** 2));
          const earTop = (female ? 0.092 : 0.096) + 0.025;
          y += Math.max(0, earTop - y) * temple;
        }
        const rz = cosP >= 0 ? rzF : rzB;
        const locks = styleKey === "headwear" ? 0 : 0.0022 * Math.cos(phi * 5 + r * 0.32) * Math.sin(Math.PI * r / (profileRows.length - 1));
        ring.push(mb.addVertex(sinP * (rx + locks) * wMul, y, zShift + cosP * (rz + locks), uFrac, vTex));
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
        /* Златодвор: высокий парчовый чепец-венец со светлой вуалью */
        buildSolidCap(0.258, -0.016, [
          [0.95, 0.246, 0.000, 0.068, 0.072, 0.078, -0.012],
          [0.72, 0.205, 0.002, 0.092, 0.102, 0.110, -0.008],
          [0.42, 0.148, 0.016, 0.094, 0.098, 0.114, -0.008],
          [0.24, 0.062, 0.098, 0.096, 0.082, 0.122, -0.018],
          [0.06, -0.028, 0.184, 0.090, 0.066, 0.118, -0.026],
          [0.01, -0.020, 0.178, 0.062, 0.050, 0.084, -0.022]
        ]);
      } else {
        /* Златодвор: бордовый бархатный берет с золотым кантом */
        buildSolidCap(0.244, -0.004, [
          [0.95, 0.236, 0.000, 0.082, 0.086, 0.090, -0.004],
          [0.68, 0.208, 0.002, 0.116, 0.118, 0.122, -0.004],
          [0.36, 0.166, 0.006, 0.098, 0.108, 0.112, -0.005],
          [0.12, 0.132, 0.020, 0.094, 0.106, 0.110, -0.006],
          [0.02, 0.138, 0.018, 0.074, 0.086, 0.090, -0.006]
        ]);
      }
    } else {
      if (female) {
        /* Север: тёплый льняной плат-убрус */
        buildSolidCap(0.220, -0.006, [
          [0.92, 0.210, 0.002, 0.044, 0.050, 0.054, -0.005],
          [0.76, 0.184, 0.006, 0.086, 0.100, 0.108, -0.005],
          [0.54, 0.128, 0.032, 0.092, 0.096, 0.114, -0.008],
          [0.30, 0.048, 0.108, 0.096, 0.084, 0.118, -0.014],
          [0.08, -0.022, 0.172, 0.092, 0.070, 0.112, -0.020],
          [0.02, -0.016, 0.168, 0.064, 0.054, 0.082, -0.018]
        ]);
      } else {
        /* Север: суконная шапка с меховой опушкой */
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
        [0.56, 0.136, isEden ? 0.044 : 0.030, 0.094, 0.098, 0.116, -0.010],
        [0.30, 0.070, isEden ? 0.106 : 0.092, 0.092, 0.076, 0.116, -0.018],
        [0.10, 0.022, isEden ? 0.150 : 0.138, 0.080, 0.062, 0.102, -0.022],
        [0.02, 0.032, isEden ? 0.142 : 0.130, 0.058, 0.050, 0.074, -0.018]
      ]);
    }
    return mb.toGeometry();
  }

  /* "classic" */
  if (female) {
    buildSolidCap(0.215, -0.005, [
      [0.94, 0.206, 0.002, 0.042, 0.048, 0.052, -0.004],
      [0.78, 0.180, 0.005, 0.084, 0.098, 0.106, -0.005],
      [0.54, 0.126, isEden ? 0.040 : 0.032, 0.088, 0.094, 0.110, -0.008],
      [0.26, 0.066, isEden ? 0.096 : 0.088, 0.084, 0.074, 0.106, -0.014],
      [0.06, 0.042, isEden ? 0.118 : 0.110, 0.066, 0.058, 0.086, -0.014],
      [0.02, 0.050, isEden ? 0.112 : 0.104, 0.050, 0.046, 0.064, -0.012]
    ]);
    /* У северянки низкий рабочий пучок, у златодворки — высокая благородная причёска */
    addBackBun(isEden ? 0.120 : 0.084, -0.110, 0.046, 0.045, 0.040);
  } else if (isEden) {
    /* Златодворец: КОРОТКАЯ аккуратная придворная стрижка с косым пробором —
       открытый лоб, диагональная чёлка набок, подбритый короткий затылок
       (никакого «пажеского горшка»!) */
    buildSolidCap(0.224, -0.006, [
      [0.94, 0.214, 0.002, 0.043, 0.049, 0.052, -0.004],
      [0.76, 0.190, 0.004, 0.085, 0.096, 0.102, -0.005],
      [0.50, 0.151, 0.040, 0.088, 0.091, 0.105, -0.009],
      [0.22, 0.112, 0.080, 0.083, 0.075, 0.099, -0.012],
      [0.06, 0.090, 0.100, 0.070, 0.059, 0.082, -0.014],
      [0.01, 0.096, 0.095, 0.054, 0.046, 0.063, -0.012]
    ], 0.008);
  } else {
    /* Северянин: грубая лохматая копна до ушей с тяжёлым длинным затылком —
       совсем другой силуэт, чем ухоженный зачёс Златодвора */
    buildSolidCap(0.226, -0.004, [
      [0.94, 0.216, 0.002, 0.045, 0.051, 0.055, -0.004],
      [0.76, 0.188, 0.004, 0.092, 0.106, 0.112, -0.005],
      [0.50, 0.130, 0.020, 0.097, 0.100, 0.116, -0.009],
      [0.24, 0.058, 0.064, 0.094, 0.082, 0.112, -0.016],
      [0.06, 0.012, 0.086, 0.080, 0.064, 0.100, -0.020],
      [0.01, 0.022, 0.080, 0.058, 0.050, 0.072, -0.016]
    ]);
  }

  return mb.toGeometry();
}

/* ---------- 5. СБОРКА ГОТОВОГО ПЕРСОНАЖА (СЕВЕРЯНИН / ЗЛАТОДВОРЕЦ) ---------- */
export function createBowCharacter3D(opts = {}) {
  const female = !!opts.female;
  const kingdom = normalizeKingdomKey(opts.kingdom);
  const isEden = kingdom === "eden";
  const outfit = normalizeOutfitKey(opts.outfit);
  const hairStyle = opts.hairStyle || "classic";
  const hairColor = opts.hairColor || null; // null -> канонный цвет народа из палитры
  /* Северяне с густой бородой, мужчины Златодвора гладко выбриты */
  const hasBeard = !female && (opts.beard !== undefined ? !!opts.beard : !isEden);

  const group = new THREE.Group();
  group.name = `${isEden ? "Eden" : "North"}${female ? "Female" : "Male"}`;

  const { bones, skeleton, metrics } = createHumanoidSkeleton(female, kingdom);
  group.add(bones[BONE_IDX.ROOT]);

  const bodyCv = buildBaseBodyTextureCanvas({ female, outfit, kingdom }, opts.canvasFactory);
  const headCv = buildHeadTextureCanvas({ female, hairColor, beard: hasBeard, kingdom }, opts.canvasFactory);
  const hairCv = buildHairTextureCanvas(hairColor, hairStyle, female, kingdom, opts.canvasFactory);

  const bodyTex = canvasToThreeTexture(bodyCv);
  const headTex = canvasToThreeTexture(headCv);
  const hairTex = canvasToThreeTexture(hairCv);

  const bodyMat = new THREE.MeshLambertMaterial({ map: bodyTex });
  const headMat = new THREE.MeshLambertMaterial({ map: headTex });
  const hairMat = new THREE.MeshLambertMaterial({ map: hairTex });

  /* Базовое тело НЕ зависит от одежды — строится один раз и больше никогда не перепривязывается! */
  const bodyGeo = buildBaseBodyGeometry(female, metrics);
  // Упрощённые кулаки — второй вариант тех же кистей для боевой позы.
  // Остальная сетка, индексы, веса и исходная поза не меняются.
  const fistGeo = bodyGeo.clone();
  const fistPositions = fistGeo.attributes.position;
  const wristY = metrics.shoulderY - metrics.upperArmLen - metrics.forearmLen;
  for (const [range, hand] of [[bodyGeo.userData.limbRanges.armL, BONE_IDX.HAND_L], [bodyGeo.userData.limbRanges.armR, BONE_IDX.HAND_R]]) {
    const skinIndex = fistGeo.attributes.skinIndex, skinWeight = fistGeo.attributes.skinWeight;
    for (let i = range[0]; i < range[1]; i++) {
      let handWeight = 0;
      for (let j = 0; j < 4; j++) if (skinIndex.getComponent(i, j) === hand) handWeight += skinWeight.getComponent(i, j);
      const y = fistPositions.getY(i);
      if (y >= wristY - 0.01 || handWeight < 0.9) continue;
      const depth = Math.max(0, wristY - y);
      fistPositions.setY(i, wristY - depth * 0.60);
      fistPositions.setZ(i, fistPositions.getZ(i) + Math.min(1, depth / 0.07) * 0.012);
    }
  }
  fistPositions.needsUpdate = true;
  fistGeo.computeVertexNormals();
  const bodyMesh = new THREE.SkinnedMesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.frustumCulled = false;
  bodyMesh.bind(skeleton, IDENTITY_BIND); // строго эталонная rest-поза
  group.add(bodyMesh);

  const headGeo = buildSculptedHeadGeometry(female, hasBeard, kingdom);
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  bones[BONE_IDX.HEAD].add(headMesh);

  const hairGeo = buildHairGeometry(female, hairStyle, kingdom);
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
    bodyGeo,
    fistGeo,
    headMesh,
    hairMesh,
    contactShadow,
    limbRanges: bodyGeo.userData.limbRanges, // задел под механику отсечения конечностей
    garmentMesh: null,
    textures: { bodyCv, headCv, hairCv, bodyTex, headTex, hairTex },

    /* Смена одежды = только пересоздание ОТДЕЛЬНОГО слоя одежды.
       Привязка через явную единичную bindMatrix к сохранённым rest-инверсиям скелета:
       никакие текущие углы анимации больше не «запекаются» в привязку (руки не выворачивает!). */
    setOutfit(nextRawOutfit, canvasFactory = null) {
      const nextOutfit = normalizeOutfitKey(nextRawOutfit);
      if (rig.outfit === nextOutfit) return;
      rig.outfit = nextOutfit;

      if (rig.garmentMesh) {
        group.remove(rig.garmentMesh);
        rig.garmentMesh.geometry.dispose();
        if (rig.garmentMesh.material.map) rig.garmentMesh.material.map.dispose();
        rig.garmentMesh.material.dispose();
        rig.garmentMesh = null;
      }

      if (nextOutfit !== "underwear") {
        const garmCv = buildGarmentTextureCanvas({ female, outfit: nextOutfit, kingdom }, canvasFactory);
        const garmTex = canvasToThreeTexture(garmCv);
        const garmMat = new THREE.MeshLambertMaterial({
          map: garmTex,
          side: THREE.DoubleSide,
          /* Одежда всегда выигрывает глубину у тела — ноль мерцающих «прорех» */
          polygonOffset: true,
          polygonOffsetFactor: -1.0,
          polygonOffsetUnits: -1.0
        });
        const garmGeo = buildGarmentGeometry(female, nextOutfit, kingdom, metrics);
        const garmMesh = new THREE.SkinnedMesh(garmGeo, garmMat);
        garmMesh.castShadow = true;
        garmMesh.receiveShadow = true;
        garmMesh.frustumCulled = false;
        garmMesh.bind(skeleton, IDENTITY_BIND); // rest-инверсии не пересчитываются!
        group.add(garmMesh);
        rig.garmentMesh = garmMesh;
      }
    },

    setHairStyle(nextStyle, canvasFactory = null) {
      if (rig.hairStyle === nextStyle) return;
      rig.hairStyle = nextStyle;
      const nextHairCv = buildHairTextureCanvas(hairColor, nextStyle, female, kingdom, canvasFactory);
      const nextHairTex = canvasToThreeTexture(nextHairCv);
      hairMat.map.dispose();
      hairMat.map = nextHairTex;
      hairMat.needsUpdate = true;

      const nextHairGeo = buildHairGeometry(female, nextStyle, kingdom);
      hairMesh.geometry.dispose();
      hairMesh.geometry = nextHairGeo;
    }
  };

  /* Первичная одежда тем же честным путём, что и любая последующая смена */
  if (outfit !== "underwear") {
    const initialOutfit = outfit;
    rig.outfit = "underwear";
    rig.setOutfit(initialOutfit, opts.canvasFactory);
  }

  poseBowCharacter(rig, "idle", 0);
  return rig;
}

/* ---------- 6. ЗАЗЕМЛЁННАЯ БИОМЕХАНИКА ПОХОДКИ И СТОЕК ----------
   - Высота таза каждый кадр считается из угла опорной ноги: подошва стоит
     СТРОГО на земле (никакой «лунной» походки в 2-3 см над тенью).
   - Подошва опорной ноги держится параллельно полу всю фазу опоры.
   - Спокойный темп без виляния бёдрами («ча-ча-ча» убран).
   - Стопы развёрнуты наружу с естественной левой/правой асимметрией
     (больше никаких «двух правых стоп»). */
export function poseBowCharacter(rig, mode = "idle", timeSec = 0, opts = {}) {
  // В бою кисти собраны, в остальных режимах возвращается открытая форма.
  if (rig.bodyGeo && rig.fistGeo) rig.bodyMesh.geometry = mode === "combat" ? rig.fistGeo : rig.bodyGeo;
  const b = rig.bones;
  const m = rig.metrics;
  const fem = rig.female;
  const lookYaw = opts.lookYaw || 0;

  for (let i = 0; i < b.length; i++) {
    b[i].rotation.set(0, 0, 0);
  }
  b[BONE_IDX.PELVIS].position.y = m.hipY;

  if (mode === "walk") {
    const w = timeSec * 3.9; // спокойный уверенный шаг (~74 шага/мин)
    const s = Math.sin(w);
    const c = Math.cos(w);
    const A = fem ? 0.25 : 0.29; // амплитуда бедра

    /* Живой цикл шага: опора занимает ~62% цикла, перенос — короткий и быстрый.
       Нога отрывается от пола только когда вторая уже плотно приняла вес! */
    const swingPhase = (cv) => {
      const t = Math.max(0, (cv - 0.25) / 0.75);
      return t * t * (3 - 2 * t); // smoothstep
    };
    const swingL = swingPhase(c);  // левая нога в фазе переноса
    const swingR = swingPhase(-c); // правая нога в фазе переноса

    /* ЗАЗЕМЛЕНИЕ: таз опускается ровно настолько, насколько «укоротилась» по вертикали
       отведённая опорная нога — подошва прижата к полу всем весом, а не висит над ним! */
    const Lleg = m.thighLen + m.shinLen;
    const drop = Lleg * (1 - Math.cos(A * Math.abs(s))) * 0.92;
    b[BONE_IDX.PELVIS].position.y = m.hipY - 0.008 - drop;

    /* Спокойный корпус: лёгкий встречный разворот без танцевального виляния */
    b[BONE_IDX.PELVIS].rotation.y = -s * (fem ? 0.040 : 0.030);
    b[BONE_IDX.PELVIS].rotation.z = s * (fem ? 0.012 : 0.008);
    b[BONE_IDX.SPINE].rotation.y = s * 0.020;
    b[BONE_IDX.CHEST].rotation.y = s * 0.035;
    b[BONE_IDX.CHEST].rotation.x = 0.025;
    b[BONE_IDX.HEAD].rotation.y = -s * 0.020;
    b[BONE_IDX.HEAD].rotation.x = -0.015;

    /* Спокойная отмашка рук в противофазе ногам */
    b[BONE_IDX.UPPER_ARM_L].rotation.z = fem ? 0.08 : 0.10;
    b[BONE_IDX.UPPER_ARM_R].rotation.z = fem ? -0.08 : -0.10;
    b[BONE_IDX.UPPER_ARM_L].rotation.x = s * 0.24;
    b[BONE_IDX.UPPER_ARM_R].rotation.x = -s * 0.24;
    b[BONE_IDX.FOREARM_L].rotation.x = -0.16 - Math.max(0, -s) * 0.18;
    b[BONE_IDX.FOREARM_R].rotation.x = -0.16 - Math.max(0, s) * 0.18;

    /* Ноги: колено сгибается только на переносе, опорная нога прямая и держит вес */
    b[BONE_IDX.THIGH_L].rotation.x = -s * A + swingL * 0.10;
    b[BONE_IDX.THIGH_R].rotation.x =  s * A + swingR * 0.10;
    b[BONE_IDX.SHIN_L].rotation.x = swingL * 0.55 + 0.03;
    b[BONE_IDX.SHIN_R].rotation.x = swingR * 0.55 + 0.03;

    /* Стопы: на опоре подошва лежит ПЛАШМЯ на полу (компенсация углов бедра и колена),
       в конце опоры пятка отрывается ТОЛЧКОМ носка, на переносе носок взят на себя. */
    const stanceL = 1 - swingL;
    const stanceR = 1 - swingR;
    const pushL = Math.pow(Math.max(0, -s), 2) * 0.28; // левая нога позади -> толчок
    const pushR = Math.pow(Math.max(0,  s), 2) * 0.28; // правая нога позади -> толчок
    b[BONE_IDX.FOOT_L].rotation.x =
      (-(b[BONE_IDX.THIGH_L].rotation.x + b[BONE_IDX.SHIN_L].rotation.x) + pushL) * stanceL - swingL * 0.10;
    b[BONE_IDX.FOOT_R].rotation.x =
      (-(b[BONE_IDX.THIGH_R].rotation.x + b[BONE_IDX.SHIN_R].rotation.x) + pushR) * stanceR - swingR * 0.10;

    /* ПЕРЕКАТ ПЯТКА -> ПАЛЬЦЫ: на опоре пальцы прижаты к полу даже когда пятка
       уже оторвалась толчком (носок гнётся в суставе плюсны), на переносе — лёгкий провис */
    b[BONE_IDX.TOE_L].rotation.x =
      -(b[BONE_IDX.THIGH_L].rotation.x + b[BONE_IDX.SHIN_L].rotation.x + b[BONE_IDX.FOOT_L].rotation.x) * stanceL +
      swingL * 0.06;
    b[BONE_IDX.TOE_R].rotation.x =
      -(b[BONE_IDX.THIGH_R].rotation.x + b[BONE_IDX.SHIN_R].rotation.x + b[BONE_IDX.FOOT_R].rotation.x) * stanceR +
      swingR * 0.06;
  } else if (mode === "ride") {
    /* ПОСАДКА В СЕДЛЕ: бёдра подняты вперёд и разведены, колени согнуты,
       стопы в стременах пятками вниз, корпус держит мягкий такт хода лошади */
    const sway = Math.sin(timeSec * 1.9);
    const bob = Math.sin(timeSec * 3.8);
    b[BONE_IDX.PELVIS].position.y = m.hipY - 0.012 + bob * 0.006;
    b[BONE_IDX.PELVIS].rotation.x = -0.10;
    b[BONE_IDX.SPINE].rotation.x = 0.08 + bob * 0.012;
    b[BONE_IDX.CHEST].rotation.x = 0.07;
    b[BONE_IDX.CHEST].rotation.y = sway * 0.015;
    b[BONE_IDX.HEAD].rotation.x = -0.10;
    b[BONE_IDX.HEAD].rotation.y = sway * 0.03;

    b[BONE_IDX.THIGH_L].rotation.set(-1.08, 0.10, 0.46);
    b[BONE_IDX.THIGH_R].rotation.set(-1.08, -0.10, -0.46);
    b[BONE_IDX.SHIN_L].rotation.x = 1.30;
    b[BONE_IDX.SHIN_R].rotation.x = 1.30;
    b[BONE_IDX.FOOT_L].rotation.x = -(b[BONE_IDX.THIGH_L].rotation.x + b[BONE_IDX.SHIN_L].rotation.x) - 0.14;
    b[BONE_IDX.FOOT_R].rotation.x = -(b[BONE_IDX.THIGH_R].rotation.x + b[BONE_IDX.SHIN_R].rotation.x) - 0.14;

    /* Обе руки направлены к поводьям. */
    b[BONE_IDX.UPPER_ARM_L].rotation.set(-0.40, -0.20, 0.14);
    b[BONE_IDX.FOREARM_L].rotation.x = -0.80;
    // Нет оружия в руке: обе руки остаются у поводьев и в боевом режиме.
    b[BONE_IDX.UPPER_ARM_R].rotation.set(-0.40, 0.20, -0.14);
    b[BONE_IDX.FOREARM_R].rotation.x = -0.80;
  } else if (mode === "combat") {
    const br = Math.sin(timeSec * 2.6);
    b[BONE_IDX.PELVIS].position.y = m.hipY - 0.03 + br * 0.005;
    b[BONE_IDX.PELVIS].rotation.y = -0.24;
    b[BONE_IDX.CHEST].rotation.y = -0.12;
    b[BONE_IDX.CHEST].rotation.x = 0.10;
    b[BONE_IDX.HEAD].rotation.y = 0.32;
    b[BONE_IDX.HEAD].rotation.x = -0.05;

    b[BONE_IDX.UPPER_ARM_L].rotation.set(-0.22, -0.10, 0.16);
    b[BONE_IDX.FOREARM_L].rotation.x = -0.45 + br * 0.025;
    b[BONE_IDX.UPPER_ARM_R].rotation.set(-0.15, 0.10, -0.16);
    b[BONE_IDX.FOREARM_R].rotation.x = -0.38 - br * 0.025;

    b[BONE_IDX.THIGH_L].rotation.set(-0.18, 0.04, 0.02);
    b[BONE_IDX.SHIN_L].rotation.x = 0.26;
    b[BONE_IDX.FOOT_L].rotation.x = -0.08;
    b[BONE_IDX.THIGH_R].rotation.set(0.15, -0.04, -0.02);
    b[BONE_IDX.SHIN_R].rotation.x = 0.18;
    b[BONE_IDX.FOOT_R].rotation.x = -0.31; // подошва задней ноги прижата к земле
    /* Пальцы обеих ног плотно прижаты к полу */
    b[BONE_IDX.TOE_L].rotation.x = -(b[BONE_IDX.THIGH_L].rotation.x + b[BONE_IDX.SHIN_L].rotation.x + b[BONE_IDX.FOOT_L].rotation.x);
    b[BONE_IDX.TOE_R].rotation.x = -(b[BONE_IDX.THIGH_R].rotation.x + b[BONE_IDX.SHIN_R].rotation.x + b[BONE_IDX.FOOT_R].rotation.x);
  } else {
    /* idle: спокойная живая стойка, обе подошвы плашмя на полу */
    const breath = Math.sin(timeSec * 1.7);
    b[BONE_IDX.PELVIS].position.y = m.hipY - 0.004;
    b[BONE_IDX.PELVIS].rotation.z = fem ? 0.018 : -0.008;
    b[BONE_IDX.PELVIS].rotation.y = fem ? 0.04 : -0.03;
    b[BONE_IDX.SPINE].rotation.z = fem ? -0.012 : 0.006;
    b[BONE_IDX.CHEST].rotation.x = breath * 0.014;
    b[BONE_IDX.HEAD].rotation.y = (fem ? -0.05 : 0.04) + Math.sin(timeSec * 0.65) * 0.045;

    b[BONE_IDX.UPPER_ARM_L].rotation.z = fem ? 0.09 : 0.11;
    b[BONE_IDX.UPPER_ARM_R].rotation.z = fem ? -0.09 : -0.11;
    b[BONE_IDX.UPPER_ARM_L].rotation.x = 0.03 + breath * 0.012;
    b[BONE_IDX.UPPER_ARM_R].rotation.x = -0.01 - breath * 0.012;
    b[BONE_IDX.FOREARM_L].rotation.x = -0.14;
    b[BONE_IDX.FOREARM_R].rotation.x = -0.16;

    b[BONE_IDX.THIGH_L].rotation.x = fem ? -0.015 : 0.008;
    b[BONE_IDX.SHIN_L].rotation.x = fem ? 0.030 : 0.012;
    /* Подошвы строго параллельны полу */
    b[BONE_IDX.FOOT_L].rotation.x = -(b[BONE_IDX.THIGH_L].rotation.x + b[BONE_IDX.SHIN_L].rotation.x);
    b[BONE_IDX.FOOT_R].rotation.x = 0;
  }

  /* Едва заметный естественный разворот носков наружу. Больше НИКАКИХ сильных yaw:
     при вытянутом носке стопы даже ±0.09 «выметало» носок вбок и стопа казалась скошенной */
  b[BONE_IDX.FOOT_L].rotation.y += 0.022;
  b[BONE_IDX.FOOT_R].rotation.y -= 0.018;

  if (lookYaw) {
    b[BONE_IDX.HEAD].rotation.y += lookYaw;
  }

  b[BONE_IDX.ROOT].updateMatrixWorld(true);
}

export function disposeBowCharacter(rig) {
  if (!rig) return;
  // Активная сетка утилизируется при обходе; вторая не находится в сцене.
  if (rig.bodyGeo && rig.fistGeo) (rig.bodyMesh.geometry === rig.bodyGeo ? rig.fistGeo : rig.bodyGeo).dispose();
  rig.group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mt) => {
        if (mt.map) mt.map.dispose();
        mt.dispose();
      });
    }
  });
}
