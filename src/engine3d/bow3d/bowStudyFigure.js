/* Самостоятельный статичный этюд человека. Это не модификация старого рига.
   Ось +Z — лицо, Y — вверх, единица измерения — метр. */
import * as THREE from "three";

// Поперечные анатомические сечения: y, центр x/z, полуширина и глубина.
function loft(rows, segments = 20, materialForBand = () => 0, shape = (x, y, z) => [x, y, z]) {
  const positions = [], indices = [];
  for (const [y, cx, cz, rx, rzFront, rzBack = rzFront] of rows) {
    for (let j = 0; j <= segments; j++) {
      const phi = Math.PI * 2 * j / segments;
      const c = Math.cos(phi);
      positions.push(...shape(cx + Math.sin(phi) * rx, y, cz + c * (c >= 0 ? rzFront : rzBack)));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  // Секции расположены снизу вверх. Последняя вершина дублирует UV-шов.
  for (let i = 0; i < rows.length - 1; i++) {
    const start = indices.length;
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j, b = a + segments + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    geo.addGroup(start, indices.length - start, materialForBand(i));
  }
  geo.setIndex(indices);
  geo.computeVertexNormals();
  // Нормали двух сторон шва должны совпадать.
  const normal = geo.attributes.normal;
  for (let i = 0; i < rows.length; i++) {
    const a = i * (segments + 1), b = a + segments;
    const n = new THREE.Vector3().fromBufferAttribute(normal, a).add(new THREE.Vector3().fromBufferAttribute(normal, b)).normalize();
    normal.setXYZ(a, n.x, n.y, n.z); normal.setXYZ(b, n.x, n.y, n.z);
  }
  return geo;
}

function ellipsoid(parent, material, x, y, z, rx, ry, rz, name, detail = 12) {
  const geometry = new THREE.SphereGeometry(1, detail, 6);
  geometry.scale(rx, ry, rz);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function surface(parent, rows, materials, name, select, shape) {
  const mesh = new THREE.Mesh(loft(rows, 20, select, shape), materials);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function createStudyFigure() {
  const group = new THREE.Group();
  group.name = "StudyFigure";
  const skin = new THREE.MeshLambertMaterial({ color: 0xc9ad98 });
  const shadowSkin = new THREE.MeshLambertMaterial({ color: 0x9d7968 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x302721 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x423025 });
  const hairLight = new THREE.MeshLambertMaterial({ color: 0x594130 });
  const cloth = new THREE.MeshLambertMaterial({ color: 0x383c3d });
  const white = new THREE.MeshLambertMaterial({ color: 0xe4d8cc });
  const iris = new THREE.MeshLambertMaterial({ color: 0x494d42 });
  const materials = [skin, shadowSkin, dark, hair, hairLight, cloth, white, iris];

  // Торс: цельная грудная клетка и талия, с плавным сужением к шее.
  surface(group, [
    [0.91, 0, -0.008, 0.155, 0.100, 0.105],
    [0.98, 0, -0.005, 0.151, 0.105, 0.108],
    [1.05, 0, 0, 0.140, 0.100, 0.100],
    [1.15, 0, 0, 0.145, 0.105, 0.103],
    [1.25, 0, 0, 0.170, 0.122, 0.108],
    [1.34, 0, -0.004, 0.185, 0.123, 0.106],
    [1.40, 0, -0.006, 0.190, 0.100, 0.095],
    [1.435, 0, -0.004, 0.145, 0.072, 0.076],
    [1.47, 0, 0, 0.072, 0.060, 0.062],
    [1.52, 0, 0, 0.054, 0.053, 0.052]
  ], [cloth, skin], "Torso", i => i < 1 ? 0 : 1, (x, y, z) => {
    if (z <= 0) return [x, y, z];
    const gx = Math.exp(-(((Math.abs(x) - 0.085) / 0.07) ** 2));
    const gy = Math.exp(-(((y - 1.29) / 0.08) ** 2));
    return [x, y, z + 0.020 * gx * gy * Math.min(1, z / 0.09)];
  });
  // Трусы и ноги: сечения голени, колена и бедра, не цилиндры-палки.
  for (const side of [-1, 1]) {
    const x = side * 0.085;
    surface(group, [
      [0.065, x, -0.004, 0.036, 0.036],
      [0.14, x, -0.007, 0.037, 0.040],
      [0.29, x, -0.016, 0.052, 0.051, 0.060],
      [0.39, x, -0.010, 0.054, 0.055, 0.062],
      [0.47, x, 0.004, 0.050, 0.062, 0.050],
      [0.55, x, 0.003, 0.059, 0.065, 0.059],
      [0.69, x, 0, 0.070, 0.074, 0.071],
      [0.79, x, -0.002, 0.076, 0.079, 0.076],
      [0.91, x, -0.006, 0.080, 0.084, 0.080]
    ], [skin, cloth], "Leg", i => i >= 7 ? 1 : 0);
    // Низкий подъём, пятка, передняя часть и пальцы; не конус от голени.
    ellipsoid(group, skin, x, 0.035, 0.026, 0.043, 0.032, 0.088, "Foot", 16);
    for (let k = 0; k < 5; k++) {
      const tx = x + side * (-0.027 + k * 0.013);
      ellipsoid(group, skin, tx, 0.016, 0.103 - k * 0.003, 0.007, 0.014, 0.019 - k * 0.001, "Toe", 8);
    }
    // Дельта перекрывает стык грудной клетки и верхней части руки.
    ellipsoid(group, skin, side * 0.185, 1.365, -0.002, 0.056, 0.072, 0.061, "Deltoid", 16);
    surface(group, [
      [0.88, side * 0.238, 0.013, 0.029, 0.030],
      [0.96, side * 0.236, 0.008, 0.037, 0.038],
      [1.05, side * 0.229, 0.001, 0.045, 0.044],
      [1.12, side * 0.221, -0.004, 0.041, 0.045],
      [1.19, side * 0.215, -0.003, 0.047, 0.052],
      [1.29, side * 0.207, -0.002, 0.055, 0.059],
      [1.37, side * 0.196, -0.002, 0.059, 0.061],
      [1.42, side * 0.184, -0.002, 0.044, 0.047]
    ], [skin], "Arm");
    // Отдельные пальцы — неподвижный открытый вариант, не полноценный риг.
    const hx = side * 0.238;
    ellipsoid(group, skin, hx, 0.852, 0.014, 0.029, 0.045, 0.018, "Palm", 12);
    for (let k = 0; k < 4; k++) {
      const dx = (k - 1.5) * 0.013;
      const length = [0.042, 0.050, 0.048, 0.038][k];
      ellipsoid(group, skin, hx + dx, 0.823 - length * 0.42, 0.018, 0.0065, length * 0.58, 0.008, "Finger", 8);
    }
    const thumb = ellipsoid(group, skin, hx - side * 0.032, 0.849, 0.028, 0.009, 0.030, 0.010, "Thumb", 8);
    thumb.rotation.z = -side * 0.4;
  }

  // Голова примерно 0,23 м на рост 1,74 м: без увеличения ради стиля.
  const headRows = [
    [1.505, 0, 0.000, 0.033, 0.048, 0.046],
    [1.525, 0, 0.000, 0.055, 0.065, 0.057],
    [1.555, 0, -0.002, 0.070, 0.074, 0.066],
    [1.600, 0, -0.003, 0.076, 0.077, 0.075],
    [1.650, 0, -0.004, 0.077, 0.074, 0.079],
    [1.690, 0, -0.006, 0.069, 0.066, 0.075],
    [1.720, 0, -0.008, 0.047, 0.045, 0.052],
    [1.733, 0, -0.008, 0.003, 0.003, 0.003]
  ];
  surface(group, headRows, [skin], "Head");
  function headSection(y) {
    let i = 0;
    while (i < headRows.length - 2 && headRows[i + 1][0] < y) i++;
    const a = headRows[i], b = headRows[i + 1];
    const t = THREE.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    return [THREE.MathUtils.lerp(a[2], b[2], t), THREE.MathUtils.lerp(a[3], b[3], t), THREE.MathUtils.lerp(a[4], b[4], t), THREE.MathUtils.lerp(a[5], b[5], t)];
  }
  for (const side of [-1, 1]) {
    ellipsoid(group, skin, side * 0.077, 1.614, -0.003, 0.017, 0.028, 0.016, "Ear", 10);
    // Небольшие глаза и широкая надбровная дуга, без крупных «бусин».
    ellipsoid(group, white, side * 0.030, 1.638, 0.071, 0.015, 0.004, 0.0025, "Eye", 12);
    ellipsoid(group, iris, side * 0.030, 1.638, 0.074, 0.0035, 0.0038, 0.0015, "Iris", 10);
    const brow = ellipsoid(group, hair, side * 0.030, 1.654, 0.070, 0.024, 0.0045, 0.004, "Brow", 10);
    brow.rotation.z = -side * 0.08;
  }
  // Нос — отдельный клин: профиль читается сбоку.
  const noseGeo = new THREE.BufferGeometry();
  noseGeo.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.012,1.645,0.067, 0.012,1.645,0.067, 0,1.609,0.102,
    -0.016,1.608,0.070, 0.016,1.608,0.070, 0,1.609,0.102,
    -0.012,1.645,0.067, 0,1.609,0.102, -0.016,1.608,0.070,
    0.012,1.645,0.067, 0.016,1.608,0.070, 0,1.609,0.102
  ], 3));
  noseGeo.computeVertexNormals();
  const nose = new THREE.Mesh(noseGeo, new THREE.MeshLambertMaterial({ color: 0xc9ad98, side: THREE.DoubleSide }));
  nose.name = "Nose"; group.add(nose);
  ellipsoid(group, shadowSkin, 0, 1.584, 0.075, 0.024, 0.003, 0.003, "Mouth", 12);

  // Борода — собственная поверхность с непрерывным верхним контуром, а не
  // выбранные треугольники кожи; область рта остаётся открытой.
  const verts = [], idx = [], cols = 28, beardRows = 5;
  for (let r = 0; r <= beardRows; r++) {
    const t = r / beardRows;
    for (let j = 0; j <= cols; j++) {
      const phi = (j / cols - 0.5) * Math.PI * 1.55;
      const front = Math.max(0, Math.cos(phi));
      const top = 1.602 - 0.037 * Math.pow(front, 4);
      const bottom = 1.509 + 0.026 * Math.abs(Math.sin(phi));
      const y = bottom + (top - bottom) * t;
      const [cz, rx, frontDepth, backDepth] = headSection(y);
      const c = Math.cos(phi);
      verts.push(Math.sin(phi) * (rx + 0.007), y, cz + c * ((c >= 0 ? frontDepth : backDepth) + 0.008));
    }
  }
  for (let r = 0; r < beardRows; r++) for (let j = 0; j < cols; j++) {
    const a = r * (cols + 1) + j, b = a + cols + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const beardGeo = new THREE.BufferGeometry();
  beardGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  beardGeo.setIndex(idx); beardGeo.computeVertexNormals();
  const beard = new THREE.Mesh(beardGeo, new THREE.MeshLambertMaterial({ color: 0x423025, side: THREE.DoubleSide }));
  beard.name = "Beard"; beard.castShadow = true; group.add(beard);
  for (const side of [-1, 1]) {
    const moustache = ellipsoid(group, hair, side * 0.012, 1.594, 0.079, 0.017, 0.006, 0.007, "Moustache", 12);
    moustache.rotation.z = -side * 0.14;
  }
  // Короткие волосы: объёмный череп с более высокой линией у лица.
  const hp = [], hi = [], segments = 32, layers = 8;
  for (let r = 0; r <= layers; r++) {
    const t = r / layers;
    for (let j = 0; j <= segments; j++) {
      const phi = (j / segments - 0.5) * Math.PI * 2;
      const front = Math.max(0, Math.cos(phi));
      const hairline = 1.625 + 0.056 * Math.pow(front, 1.5);
      const y = hairline + (1.746 - hairline) * t;
      const [cz, rx, frontDepth, backDepth] = headSection(Math.min(y, 1.733));
      const crown = y > 1.733 ? Math.max(0, (1.746 - y) / 0.013) : 1;
      const c = Math.cos(phi);
      hp.push(Math.sin(phi) * (rx + 0.012) * crown, y, cz + c * ((c >= 0 ? frontDepth : backDepth) + 0.012) * crown);
    }
  }
  for (let r = 0; r < layers; r++) for (let j = 0; j < segments; j++) {
    const a = r * (segments + 1) + j, b = a + segments + 1;
    hi.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const hairGeo = new THREE.BufferGeometry();
  hairGeo.setAttribute("position", new THREE.Float32BufferAttribute(hp, 3));
  hairGeo.setIndex(hi); hairGeo.computeVertexNormals();
  const cap = new THREE.Mesh(hairGeo, new THREE.MeshLambertMaterial({ color: 0x423025, side: THREE.DoubleSide }));
  cap.name = "Hair"; cap.castShadow = true; group.add(cap);
  // Небольшой зачёс формирует асимметрию без нарисованных полос.
  const sweep = ellipsoid(group, hairLight, -0.025, 1.694, 0.050, 0.035, 0.012, 0.012, "HairSweep", 12);
  sweep.rotation.z = -0.18;

  group.userData.height = 1.746;
  group.userData.headHeight = 1.733 - 1.505;
  group.userData.materials = materials;
  return group;
}

export function disposeStudyFigure(group) {
  const geometries = new Set(), materials = new Set(group.userData.materials || []);
  group.traverse(obj => {
    if (obj.geometry) geometries.add(obj.geometry);
    if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m));
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
}
