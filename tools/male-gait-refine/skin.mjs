// Refit shoulder and upper-thigh influences on a separate copy. No vertex
// positions, topology, normals, joints, bind matrices or morphs are changed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.argv.length !== 5) throw Error('Usage: node skin.mjs posed.glb output.glb report.json');
const [input, output, reportPath] = process.argv.slice(2).map(p => path.resolve(p));
const permitted = path.join(repo, 'work/male-gait-refine');
for (const dest of [output, reportPath]) {
  if (dest === input || (dest.startsWith(repo + path.sep) && !dest.startsWith(permitted + path.sep)))
    throw Error('Refusing to overwrite the input or unrelated repository work');
}
assert.notEqual(output, reportPath);
const io = new NodeIO(), doc = await io.read(input), root = doc.getRoot(), skin = root.listSkins()[0];
assert.deepEqual(root.listAnimations().map(a => a.getName()), ['Walk_C_Refined', 'Run_C_Refined']);
const names = skin.listJoints().map(n => n.getName()), index = name => { const i = names.indexOf(name); assert.ok(i >= 0, name); return i; };
const primitive = root.listNodes().find(n => n.getName() === 'NewBody').getMesh().listPrimitives()[0];
const positions = primitive.getAttribute('POSITION').getArray(), joints = primitive.getAttribute('JOINTS_0').getArray(), weights = primitive.getAttribute('WEIGHTS_0').getArray();
const chest = index('Rig_Chest'), hips = index('Rig_Hips'), thighs = ['L', 'R'].map(s => index('Rig_Thigh_' + s));
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const S = x => smooth(0, 1, x);
let maxDropped = 0;
function readWeights(i) {
  const W = new Map();
  for (let k = 0; k < 4; k++) W.set(joints[4 * i + k], (W.get(joints[4 * i + k]) || 0) + weights[4 * i + k]);
  return W;
}
function storeWeights(i, W) {
  const sorted = [...W].filter(([, value]) => value > 1e-9).sort((a, b) => b[1] - a[1]), keep = sorted.slice(0, 4);
  const total = keep.reduce((sum, [, value]) => sum + value, 0); assert.ok(total > 0);
  maxDropped = Math.max(maxDropped, 1 - total);
  for (let k = 0; k < 4; k++) { joints[4 * i + k] = keep[k]?.[0] || 0; weights[4 * i + k] = keep[k] ? keep[k][1] / total : 0; }
}
function shoulderPass(mode, amount) {
  let changed = 0, maxMoved = 0;
  for (let i = 0; i < positions.length / 3; i++) {
    const x = positions[3 * i], y = positions[3 * i + 1], ax = Math.abs(x), side = x >= 0 ? 'L' : 'R';
    const arm = index('Rig_UpperArm_' + side), shoulder = index('Rig_Shoulder_' + side);
    const mask = amount * smooth(.115, .147, ax) * (1 - smooth(.192, .23, ax)) * smooth(1.28, 1.34, y) * (1 - smooth(1.42, 1.47, y));
    if (!mask) continue;
    const W = readWeights(i), transfers = mode === 'chest-to-arm' ? [[chest, arm]] : [[chest, shoulder], [arm, shoulder]];
    let moved = 0;
    for (const [from, to] of transfers) {
      const delta = (W.get(from) || 0) * mask;
      W.set(from, (W.get(from) || 0) - delta); W.set(to, (W.get(to) || 0) + delta); moved += delta;
    }
    if (moved < 1e-9) continue;
    maxMoved = Math.max(maxMoved, moved); storeWeights(i, W); changed++;
  }
  return {mode, amount, verticesChanged: changed, maxMovedWeight: maxMoved};
}
// The two passes are intentionally ordered; the second sees the float32
// weights written by the first, just as in the reviewed experiment.
const shoulders = [shoulderPass('chest-to-arm', .40), shoulderPass('chest-and-arm-to-shoulder', .40)];
let changedHip = 0, maxHipMove = 0;
for (let i = 0; i < positions.length / 3; i++) {
  const x = positions[3 * i], y = positions[3 * i + 1];
  const oldProfile = S((1.04 - y) / .29), newProfile = S((1.04 - y) / .40), fade = S((Math.abs(x) - .005) / .05);
  if (!oldProfile || Math.abs(newProfile - oldProfile) < 1e-8 || !fade) continue;
  const W = readWeights(i), t = thighs.map(joint => W.get(joint) || 0), total = t[0] + t[1], hipWeight = W.get(hips) || 0;
  if (total < 1e-9) continue;
  const next = Math.max(0, Math.min(total + hipWeight, total * (1 + fade * (newProfile / oldProfile - 1))));
  const delta = next - total; if (Math.abs(delta) < 1e-9) continue;
  for (let j = 0; j < 2; j++) W.set(thighs[j], t[j] * next / total);
  W.set(hips, hipWeight - delta);
  maxHipMove = Math.max(maxHipMove, Math.abs(delta)); storeWeights(i, W); changedHip++;
}
assert.deepEqual(shoulders.map(x => x.verticesChanged), [370, 478]);
assert.equal(changedHip, 660); assert.ok(maxDropped < .0011);
await io.write(output, doc);
const sha = b => createHash('sha256').update(b).digest('hex');
const report = {shoulderPasses: shoulders, hip: {verticesChanged: changedHip, oldWidthMeters: .29, newWidthMeters: .40, maxMovedWeight: maxHipMove},
  maxDroppedWeightBeforeRenormalization: maxDropped, outputSha256: sha(fs.readFileSync(output)),
  method: 'Smooth, localized four-influence shoulder redistribution plus a broader pelvis-to-thigh blend; shared skin, not a clip-specific corrective.'};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log('Refitted skin:', report);
