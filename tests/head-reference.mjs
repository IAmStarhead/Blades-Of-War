import assert from 'node:assert/strict';
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync('src/head-reference/anatomical-heads.json', 'utf8'));
for (const sex of ['female', 'male']) {
  const {positions, indices} = data[sex];
  assert.equal(positions.length % 3, 0);
  assert.equal(indices.length % 3, 0);
  assert.ok(indices.length / 3 > 1500 && indices.length / 3 < 3000);
  assert.ok(positions.every(Number.isFinite));
  assert.ok(indices.every(i => Number.isInteger(i) && i >= 0 && i < positions.length / 3));
  const ys = positions.filter((_, i) => i % 3 === 1), min = Math.min(...ys);
  assert.ok(ys.filter(y => Math.abs(y - min) < 0.00001).length >= 10, 'flat neck cut');
}
assert.notDeepEqual(data.female.positions, data.male.positions);
console.log('Anatomical head meshes: valid triangles, finite vertices, flat neck cuts');
