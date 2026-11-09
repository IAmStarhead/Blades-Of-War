/* ============================================================================
   BLADES OF WAR — MEDIEVAL 3D PROP — Каменный колодец Студёного Брода
   Честный тёсаный квадратный деревянный брус (не «труба»!), полая бадья с водой,
   бочка с параллельными досками утопленной крышки и каплевидный щит.
   ============================================================================ */

import * as THREE from "three";
import { buildPropAtlasCanvas, canvasToThreeTexture } from "./bowTextures.js";

/* Перемапливает UV геометрии в выбранный участок атласа 512×512:
   - "stone": каменная кладка
   - "wood":  дощатый щит / клёпки (4 плахи)
   - "beam":  цельный тёсаный деревянный брус (1 монолитная плаха без полосок!)
   - "iron":  кованое железо
   - "snow":  снег */
function remapUVToQuadrant(geo, quadKey, repeatU = 1, repeatV = 1) {
  const ranges = {
    stone: [0.01, 0.49, 0.51, 0.99],
    wood:  [0.51, 0.99, 0.51, 0.99],
    beam:  [0.52, 0.73, 0.52, 0.98], // одна широкая плаха дерева на всю грань бруса!
    iron:  [0.01, 0.49, 0.01, 0.49],
    snow:  [0.51, 0.99, 0.01, 0.49]
  };
  const [u0, u1, v0, v1] = ranges[quadKey] || ranges.stone;
  const uv = geo.getAttribute("uv");
  if (!uv) return geo;
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

export function createMedievalWell3D(opts = {}) {
  const group = new THREE.Group();
  group.name = "BowStoneWellProp";

  const atlasCv = buildPropAtlasCanvas(opts.canvasFactory);
  const atlasTex = canvasToThreeTexture(atlasCv);
  atlasTex.wrapS = THREE.ClampToEdgeWrapping;
  atlasTex.wrapT = THREE.ClampToEdgeWrapping;

  /* Гладкий материал для камня/снега/металла и чёткий гранёный материал для тёсаного дерева! */
  const mat = new THREE.MeshLambertMaterial({ map: atlasTex });
  const timberMat = new THREE.MeshLambertMaterial({ map: atlasTex, flatShading: true });
  const darkInnerMat = new THREE.MeshLambertMaterial({ map: atlasTex, side: THREE.BackSide, color: 0x5c646e });
  const darkWoodBackMat = new THREE.MeshLambertMaterial({ color: 0x2c1d11, side: THREE.DoubleSide });
  const darkWaterMat = new THREE.MeshBasicMaterial({ color: 0x101c28 });

  /* 1. Пухлый снежный накат у подножия колодца */
  const snowBaseGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.68, 0.86, 0.11, 20), "snow", 1, 1);
  const snowBase = new THREE.Mesh(snowBaseGeo, mat);
  snowBase.position.y = 0.055;
  snowBase.receiveShadow = true;
  group.add(snowBase);

  /* 2. Толстостенный каменный сруб колодца (полая шахта + внутренняя кладка + вода) */
  const wallGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.54, 0.58, 0.72, 18, 1, true), "stone", 3, 1);
  const wall = new THREE.Mesh(wallGeo, mat);
  wall.position.y = 0.36;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  const innerWallGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.43, 0.43, 0.72, 16, 1, true), "stone", 2, 1);
  const innerWall = new THREE.Mesh(innerWallGeo, darkInnerMat);
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

  /* 3. Массивные четырёхгранные тёсаные брусья стоек, верхняя матица и подкосы + кованые хомуты */
  [-0.50, 0.50].forEach((px) => {
    const postGeo = remapUVToQuadrant(new THREE.BoxGeometry(0.115, 1.32, 0.115), "beam", 1, 1);
    const post = new THREE.Mesh(postGeo, timberMat);
    post.position.set(px, 1.34, 0);
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);

    /* Кованая железная обойма у основания стойки на каменном срубе */
    const bracketGeo = remapUVToQuadrant(new THREE.BoxGeometry(0.132, 0.07, 0.132), "iron", 1, 1);
    const bracket = new THREE.Mesh(bracketGeo, mat);
    bracket.position.set(px, 0.76, 0);
    group.add(bracket);

    const braceGeo = remapUVToQuadrant(new THREE.BoxGeometry(0.075, 0.38, 0.085), "beam", 1, 1);
    const brace = new THREE.Mesh(braceGeo, timberMat);
    brace.position.set(px * 0.78, 1.82, 0);
    brace.rotation.z = px < 0 ? -0.58 : 0.58;
    brace.castShadow = true;
    group.add(brace);
  });

  /* Верхняя коньковая деревянная балка между стойками */
  const topBeamGeo = remapUVToQuadrant(new THREE.BoxGeometry(1.22, 0.09, 0.095), "beam", 1, 1);
  const topBeam = new THREE.Mesh(topBeamGeo, timberMat);
  topBeam.position.set(0, 1.98, 0);
  topBeam.castShadow = true;
  group.add(topBeam);

  /* 4. Гранёный деревянный ворот, кованая рукоять и полая деревянная бадья с водой */
  const axleGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.062, 0.062, 1.02, 8), "beam", 1, 1);
  axleGeo.rotateZ(Math.PI * 0.5);
  const axle = new THREE.Mesh(axleGeo, timberMat);
  axle.position.set(0, 1.64, 0);
  axle.castShadow = true;
  group.add(axle);

  /* Г-образная кованая железная ручка ворота */
  const crankArmGeo = remapUVToQuadrant(new THREE.BoxGeometry(0.03, 0.22, 0.03), "iron", 1, 1);
  const crankArm = new THREE.Mesh(crankArmGeo, mat);
  crankArm.position.set(0.55, 1.55, 0.03);
  crankArm.rotation.x = 0.32;
  group.add(crankArm);

  const crankGripGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.018, 0.018, 0.13, 8), "beam", 1, 1);
  crankGripGeo.rotateZ(Math.PI * 0.5);
  const crankGrip = new THREE.Mesh(crankGripGeo, timberMat);
  crankGrip.position.set(0.61, 1.46, 0.065);
  group.add(crankGrip);

  /* Подвес бадьи на кованой цепи */
  const pendulum = new THREE.Group();
  pendulum.position.set(0, 1.64, 0.04);
  group.add(pendulum);

  const chainGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.014, 0.014, 0.56, 6), "iron", 1, 1);
  const chain = new THREE.Mesh(chainGeo, mat);
  chain.position.set(0, -0.28, 0);
  pendulum.add(chain);

  /* Полая клёпочная бадья (открытая сверху, с водой внутри, а не «пенек с лучами»!) */
  const bucketWallGeo = remapUVToQuadrant(new THREE.CylinderGeometry(0.13, 0.105, 0.24, 10, 1, true), "wood", 2, 1);
  const bucketWall = new THREE.Mesh(bucketWallGeo, timberMat);
  bucketWall.position.set(0, -0.62, 0);
  bucketWall.castShadow = true;
  pendulum.add(bucketWall);

  const bucketInner = new THREE.Mesh(new THREE.CylinderGeometry(0.122, 0.10, 0.23, 10, 1, true), darkWoodBackMat);
  bucketInner.position.set(0, -0.62, 0);
  pendulum.add(bucketInner);

  const bucketWater = new THREE.Mesh(new THREE.CircleGeometry(0.118, 10).rotateX(-Math.PI * 0.5), darkWaterMat);
  bucketWater.position.set(0, -0.54, 0);
  pendulum.add(bucketWater);

  /* Железная дужка над бадьёй и два кованых обруча */
  const bailGeo = remapUVToQuadrant(new THREE.TorusGeometry(0.125, 0.010, 6, 12, Math.PI), "iron", 1, 1);
  const bail = new THREE.Mesh(bailGeo, mat);
  bail.position.set(0, -0.50, 0);
  pendulum.add(bail);

  const hoopGeo = remapUVToQuadrant(new THREE.TorusGeometry(0.122, 0.013, 6, 12), "iron", 1, 1);
  hoopGeo.rotateX(Math.PI * 0.5);
  const hoop1 = new THREE.Mesh(hoopGeo, mat);
  hoop1.position.set(0, -0.55, 0);
  const hoop2 = hoop1.clone();
  hoop2.scale.set(0.91, 1, 0.91);
  hoop2.position.set(0, -0.69, 0);
  pendulum.add(hoop1, hoop2);

  /* 5. Двускатная тесовая крыша колодца со снежной шапкой */
  const slopeLen = 0.78;
  const roofW = 1.32;
  [-1, 1].forEach((side) => {
    const plankGeo = remapUVToQuadrant(new THREE.BoxGeometry(roofW, 0.055, slopeLen), "wood", 2, 1);
    const plank = new THREE.Mesh(plankGeo, timberMat);
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

  /* 6. Гранёная дубовая бочка с УТОПЛЕННОЙ КРЫШКОЙ ИЗ ПАРАЛЛЕЛЬНЫХ ДОСОК (никаких «лучей из центра»!) */
  const barrelStavePts = [
    new THREE.Vector2(0.195, 0.0),
    new THREE.Vector2(0.245, 0.28),
    new THREE.Vector2(0.195, 0.56),
    new THREE.Vector2(0.180, 0.56),
    new THREE.Vector2(0.180, 0.52)
  ];
  const barrelGeo = remapUVToQuadrant(new THREE.LatheGeometry(barrelStavePts, 12), "wood", 2, 1);
  const barrel = new THREE.Mesh(barrelGeo, timberMat);
  barrel.position.set(-0.68, 0.04, 0.34);
  barrel.castShadow = true;
  barrel.receiveShadow = true;
  group.add(barrel);

  /* Плоское донце-крышка с планарной развёрткой (параллельные доски!) */
  const barrelLidGeo = remapUVToQuadrant(new THREE.CircleGeometry(0.182, 12), "wood", 1, 1);
  barrelLidGeo.rotateX(-Math.PI * 0.5);
  const barrelLid = new THREE.Mesh(barrelLidGeo, timberMat);
  barrelLid.position.set(-0.68, 0.04 + 0.525, 0.34);
  barrelLid.receiveShadow = true;
  group.add(barrelLid);

  [0.13, 0.43].forEach((hy) => {
    const bHoopGeo = remapUVToQuadrant(new THREE.TorusGeometry(0.232, 0.014, 6, 14), "iron", 1, 1);
    bHoopGeo.rotateX(Math.PI * 0.5);
    const bHoop = new THREE.Mesh(bHoopGeo, mat);
    bHoop.position.set(-0.68, 0.04 + hy, 0.34);
    group.add(bHoop);
  });

  /* 7. Каплевидный деревянный щит из прямых плах со стальным умбоном и оковкой */
  const shieldGroup = new THREE.Group();
  const shieldShape = new THREE.Shape();
  shieldShape.moveTo(-0.22, 0.24);
  shieldShape.quadraticCurveTo(0, 0.28, 0.22, 0.24);
  shieldShape.quadraticCurveTo(0.23, -0.04, 0, -0.30);
  shieldShape.quadraticCurveTo(-0.23, -0.04, -0.22, 0.24);

  const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, {
    depth: 0.036,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 1
  });
  /* Нормализуем планарные UV щита в 0..1 по ширине и высоте -> ровные вертикальные плахи щита! */
  const sUv = shieldGeo.attributes.uv;
  const sPos = shieldGeo.attributes.position;
  for (let i = 0; i < sUv.count; i++) {
    const u = (sPos.getX(i) + 0.24) / 0.48;
    const v = (sPos.getY(i) + 0.31) / 0.60;
    sUv.setXY(i, Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v)));
  }
  remapUVToQuadrant(shieldGeo, "wood", 1, 1);

  const shieldBoard = new THREE.Mesh(shieldGeo, timberMat);
  shieldBoard.castShadow = true;
  shieldGroup.add(shieldBoard);

  const bossGeo = remapUVToQuadrant(new THREE.SphereGeometry(0.068, 10, 8), "iron", 1, 1);
  bossGeo.scale(1, 1, 0.52);
  const boss = new THREE.Mesh(bossGeo, mat);
  boss.position.set(0, 0.03, 0.048);
  shieldGroup.add(boss);

  shieldGroup.position.set(-0.50, 0.31, 0.56);
  shieldGroup.rotation.set(-0.28, 0.42, 0.08);
  group.add(shieldGroup);

  /* Мягкая контактная тень под всем объектом */
  const shGeo = new THREE.CircleGeometry(1.05, 28);
  shGeo.rotateX(-Math.PI * 0.5);
  const shMat = new THREE.MeshBasicMaterial({
    color: 0x090b0e,
    transparent: true,
    opacity: 0.40,
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
        if (obj.material) {
          const list = Array.isArray(obj.material) ? obj.material : [obj.material];
          list.forEach((m) => m.dispose());
        }
      });
      atlasTex.dispose();
    }
  };
}

/* Мягкое покачивание деревянной бадьи на ветру */
export function animateMedievalWell3D(wellProp, timeSec = 0) {
  if (!wellProp || !wellProp.pendulum) return;
  wellProp.pendulum.rotation.z = Math.sin(timeSec * 1.15) * 0.030;
  wellProp.pendulum.rotation.x = Math.cos(timeSec * 0.85) * 0.016;
}
