import assert from 'node:assert/strict';
import { createHead, STUDIES } from '../src/head-study/head.js';
assert.equal(STUDIES.length, 3);
const shapes = [];
for (const style of STUDIES) for (const female of [true, false]) {
  const head = createHead(female, style);
  const geometry = head.children[0].geometry;
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  assert.equal(p.count, 65 * 53);
  assert.ok(geometry.index.count > 0);
  for (let i = 0; i < p.count; i++) {
    assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i) + n.getX(i) + n.getY(i) + n.getZ(i)));
  }
  // The front surface normal must face the camera, not point inside the head.
  const front = 26 * 65 + 32;
  assert.ok(n.getZ(front) > 0, 'front normal faces outward');
  shapes.push(Array.from(p.array));
}
for (let i = 1; i < shapes.length; i++) assert.notDeepEqual(shapes[i], shapes[i-1]);
console.log('Head study: six distinct finite meshes with outward-facing normals');
