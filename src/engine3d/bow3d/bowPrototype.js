/* Отдельный сравнительный прототип. Исходный генератор и старые риги не меняются. */
import * as THREE from "three";
import { BONE_IDX, createBowCharacter3D } from "./bowCharacter.js";

const bell = (value, center, width) => Math.exp(-(((value - center) / width) ** 2));

// Возвращаем сглаживание дублированных вершин UV-швов после деформации.
function smoothCoincidentNormals(geometry) {
  geometry.computeVertexNormals();
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < positions.count; i++) {
    const key = [positions.getX(i), positions.getY(i), positions.getZ(i)]
      .map(v => Math.round(v * 100000)).join(",");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const n = new THREE.Vector3();
    for (const i of ids) n.add(new THREE.Vector3().fromBufferAttribute(normals, i));
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    for (const i of ids) normals.setXYZ(i, n.x, n.y, n.z);
  }
  normals.needsUpdate = true;
}

function sculptBody(rig) {
  const geometry = rig.bodyMesh.geometry;
  const pos = geometry.attributes.position;
  const { hScale: h, wScale: w, shoulderY } = rig.metrics;
  const ranges = rig.limbRanges;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const yn = y / h;
    if (i >= ranges.torso[0] && i < ranges.torso[1]) {
      // Две мягкие грудные мышцы на передней стороне торса, не отдельные сферы.
      if (!rig.female && z > 0) {
        z += 0.018 * bell(yn, 1.29, 0.105) * bell(Math.abs(x / w), 0.085, 0.065) * Math.min(1, z / 0.07);
      }
      // Более спокойный переход от ключиц к плечам.
      if (yn > (rig.female ? 1.30 : 1.37) && Math.abs(x) > 0.06) y -= 0.009 * bell(yn, rig.female ? 1.35 : 1.41, 0.06);
    }
    for (const range of [ranges.armL, ranges.armR]) {
      if (!range || i < range[0] || i >= range[1]) continue;
      const upper = bell(y, shoulderY - 0.075 * h, 0.11 * h);
      const sx = Math.sign(x) || 1;
      x += sx * (rig.female ? 0.004 : 0.007) * upper;
      z += (z >= 0 ? 1 : -1) * 0.004 * upper;
    }
    for (const range of [ranges.legL, ranges.legR]) {
      if (!range || i < range[0] || i >= range[1]) continue;
      // Лёгкий объём икры; остальная форма и весовые швы сохранены.
      const calf = bell(yn, 0.31, 0.10);
      z += (z < 0 ? -1 : 1) * calf * 0.006;
      // Более широкая передняя часть стопы относительно пятки.
      if (yn < 0.055 && z > 0.045) x += Math.sign(x) * 0.004 * Math.min(1, (z - 0.045) / 0.04);
    }
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  smoothCoincidentNormals(geometry);
}

function sculptFace(rig) {
  const geo = rig.headMesh.geometry;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (z <= 0) continue;
    const nose = bell(x, 0, 0.017) * bell(y, 0.082, 0.025);
    const cheek = bell(Math.abs(x), 0.048, 0.020) * bell(y, 0.073, 0.027);
    pos.setZ(i, z + nose * 0.008 + cheek * 0.004);
  }
  pos.needsUpdate = true;
  smoothCoincidentNormals(geo);
}

function addBeard(rig) {
  // Оболочка по треугольникам нижней половины лица, отдельно от кожи.
  const source = rig.headMesh.geometry;
  const pos = source.attributes.position;
  const normals = source.attributes.normal;
  const indices = source.index;
  const vertices = [];
  for (let i = 0; i < indices.count; i += 3) {
    const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
    const y = ids.reduce((v, j) => v + pos.getY(j), 0) / 3;
    const z = ids.reduce((v, j) => v + pos.getZ(j), 0) / 3;
    if (y > 0.062 || y < -0.015 || z < -0.015) continue;
    for (const j of ids) vertices.push(
      pos.getX(j) + normals.getX(j) * 0.006,
      pos.getY(j) + normals.getY(j) * 0.006,
      pos.getZ(j) + normals.getZ(j) * 0.006
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  const beard = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x3c281b, side: THREE.DoubleSide }));
  beard.name = "PrototypeBeard";
  beard.castShadow = true;
  rig.bones[BONE_IDX.HEAD].add(beard);
  rig.prototypeBeard = beard;
}

export function createBowPrototype3D(opts = {}) {
  // Прототип намеренно только в исподнем; его изменения не применяются к одежде.
  const rig = createBowCharacter3D({ ...opts, outfit: "underwear" });
  rig.group.name = rig.female ? "PrototypeFemale" : "PrototypeMale";
  sculptBody(rig);
  sculptFace(rig);
  if (!rig.female) addBeard(rig);
  return rig;
}
