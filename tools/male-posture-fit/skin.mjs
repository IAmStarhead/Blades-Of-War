// Rebalance only the centre of the hip crease on a separate copy. Rest
// positions, normals, joint transforms and inverse binds are not changed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.argv.length !== 5) throw Error('Usage: node skin.mjs posture.glb output.glb report.json');
const [input, output, reportPath] = process.argv.slice(2).map(p => path.resolve(p));
for (const dest of [output, reportPath]) {
  if (dest === input || (dest.startsWith(repo + path.sep) && !dest.startsWith(path.join(repo, 'work/male-posture-fit') + path.sep)))
    throw Error('Refusing to overwrite the input or unrelated repository work');
}
const sha = b => createHash('sha256').update(b).digest('hex');
const io = new NodeIO(), doc = await io.read(input), root = doc.getRoot(), skin = root.listSkins()[0];
const names = skin.listJoints().map(n => n.getName());
const primitive = root.listNodes().find(n => n.getName() === 'NewBody').getMesh().listPrimitives()[0];
const pos = primitive.getAttribute('POSITION').getArray(), joints = primitive.getAttribute('JOINTS_0').getArray(), weights = primitive.getAttribute('WEIGHTS_0').getArray();
const hip = names.indexOf('Rig_Hips'), left = names.indexOf('Rig_Thigh_L'), right = names.indexOf('Rig_Thigh_R');
assert.ok(hip >= 0 && left >= 0 && right >= 0);
const amount = .65, smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let changed = 0, maxMovedWeight = 0, maxDroppedWeight = 0;
const bounds = {min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity]};
for (let i = 0; i < pos.length / 3; i++) {
  const x = pos[3 * i], y = pos[3 * i + 1];
  const mask = amount * (1 - smooth(.005, .055, Math.abs(x))) * smooth(.79, .86, y) * (1 - smooth(.92, 1.02, y));
  if (!mask) continue;
  const W = new Map();
  for (let j = 0; j < 4; j++) if (weights[4 * i + j] > 0) W.set(joints[4 * i + j], (W.get(joints[4 * i + j]) || 0) + weights[4 * i + j]);
  let moved = 0;
  for (const bone of [left, right]) { const delta = (W.get(bone) || 0) * mask; W.set(bone, (W.get(bone) || 0) - delta); moved += delta; }
  if (moved < 1e-9) continue;
  W.set(hip, (W.get(hip) || 0) + moved);
  const sorted = [...W].filter(([, w]) => w > 1e-9).sort((a, b) => b[1] - a[1]);
  const keep = sorted.slice(0, 4), total = keep.reduce((s, v) => s + v[1], 0);
  assert.ok(total > 0); maxDroppedWeight = Math.max(maxDroppedWeight, 1 - total);
  for (let j = 0; j < 4; j++) { joints[4 * i + j] = keep[j]?.[0] || 0; weights[4 * i + j] = keep[j] ? keep[j][1] / total : 0; }
  for (let k = 0; k < 3; k++) { bounds.min[k] = Math.min(bounds.min[k], pos[3 * i + k]); bounds.max[k] = Math.max(bounds.max[k], pos[3 * i + k]); }
  changed++; maxMovedWeight = Math.max(maxMovedWeight, moved);
}
assert.ok(changed > 0 && changed < 400 && maxDroppedWeight < .0001);
// The earlier animations remain in their separate unmodified reference file.
// Keep only the two corrected C clips here, so their different skin weights
// cannot be mistaken for an unchanged copy of the older clips.
for (const a of [...root.listAnimations()]) if (!a.getName().endsWith('_Posture')) {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}
let removedUnusedAccessors = 0;
for (const a of root.listAccessors()) if (a.listParents().every(p => p.propertyType === 'Root')) { a.dispose(); removedUnusedAccessors++; }
assert.deepEqual(root.listAnimations().map(a => a.getName()), ['Walk_C_Posture', 'Run_C_Posture']);
await io.write(output, doc);
const report = {amount, verticesChanged: changed, restPositionBoundsMeters: bounds, maxMovedWeight, maxDroppedWeight, removedUnusedAccessors,
  method: 'Smoothly transfer a limited share of left/right thigh influence to the pelvis only in the central hip crease; preserve four normalized weights.',
  outputSha256: sha(fs.readFileSync(output))};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log('Hip skin:', report);
