import assert from 'node:assert/strict';
import {buildSculptedHeadGeometry, createHumanoidSkeleton, buildBaseBodyGeometry} from '../src/engine3d/bow3d/bowCharacter.js';
for (const female of [false, true]) for (const kingdom of ['north', 'eden']) {
  const head = buildSculptedHeadGeometry(female, !female && kingdom === 'north', kingdom);
  const p = head.attributes.position, n = head.attributes.normal;
  // Three 17-vertex rings and one centre per ear, appended to the head.
  for (const [start, sign] of [[p.count - 104, -1], [p.count - 52, 1]]) {
    assert.ok(sign * n.getX(start) > 0.5, 'ear surface faces outward');
    assert.ok(sign * p.getX(start) < 0.11, 'ear stays close to the head');
  }
  const {metrics} = createHumanoidSkeleton(female, kingdom);
  assert.equal(metrics.limbBulk, female ? 1 : (kingdom === 'north' ? 1.12 : 1.06));
  const body = buildBaseBodyGeometry(female, metrics);
  const plain = buildBaseBodyGeometry(female, {...metrics, limbBulk: 1});
  const a = body.attributes.position, b = plain.attributes.position;
  assert.equal(a.count, b.count);
  let changes = 0;
  for (let i = 0; i < a.count; i++) {
    if (a.getX(i) !== b.getX(i) || a.getY(i) !== b.getY(i) || a.getZ(i) !== b.getZ(i)) {
      changes++;
      const r = body.userData.limbRanges;
      assert.ok(['armL','armR','legL','legR'].some(k => i >= r[k][0] && i < r[k][1]), 'only limb geometry changes');
    }
  }
  assert.equal(changes > 0, !female);
  head.dispose(); body.dispose(); plain.dispose();
}
console.log('Ears and limbs: outward normals, proportions, gender and kingdom variants OK');
