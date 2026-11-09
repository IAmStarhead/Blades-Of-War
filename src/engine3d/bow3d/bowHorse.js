/* ============================================================================
   BLADES OF WAR — БОЕВОЙ КОНЬ СЕВЕРА (иерархическая low-poly лошадь)
   Гнедой конь под седлом с попоной в цветах королевства. Не скиннинг —
   честная иерархия пивотов в стиле bowProp.js: корпус → шея → голова,
   4 ноги с коленным суставом, хвост, грива, седло со стременами.
   Якорь седла (saddleAnchor) — точка посадки всадника.
   ============================================================================ */

import * as THREE from "three";
import { create2DCanvas, canvasToThreeTexture, normalizeKingdomKey } from "./bowTextures.js";

/* ---------- Атлас коня 256×256 (4 квадранта) ----------
   coat    — гнедая шерсть (лев. верх)
   mane    — грива/хвост, почти вороные (прав. верх)
   leather — седло, уздечка, копыта (лев. низ)
   cloth   — попона в цвете королевства (прав. низ) */
function buildHorseAtlasCanvas(kingdom = "north", canvasFactory = null) {
  const W = 256;
  const H = 256;
  const cv = create2DCanvas(W, H, canvasFactory);
  const ctx = cv.getContext("2d");
  const isEden = normalizeKingdomKey(kingdom) === "eden";

  /* Шерсть: тёплый гнедой с мягким переливом и редкими яблоками */
  const coatG = ctx.createLinearGradient(0, 0, 0, 128);
  coatG.addColorStop(0, "#6b4529");
  coatG.addColorStop(0.5, "#5d3a22");
  coatG.addColorStop(1, "#4a2d1a");
  ctx.fillStyle = coatG;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "rgba(255, 222, 180, 0.05)";
  for (let i = 0; i < 26; i++) {
    const x = (i * 37) % 118;
    const y = (i * 53) % 118;
    ctx.beginPath();
    ctx.arc(x + 6, y + 6, 5 + (i % 3) * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Грива и хвост: тёмные, почти вороные пряди */
  const maneG = ctx.createLinearGradient(128, 0, 256, 0);
  maneG.addColorStop(0, "#241710");
  maneG.addColorStop(1, "#140c07");
  ctx.fillStyle = maneG;
  ctx.fillRect(128, 0, 128, 128);
  for (let x = 130; x < 256; x += 7) {
    ctx.fillStyle = x % 14 === 0 ? "rgba(120, 86, 56, 0.10)" : "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(x, 0, 3, 128);
  }

  /* Кожа седла и сбруи */
  const leatherG = ctx.createLinearGradient(0, 128, 0, 256);
  leatherG.addColorStop(0, "#74502e");
  leatherG.addColorStop(0.5, "#5e3f24");
  leatherG.addColorStop(1, "#462d18");
  ctx.fillStyle = leatherG;
  ctx.fillRect(0, 128, 128, 128);
  ctx.strokeStyle = "rgba(34, 20, 10, 0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 134, 116, 116);
  ctx.fillStyle = "rgba(240, 214, 160, 0.20)";
  for (let i = 0; i < 7; i++) ctx.fillRect(14 + i * 16, 140, 3, 3);

  /* Попона в геральдике королевства: Север — студёная сине-серая с белой каймой,
     Златодвор — багряная с золотой каймой */
  const clothTop = isEden ? "#7c2733" : "#3a5570";
  const clothBot = isEden ? "#581a24" : "#2a3f55";
  const trim = isEden ? "#d8b256" : "#dde6ee";
  const clothG = ctx.createLinearGradient(128, 128, 128, 256);
  clothG.addColorStop(0, clothTop);
  clothG.addColorStop(1, clothBot);
  ctx.fillStyle = clothG;
  ctx.fillRect(128, 128, 128, 128);
  ctx.fillStyle = trim;
  ctx.fillRect(128, 238, 128, 7);
  ctx.fillRect(128, 128, 128, 5);
  ctx.fillStyle = isEden ? "rgba(216, 178, 86, 0.35)" : "rgba(221, 230, 238, 0.30)";
  for (let x = 140; x < 250; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 196);
    ctx.lineTo(x + 7, 182);
    ctx.lineTo(x + 14, 196);
    ctx.lineTo(x + 7, 210);
    ctx.closePath();
    ctx.fill();
  }

  return cv;
}

function remapUV(geo, quadKey) {
  const ranges = {
    coat:    [0.02, 0.48, 0.52, 0.98],
    mane:    [0.52, 0.98, 0.52, 0.98],
    leather: [0.02, 0.48, 0.02, 0.48],
    cloth:   [0.52, 0.98, 0.02, 0.48]
  };
  const [u0, u1, v0, v1] = ranges[quadKey] || ranges.coat;
  const uv = geo.getAttribute("uv");
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geo;
}

/* ---------- Сборка коня ----------
   Конь смотрит вдоль +Z. Холка ~1.12, крестец ~1.05, длина корпуса ~1.35. */
export function createBowHorse3D(opts = {}) {
  const kingdom = normalizeKingdomKey(opts.kingdom || "north");
  const group = new THREE.Group();
  group.name = "BowWarHorse";

  const atlasTex = canvasToThreeTexture(buildHorseAtlasCanvas(kingdom, opts.canvasFactory));
  atlasTex.wrapS = THREE.ClampToEdgeWrapping;
  atlasTex.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshLambertMaterial({ map: atlasTex });

  const BODY_Y = 0.80;

  function part(geo, quad, parent, x = 0, y = 0, z = 0) {
    remapUV(geo, quad);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /* === Корпус: бочка + грудь + круп === */
  const body = new THREE.Group();
  body.position.y = BODY_Y;
  group.add(body);

  const barrelGeo = new THREE.CylinderGeometry(0.235, 0.255, 0.82, 14, 1);
  barrelGeo.rotateX(Math.PI * 0.5);
  part(barrelGeo, "coat", body, 0, 0, 0.02);

  const chestGeo = new THREE.SphereGeometry(0.235, 12, 10);
  chestGeo.scale(0.92, 1.0, 1.1);
  part(chestGeo, "coat", body, 0, 0.015, 0.44);

  const rumpGeo = new THREE.SphereGeometry(0.25, 12, 10);
  rumpGeo.scale(0.98, 1.02, 1.12);
  part(rumpGeo, "coat", body, 0, 0.02, -0.42);

  /* Холка — плавный подъём к шее */
  const withersGeo = new THREE.SphereGeometry(0.17, 10, 8);
  withersGeo.scale(0.9, 0.85, 1.25);
  part(withersGeo, "coat", body, 0, 0.17, 0.33);

  /* === Шея и голова === */
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 0.16, 0.50);
  body.add(neckPivot);

  const neckGeo = new THREE.CylinderGeometry(0.095, 0.155, 0.50, 10, 1);
  neckGeo.translate(0, 0.23, 0);
  part(neckGeo, "coat", neckPivot, 0, 0, 0);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.47, 0.015);
  neckPivot.add(headPivot);

  const skullGeo = new THREE.BoxGeometry(0.155, 0.17, 0.24);
  part(skullGeo, "coat", headPivot, 0, 0.015, 0.05);
  const muzzleGeo = new THREE.BoxGeometry(0.105, 0.125, 0.17);
  part(muzzleGeo, "coat", headPivot, 0, -0.03, 0.21);
  /* Храп (тёмный нос) и налобный ремень уздечки */
  const noseGeo = new THREE.BoxGeometry(0.108, 0.05, 0.05);
  part(noseGeo, "mane", headPivot, 0, -0.055, 0.275);
  const browbandGeo = new THREE.BoxGeometry(0.16, 0.028, 0.02);
  part(browbandGeo, "leather", headPivot, 0, 0.06, 0.172);
  const cheekStrapGeoL = new THREE.BoxGeometry(0.015, 0.025, 0.2);
  part(cheekStrapGeoL, "leather", headPivot, 0.082, 0.0, 0.1);
  const cheekStrapGeoR = new THREE.BoxGeometry(0.015, 0.025, 0.2);
  part(cheekStrapGeoR, "leather", headPivot, -0.082, 0.0, 0.1);

  /* Уши */
  const earL = part(new THREE.ConeGeometry(0.030, 0.085, 5), "coat", headPivot, 0.052, 0.135, -0.015);
  const earR = part(new THREE.ConeGeometry(0.030, 0.085, 5), "coat", headPivot, -0.052, 0.135, -0.015);
  earL.rotation.z = -0.18;
  earR.rotation.z = 0.18;

  /* Грива: гребень по шее + чёлка */
  const maneGeo = new THREE.BoxGeometry(0.05, 0.52, 0.11);
  maneGeo.translate(0, 0.24, 0);
  const mane = part(maneGeo, "mane", neckPivot, 0, 0.015, -0.115);
  mane.rotation.x = -0.06;
  part(new THREE.BoxGeometry(0.075, 0.05, 0.13), "mane", headPivot, 0, 0.115, 0.045);

  /* === Ноги: пивот (плечо/бедро) → колено → копыто === */
  function buildLeg(x, z, isHind) {
    const hip = new THREE.Group();
    hip.position.set(x, -0.085, z);
    body.add(hip);

    const upperLen = isHind ? 0.30 : 0.285;
    const upperGeo = new THREE.CylinderGeometry(isHind ? 0.055 : 0.050, 0.040, upperLen, 8, 1);
    upperGeo.translate(0, -upperLen * 0.5, 0);
    part(upperGeo, "coat", hip, 0, 0, 0);
    if (isHind) {
      /* Мощная ляжка задней ноги */
      const gaskinGeo = new THREE.SphereGeometry(0.105, 8, 7);
      gaskinGeo.scale(0.7, 1.25, 1.05);
      part(gaskinGeo, "coat", hip, 0, -0.06, -0.01);
    }

    const knee = new THREE.Group();
    knee.position.set(0, -upperLen, 0);
    hip.add(knee);

    const lowerLen = 0.315;
    const lowerGeo = new THREE.CylinderGeometry(0.034, 0.027, lowerLen, 8, 1);
    lowerGeo.translate(0, -lowerLen * 0.5, 0);
    part(lowerGeo, "coat", knee, 0, 0, 0);

    const hoofGeo = new THREE.CylinderGeometry(0.042, 0.047, 0.075, 8, 1);
    part(hoofGeo, "leather", knee, 0, -lowerLen - 0.028, 0.008);

    return { hip, knee };
  }

  const legFL = buildLeg(0.155, 0.40, false);
  const legFR = buildLeg(-0.155, 0.40, false);
  const legHL = buildLeg(0.165, -0.44, true);
  const legHR = buildLeg(-0.165, -0.44, true);

  /* === Хвост === */
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.13, -0.60);
  body.add(tailPivot);
  const tailGeo = new THREE.CylinderGeometry(0.052, 0.020, 0.52, 7, 2);
  tailGeo.translate(0, -0.26, 0);
  const tailMesh = part(tailGeo, "mane", tailPivot, 0, 0, 0);
  tailMesh.rotation.x = -0.38;

  /* === Попона и седло ===
     Попона НИЖЕ и УЖЕ линии бёдер всадника — ноги ложатся поверх ткани */
  const caparisonGeo = new THREE.BoxGeometry(0.50, 0.24, 0.44);
  part(caparisonGeo, "cloth", body, 0, 0.09, 0.03);

  const saddleSeatGeo = new THREE.BoxGeometry(0.24, 0.07, 0.30);
  part(saddleSeatGeo, "leather", body, 0, 0.315, 0.03);
  /* Высокие луки рыцарского седла спереди и сзади */
  part(new THREE.BoxGeometry(0.20, 0.09, 0.05), "leather", body, 0, 0.375, 0.155);
  part(new THREE.BoxGeometry(0.20, 0.08, 0.05), "leather", body, 0, 0.37, -0.095);
  /* Подпруга */
  const girthGeo = new THREE.BoxGeometry(0.60, 0.045, 0.06);
  const girth = part(girthGeo, "leather", body, 0, -0.07, 0.03);
  girth.scale.x = 0.95;

  /* Стремена на путлищах — выведены под стопу всадника в позе "ride" */
  function buildStirrup(sideX) {
    const strapGeo = new THREE.BoxGeometry(0.022, 0.50, 0.035);
    strapGeo.translate(0, -0.25, 0);
    const strap = part(strapGeo, "leather", body, sideX, 0.24, 0.17);
    strap.rotation.x = -0.25; // путлище уходит чуть вперёд, к носку сапога
    const ringGeo = new THREE.TorusGeometry(0.040, 0.011, 6, 10);
    remapUV(ringGeo, "leather");
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.position.set(0, -0.50, 0);
    ring.castShadow = true;
    strap.add(ring);
    return strap;
  }
  buildStirrup(0.295);
  buildStirrup(-0.295);

  /* Якорь посадки всадника (чуть выше седла, по центру сиденья) */
  const saddleAnchor = new THREE.Group();
  saddleAnchor.position.set(0, 0.345, 0.03);
  body.add(saddleAnchor);

  /* Контактная тень */
  const shadowGeo = new THREE.CircleGeometry(0.62, 22);
  shadowGeo.rotateX(-Math.PI * 0.5);
  shadowGeo.scale(0.72, 1, 1.18);
  const contactShadow = new THREE.Mesh(
    shadowGeo,
    new THREE.MeshBasicMaterial({ color: 0x0b0d10, transparent: true, opacity: 0.32, depthWrite: false })
  );
  contactShadow.position.y = 0.002;
  group.add(contactShadow);

  const horse = {
    group,
    kingdom,
    saddleAnchor,
    contactShadow,
    parts: { body, neckPivot, headPivot, earL, earR, tailPivot, legFL, legFR, legHL, legHR },
    baseBodyY: BODY_Y
  };
  animateHorse3D(horse, "idle", 0);
  return horse;
}

/* ---------- Анимация коня ----------
   "walk" — спокойный шаг диагональными парами (FL+HR / FR+HL) с бобом корпуса,
   киванием головы в такт и отмашкой хвоста;
   "idle" — перенос веса с ноги на ногу, отставленная задняя нога,
   поводящие уши и ленивые махи хвоста. */
export function animateHorse3D(horse, mode = "idle", timeSec = 0) {
  if (!horse) return;
  const p = horse.parts;
  const body = p.body;

  if (mode === "walk") {
    const w = timeSec * 4.2;
    const legs = [
      [p.legFL, 0],
      [p.legHR, 0.35],         /* диагональная пара с лёгким 4-тактным сдвигом */
      [p.legFR, Math.PI],
      [p.legHL, Math.PI + 0.35]
    ];
    for (const [leg, ph] of legs) {
      const s = Math.sin(w + ph);
      leg.hip.rotation.x = -s * 0.33;
      /* Колено складывается только на переносе (нога идёт вперёд поднятой) */
      const lift = Math.max(0, Math.sin(w + ph + 1.05));
      leg.knee.rotation.x = lift * lift * 0.52;
    }

    body.position.y = horse.baseBodyY + Math.sin(w * 2) * 0.012;
    body.rotation.z = Math.sin(w) * 0.013;
    body.rotation.x = Math.sin(w * 2 + 0.7) * 0.008;

    p.neckPivot.rotation.x = 0.78 + Math.sin(w * 2 + 1.2) * 0.045;
    p.headPivot.rotation.x = -0.72 + Math.sin(w * 2 + 1.6) * 0.035;
    p.tailPivot.rotation.z = Math.sin(w * 0.9) * 0.16;
    p.tailPivot.rotation.x = 0.06 + Math.sin(w * 2) * 0.03;
    p.earL.rotation.x = Math.sin(w * 1.7) * 0.08;
    p.earR.rotation.x = Math.sin(w * 1.7 + 2.1) * 0.08;
  } else {
    /* idle: конь стоит, перенося вес, отставив заднюю ногу */
    const t = timeSec;
    const shift = Math.sin(t * 0.55);

    body.position.y = horse.baseBodyY - 0.004 + Math.sin(t * 1.1) * 0.0035; /* дыхание */
    body.rotation.z = shift * 0.016;
    body.rotation.x = 0;

    p.legFL.hip.rotation.x = -0.02;
    p.legFR.hip.rotation.x = 0.03;
    p.legFL.knee.rotation.x = 0.03;
    p.legFR.knee.rotation.x = 0.02;
    /* Отдыхающая задняя нога: копыто на зацепе, скакательный сустав расслаблен */
    const restHind = shift > 0 ? p.legHL : p.legHR;
    const standHind = shift > 0 ? p.legHR : p.legHL;
    const ease = Math.min(1, Math.abs(shift) * 1.6);
    restHind.hip.rotation.x = 0.10 * ease;
    restHind.knee.rotation.x = 0.30 * ease;
    standHind.hip.rotation.x = -0.02 * ease;
    standHind.knee.rotation.x = 0.04;

    p.neckPivot.rotation.x = 0.80 + Math.sin(t * 0.42) * 0.05;
    p.headPivot.rotation.x = -0.74 + Math.sin(t * 0.37 + 1.0) * 0.06;
    p.headPivot.rotation.y = Math.sin(t * 0.23) * 0.10;
    /* Ленивые махи хвостом с редкими отгонами слепней */
    p.tailPivot.rotation.z = Math.sin(t * 1.25) * 0.20 + Math.sin(t * 3.7) * 0.05;
    p.tailPivot.rotation.x = 0.04;
    p.earL.rotation.x = Math.sin(t * 2.3) * 0.10;
    p.earR.rotation.x = Math.sin(t * 2.0 + 1.4) * 0.10;
  }
}

export function disposeBowHorse(horse) {
  if (!horse) return;
  horse.group.traverse((obj) => {
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
