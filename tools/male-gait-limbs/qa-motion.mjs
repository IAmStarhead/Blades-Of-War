// Sampled heel-to-tip direction and elbow widths before/after. This is a
// visual proxy, not an anatomical diagnosis, foot lock or naturalness test.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Matrix4, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-gait-limbs'));
const quantile = (a, q) => a.toSorted((x, y) => x - y)[Math.floor((a.length - 1) * q)];
const fmt = v => +v.toFixed(2), summary = a => ({samples: a.length, min: fmt(Math.min(...a)), p10: fmt(quantile(a, .1)), median: fmt(quantile(a, .5)), p90: fmt(quantile(a, .9)), max: fmt(Math.max(...a))});
const all = {};
for (const [label, file] of [['before', 'previous_game_gait.glb'], ['after', 'male_feet_arms_trial.glb']]) {
  const root = (await new NodeIO().read(path.join(folder, file))).getRoot(), skin = root.listSkins()[0];
  const names = skin.listJoints().map(n => n.getName()), ibm = skin.getInverseBindMatrices().getArray();
  const inverse = names.map((_, i) => new Matrix4().fromArray(ibm, i * 16)), matrices = names.map(() => new Matrix4());
  const body = root.listNodes().find(n => n.getName() === 'NewBody').getMesh().listPrimitives()[0];
  const pos = body.getAttribute('POSITION').getArray(), joints = body.getAttribute('JOINTS_0').getArray(), weights = body.getAttribute('WEIGHTS_0').getArray();
  const groups = {};
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    groups[side + 'heel'] = []; groups[side + 'tip'] = [];
    for (let i = 0; i < pos.length / 3; i++) {
      const x = sign * pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (x > .03 && x < .28 && y < .12 && z < -.075) groups[side + 'heel'].push(i);
      if (x > .03 && x < .28 && y < .12 && z > .15) groups[side + 'tip'].push(i);
    }
    assert.ok(groups[side + 'heel'].length && groups[side + 'tip'].length, 'Missing foot landmarks');
  }
  function centroid(indices) {
    const out = new Vector3();
    for (const i of indices) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      for (let k = 0; k < 4; k++) {
        const weight = weights[i * 4 + k]; if (!weight) continue;
        const e = matrices[joints[i * 4 + k]].elements;
        out.x += weight * (e[0] * x + e[4] * y + e[8] * z + e[12]);
        out.y += weight * (e[1] * x + e[5] * y + e[9] * z + e[13]);
        out.z += weight * (e[2] * x + e[6] * y + e[10] * z + e[14]);
      }
    }
    return out.divideScalar(indices.length);
  }
  all[label] = {};
  for (const clip of ['Walk_Game_Trial', 'Run_Game_Trial']) {
    const ev = makeEvaluator(root, 'NewBody', clip), angles = {L: [], R: []}, elbows = {L: [], R: []};
    for (let i = 0; i < 256; i++) {
      const feet = ev.footDetails(ev.duration * (i + .27) / 256);
      for (let k = 0; k < names.length; k++) matrices[k].copy(ev.bones.get(names[k]).matrixWorld).multiply(inverse[k]);
      for (const [index, side, sign] of [[0, 'L', 1], [1, 'R', -1]]) {
        const direction = centroid(groups[side + 'tip']).sub(centroid(groups[side + 'heel']));
        // Avoid a meaningless horizontal heading for a near-vertical/backwards foot.
        // Near floor is a height threshold, not proof the foot is planted.
        if (direction.z > .085 && feet[index].point[1] < .008) angles[side].push(sign * Math.atan2(direction.x, direction.z) / Math.PI * 180);
        elbows[side].push(sign * ev.bones.get('Rig_Forearm_' + side).getWorldPosition(new Vector3()).x);
      }
    }
    for (const values of Object.values(angles)) assert.ok(values.length >= 20, `Too few comparable near-floor landmarks in ${clip}`);
    all[label][clip] = {nearFloorOutwardYawDegrees: Object.fromEntries(Object.entries(angles).map(([k, v]) => [k, summary(v)])),
      elbowOutwardXmeters: Object.fromEntries(Object.entries(elbows).map(([k, v]) => [k, summary(v)]))};
  }
}
for (const clip of ['Walk_Game_Trial', 'Run_Game_Trial']) for (const side of ['L', 'R']) {
  const old = all.before[clip].nearFloorOutwardYawDegrees[side].median, current = all.after[clip].nearFloorOutwardYawDegrees[side].median;
  assert.ok(old < 0 && current > 0 && current < 12, `Unexpected median ${clip}/${side}: ${old} → ${current}`);
}
for (const side of ['L', 'R'])
  assert.ok(all.after.Walk_Game_Trial.elbowOutwardXmeters[side].median < all.before.Walk_Game_Trial.elbowOutwardXmeters[side].median, 'Walking elbows did not move inward');
console.log(JSON.stringify({method: '256 off-key phases per clip; positive signed yaw means outward relative to +Z; sole low < 8 mm and projected heel-to-tip Z > 85 mm. Near-floor is not planted.', results: all}, null, 2));
console.log('NOTE: proxy landmarks, selected phases and thresholds only; no claim of zero toe-in at every instant, no foot lock, and no proof of visual quality.');
