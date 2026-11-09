import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStudyFigure, disposeStudyFigure } from '../src/engine3d/bow3d/bowStudyFigure.js';

const figure = createStudyFigure();
figure.updateMatrixWorld(true);
const bounds = new THREE.Box3().setFromObject(figure);
assert.ok(bounds.min.y >= -0.001 && bounds.min.y < 0.01, `ground ${bounds.min.y}`);
assert.ok(bounds.max.y > 1.73 && bounds.max.y < 1.76, `height ${bounds.max.y}`);
assert.ok(figure.userData.height / figure.userData.headHeight > 7.3, 'avoid oversized head');
for (const name of ['Head', 'Torso', 'Arm', 'Leg', 'Foot', 'Finger', 'Thumb', 'Hair', 'Beard', 'Nose']) {
  assert.ok(figure.getObjectByName(name), `missing ${name}`);
}
let triangles = 0;
figure.traverse(obj => {
  if (!obj.isMesh) return;
  const g = obj.geometry, pos = g.attributes.position, n = g.attributes.normal;
  assert.ok(pos.count && n.count === pos.count, obj.name);
  for (const x of pos.array) assert.ok(Number.isFinite(x));
  for (const x of n.array) assert.ok(Number.isFinite(x));
  if (g.index) for (const index of g.index.array) assert.ok(index < pos.count);
  triangles += (g.index ? g.index.count : pos.count) / 3;
});
assert.ok(triangles < 10000, `triangle count ${triangles}`);
const second = createStudyFigure();
assert.notEqual(figure.getObjectByName('Head').geometry, second.getObjectByName('Head').geometry);
disposeStudyFigure(figure); disposeStudyFigure(second);
console.log(`Study: height ${bounds.max.y.toFixed(3)} m, head ratio ${(figure.userData.height / figure.userData.headHeight).toFixed(2)}, ${triangles} triangles, finite geometry and ground OK`);
