/* ============================================================================
   ZOMBOID-STYLE MEDIEVAL 3D PROP — Каменный колодец Студёного Брода с дубовой
   бочкой, кованой бадьёй и прислонённым северным щитом (рисованные UV-текстуры
   тёсаного камня, мореного дуба, кованого железа и пухлого снега).
   ============================================================================ */

import * as THREE from "three";
import { buildPropAtlasCanvas, canvasToThreeTexture } from "./zomboidTextures.js";

/* Перемапливает UV геометрии в выбранный квадрант атласа 512×512:
   "stone" (0..0.5, 0.5..1.0), "wood" (0.5..1.0, 0.5..1.0),
   "iron"  (0..0.5, 0.0..0.5), "snow" (0.5..1.0, 0.0..0.5) */
function remapUVToQuadrant(geo, quadKey, repeatU = 1, repeatV = 1) {
  const ranges = {
    stone: [0.01, 0.49, 0.51, 0.99],
    wood:  [0.51, 0.99, 0.51, 0.99],
    iron:  [0.01, 0.49, 0.01, 0.49],
    snow:  [0.51, 0.99, 0.01, 0.49]
  };
  const [u0, u1, v0, v1] = ranges[quadKey] || ranges.stone;
  const uv = geo.getAttribute("uv");
  if (!uv) { return geo; }
  for (let i = 0; i < uv.count; i++) {
    const ux = uv.getX(i) * repeatU;
    const vy = uv.getY(i) * repeatV;
    const rawU = (ux > 0 && ux % 1 === 0) ? 1.0 : ((ux % 1) + 1) % 1;
    const rawV = (vy > 0 && vy % 1 === 0) ? 1.0 : ((vy % 1) + 1) % 1;
    uv.setXY(i, u0 + rawU * (u1 - u0), v0 + rawV * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geo;
}

export function createZomboidMedievalWell3D(opts = {}) {
  const group = new THREE.Group();
  group.name = "ZomboidStoneWellProp";

  const atlasCv = buildPropAtlasCanvas(opts.canvasFactory);
  const atlasTex = canvasToThreeTexture(atlasCv);
  atlasTex.wrapS = THREE.ClampToEdgeWrapping;
  atlasTex.wrapT = THREE.ClampToEdgeWrapping;

  const mat = new THREE.MeshLambertMaterial({ map: atlasTex });
  const darkWaterMat = new THREE.MeshBasicMaterial({ color: 0x0c131c });

  /* 1. Пухлый снежный накат у подножия колодца */
  const snowBaseGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.68, 0.86, 0.11, 20), "snow", 1, 1);
  const snowBase = new THREE.Mesh(snowBaseGeo, mat);
  snowBase.position.y = 0.055;
  snowBase.receiveShadow = true;
  group.add(snowBase);

  /* 2. Толстостенный каменный сруб колодца (полая шахта + внутренние стены + тёмная вода в глубине!) */
  const wallGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.54, 0.58, 0.72, 18, 1, true), "stone", 3, 1);
  const wall = new THREE.Mesh(wallGeo, mat);
  wall.position.y = 0.36;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  const innerMat = new THREE.MeshLambertMaterial({ map: atlasTex, side: THREE.BackSide, color: 0x66707a });
  const innerWallGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.43, 0.43, 0.72, 16, 1, true), "stone", 2, 1);
  const innerWall = new THREE.Mesh(innerWallGeo, innerMat);
  innerWall.position.y = 0.36;
  group.add(innerWall);

  const rimGeo = remapUVToQuadrant(new THREE.TorusGeometry(0.49, 0.075, 10, 20), "stone", 3, 1);
  rimGeo.rotateX(Math.PI * 0.5);
  const rim = new THREE.Mesh(rimGeo, mat);
  rim.position.y = 0.72;
  rim.castShadow = true;
  group.add(rim);

  const waterGeo = new THREE.CircleGeometry(0.43, 16);
  waterGeo.rotateX(-Math.PI * 0.5);
  const water = new THREE.Mesh(waterGeo, darkWaterMat);
  water.position.y = 0.24;
  group.add(water);

  /* 3. Две массивные дубовые стойки с подкосами */
  [-0.50, 0.50].forEach((px) => {
    const postGeo = remapUVToQuadrant(new THREE.BoxGeometry(0.11, 1.32, 0.11), "wood", 1, 2);
    const post = new THREE.Mesh(postGeo, mat);
    post.position.set(px, 1.34, 0);
    post.castShadow = true;
    group.add(post);

    const braceGeo = remapUVToQuadrant(new THREE.BoxGeometry(0.07, 0.38, 0.08), "wood", 1, 1);
    const brace = new THREE.Mesh(braceGeo, mat);
    brace.position.set(px * 0.78, 1.82, 0);
    brace.rotation.z = px < 0 ? -0.58 : 0.58;
    group.add(brace);
  });

  /* 4. Вал ворота, железная рукоять и окованная железом дубовая бадья */
  const axleGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.065, 0.065, 1.06, 12), "wood", 1, 2);
  axleGeo.rotateZ(Math.PI * 0.5);
  const axle = new THREE.Mesh(axleGeo, mat);
  axle.position.set(0, 1.66, 0);
  axle.castShadow = true;
  group.add(axle);

  const crankGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 8), "iron", 1, 1);
  const crank = new THREE.Mesh(crankGeo, mat);
  crank.position.set(0.58, 1.56, 0.06);
  crank.rotation.x = 0.45;
  group.add(crank);

  /* Подвес бадьи на кованой цепи с точкой подвеса на вороте (y = 1.64) для мягкого покачивания */
  const pendulum = new THREE.Group();
  pendulum.position.set(0, 1.64, 0.05);
  group.add(pendulum);

  const chainGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.014, 0.014, 0.56, 6), "iron", 1, 1);
  const chain = new THREE.Mesh(chainGeo, mat);
  chain.position.set(0, -0.28, 0);
  pendulum.add(chain);

  const bucketGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.13, 0.105, 0.24, 12), "wood", 2, 1);
  const bucket = new THREE.Mesh(bucketGeo, mat);
  bucket.position.set(0, -0.62, 0);
  bucket.castShadow = true;
  pendulum.add(bucket);

  const hoopGeo = remapUVToQuadrant(new THREE.TorusGeometry(0.122, 0.014, 6, 14), "iron", 1, 1);
  hoopGeo.rotateX(Math.PI * 0.5);
  const hoop1 = new THREE.Mesh(hoopGeo, mat);
  hoop1.position.set(0, -0.55, 0);
  const hoop2 = hoop1.clone();
  hoop2.scale.set(0.92, 1, 0.92);
  hoop2.position.set(0, -0.69, 0);
  pendulum.add(hoop1, hoop2);

  /* 5. Двускатная тесовая крыша колодца с толстой пушистой шапкой снега сверху */
  const slopeLen = 0.78;
  const roofW = 1.32;
  [-1, 1].forEach((side) => {
    const plankGeo = remapUVToQuadrant(new THREE.BoxGeometry(roofW, 0.055, slopeLen), "wood", 2, 1);
    const plank = new THREE.Mesh(plankGeo, mat);
    plank.position.set(0, 2.08, side * 0.28);
    plank.rotation.x = side * 0.58;
    plank.castShadow = true;
    group.add(plank);

    const snowRoofGeo = remapUVToQuadrant(new THREE.BoxGeometry(roofW + 0.05, 0.075, slopeLen + 0.04), "snow", 1, 1);
    const snowRoof = new THREE.Mesh(snowRoofGeo, mat);
    snowRoof.position.set(0, 2.135, side * 0.29);
    snowRoof.rotation.x = side * 0.58;
    snowRoof.castShadow = true;
    group.add(snowRoof);
  });

  /* 6. Рядом со срубом — пузатая дубовая бочка с коваными обручами и прислонённый щит (живая диорама!) */
  const barrelPts = [
    new THREE.Vector2(0.01, 0.0),
    new THREE.Vector2(0.20, 0.0),
    new THREE.Vector2(0.25, 0.28),
    new THREE.Vector2(0.20, 0.56),
    new THREE.Vector2(0.01, 0.56)
  ];
  const barrelGeo = remapUVToQuadrant(new THREE.LatheGeometry(barrelPts, 14), "wood", 2, 1);
  const barrel = new THREE.Mesh(barrelGeo, mat);
  barrel.position.set(-0.68, 0.04, 0.34);
  barrel.castShadow = true;
  group.add(barrel);

  [0.14, 0.42].forEach((hy) => {
    const bHoopGeo = remapUVToQuadrant(new THREE.TorusGeometry(0.235, 0.014, 6, 16), "iron", 1, 1);
    bHoopGeo.rotateX(Math.PI * 0.5);
    const bHoop = new THREE.Mesh(bHoopGeo, mat);
    bHoop.position.set(-0.68, 0.04 + hy, 0.34);
    group.add(bHoop);
  });

  /* Каплевидный деревянный щит со стальным умбоном, прислонённый к бочке */
  const shieldGroup = new THREE.Group();
  const shieldBoardGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.26, 0.14, 0.54, 8, 1), "wood", 1, 1);
  shieldBoardGeo.scale(1, 1, 0.18);
  const shieldBoard = new THREE.Mesh(shieldBoardGeo, mat);
  shieldBoard.castShadow = true;
  shieldGroup.add(shieldBoard);

  const bossGeo = remapUVToQuadrant(new THREE.SphereGeometry(0.075, 10, 8), "iron", 1, 1);
  bossGeo.scale(1, 1, 0.55);
  const boss = new THREE.Mesh(bossGeo, mat);
  boss.position.set(0, 0.04, 0.05);
  shieldGroup.add(boss);

  shieldGroup.position.set(-0.50, 0.30, 0.56);
  shieldGroup.rotation.set(-0.28, 0.42, 0.08);
  group.add(shieldGroup);

  /* Мягкая контактная тень под всем объектом */
  const shGeo = new THREE.CircleGeometry(1.05, 28);
  shGeo.rotateX(-Math.PI * 0.5);
  const shMat = new THREE.MeshBasicMaterial({
    color: 0x090b0e,
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });
  const sh = new THREE.Mesh(shGeo, shMat);
  sh.position.set(-0.1, 0.002, 0.08);
  group.add(sh);

  return {
    group,
    pendulum,
    atlasCv,
    atlasTex,
    dispose() {
      group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material && obj.material !== mat) obj.material.dispose();
      });
      mat.dispose();
      atlasTex.dispose();
    }
  };
}

/* Мягкое покачивание деревянной бадьи на ветру */
export function animateZomboidWell3D(wellProp, timeSec = 0) {
  if (!wellProp || !wellProp.pendulum) return;
  wellProp.pendulum.rotation.z = Math.sin(timeSec * 1.15) * 0.032;
  wellProp.pendulum.rotation.x = Math.cos(timeSec * 0.85) * 0.018;
}
