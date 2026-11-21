// CPU skin sampling for the two clips' shoulder/hip subsets. Output is scratch
// JSON for qa-region.py, not a deliverable or whole-body collision proof.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Matrix4} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-gait-refine'));
const dest = path.resolve(process.argv[3] || '/tmp/bow-gait-refine-regions.json'), count = Number(process.argv[4] || 128);
if (!Number.isInteger(count) || count < 4 || count > 512) throw Error('Sample count must be 4..512');
if (dest.startsWith(repo + path.sep)) throw Error('Write scratch vertex samples outside the repository');
const root = (await new NodeIO().read(path.join(folder, 'male_gait_C_refined.glb'))).getRoot(), skin = root.listSkins()[0];
const primitive = root.listNodes().find(n => n.getName() === 'NewBody').getMesh().listPrimitives()[0];
const pos = primitive.getAttribute('POSITION').getArray(), joints = primitive.getAttribute('JOINTS_0').getArray();
const weights = primitive.getAttribute('WEIGHTS_0').getArray(), indices = primitive.getIndices().getArray();
const predicates = {shoulderL: ([x, y]) => x > .08 && x < .38 && y > 1.25 && y < 1.51,
  shoulderR: ([x, y]) => x < -.08 && x > -.38 && y > 1.25 && y < 1.51,
  hip: ([x, y]) => Math.abs(x) < .29 && y > .72 && y < 1.11};
const P = Array.from({length: pos.length / 3}, (_, i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
const groups = Object.fromEntries(Object.keys(predicates).map(k => [k, []]));
for (let i = 0; i < indices.length; i += 3) {
  const triangle = [indices[i], indices[i + 1], indices[i + 2]];
  for (const [key, test] of Object.entries(predicates)) if (triangle.some(id => test(P[id]))) groups[key].push(...triangle);
}
const selected = [...new Set(Object.values(groups).flat())].sort((a, b) => a - b), remap = new Map(selected.map((id, i) => [id, i]));
for (const key of Object.keys(groups)) groups[key] = groups[key].map(id => remap.get(id));
const states = {}, ibm = skin.getInverseBindMatrices().getArray(), bones = skin.listJoints().map(n => n.getName());
const inverse = bones.map((_, i) => new Matrix4().fromArray(ibm, 16 * i)), matrices = bones.map(() => new Matrix4());
for (const [mode, name] of [['walk', 'Walk_C_Refined'], ['run', 'Run_C_Refined']]) {
  const ev = makeEvaluator(root, 'NewBody', name);
  for (let frame = 0; frame < count; frame++) {
    ev.pose(ev.duration * (frame + .37) / count);
    for (let i = 0; i < bones.length; i++) matrices[i].copy(ev.bones.get(bones[i]).matrixWorld).multiply(inverse[i]);
    const result = new Float32Array(selected.length * 3);
    for (let k = 0; k < selected.length; k++) {
      const i = selected[k], x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2]; let a = 0, b = 0, c = 0;
      for (let j = 0; j < 4; j++) {
        const w = weights[4 * i + j]; if (!w) continue; const e = matrices[joints[4 * i + j]].elements;
        a += w * (e[0] * x + e[4] * y + e[8] * z + e[12]);
        b += w * (e[1] * x + e[5] * y + e[9] * z + e[13]);
        c += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
      }
      result.set([a, b, c], 3 * k);
    }
    states[`${mode}-${frame}`] = Buffer.from(result.buffer).toString('base64');
  }
}
fs.writeFileSync(dest, JSON.stringify({count, base: selected.flatMap(i => P[i]), groups, states}));
console.log(`Exported ${Object.keys(states).length} poses, ${selected.length} vertices; faces per group`, Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length / 3])));
