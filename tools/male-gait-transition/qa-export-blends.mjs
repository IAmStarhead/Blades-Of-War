// Sample mixed-pose body triangles for the FCL checks. Scratch JSON is large;
// write it outside the repository. Uses the pinned rig's CPU evaluator; the
// companion qa-parity.mjs checks it against the actual Three.js viewer.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Matrix4} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';
import {RUN_PHASE_OFFSET, wrapPhase} from './phase-clock.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dest = path.resolve(process.argv[2] || '/dev/shm/bow-transition-blends.json');
if (dest === repo || dest.startsWith(repo + path.sep)) throw Error('Write scratch samples outside the repository');
const source = path.join(repo, 'work/male-hand-flight/male_hands_airfoot_trial.glb');
const root = (await new NodeIO().read(source)).getRoot(), skin = root.listSkins()[0];
const prim = root.listNodes().find(n => n.getName() === 'NewBody').getMesh().listPrimitives()[0];
const pos = prim.getAttribute('POSITION').getArray(), joint = prim.getAttribute('JOINTS_0').getArray();
const weights = prim.getAttribute('WEIGHTS_0').getArray(), indices = prim.getIndices().getArray();
// Same rest-space region selections used on the previous delivery.
const predicates = {
  kneeL: ([x, y]) => x > .03 && x < .25 && y > .39 && y < .69, kneeR: ([x, y]) => x < -.03 && x > -.25 && y > .39 && y < .69,
  elbowL: ([x, y]) => x > .17 && x < .37 && y > 1.07 && y < 1.3, elbowR: ([x, y]) => x < -.17 && x > -.37 && y > 1.07 && y < 1.3,
  shoulderL: ([x, y]) => x > .08 && x < .38 && y > 1.25 && y < 1.51, shoulderR: ([x, y]) => x < -.08 && x > -.38 && y > 1.25 && y < 1.51,
  hip: ([x, y]) => Math.abs(x) < .29 && y > .72 && y < 1.11,
  handL: ([x, y]) => x > .24 && y < 1.04 && y > .74, handR: ([x, y]) => x < -.24 && y < 1.04 && y > .74,
  torso: ([x, y]) => Math.abs(x) < .23 && y > .8 && y < 1.48,
  footL: ([x, y]) => x > .035 && x < .25 && y < .2, footR: ([x, y]) => x < -.035 && x > -.25 && y < .2,
  neck: ([x, y]) => Math.abs(x) < .12 && y > 1.495 && y < 1.56,
};
const P = Array.from({length: pos.length / 3}, (_, i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]);
const groups = Object.fromEntries(Object.keys(predicates).map(k => [k, []]));
for (let i = 0; i < indices.length; i += 3) {
  const tri = [indices[i], indices[i + 1], indices[i + 2]];
  for (const [key, test] of Object.entries(predicates)) if (tri.some(id => test(P[id]))) groups[key].push(...tri);
}
const selected = [...new Set(Object.values(groups).flat())].sort((a, b) => a - b), remap = new Map(selected.map((id, i) => [id, i]));
for (const key of Object.keys(groups)) groups[key] = groups[key].map(id => remap.get(id));
const base = selected.flatMap(i => P[i]), states = {}, poses = {};
const walk = makeEvaluator(root, 'NewBody', 'Walk_Game_Trial'), run = makeEvaluator(root, 'NewBody', 'Run_Game_Trial');
const mixed = makeEvaluator(root, 'NewBody', 'Walk_Game_Trial');
const ibm = skin.getInverseBindMatrices().getArray(), names = skin.listJoints().map(n => n.getName());
const inverse = names.map((_, i) => new Matrix4().fromArray(ibm, 16 * i)), matrices = names.map(() => new Matrix4());
let index = 0;
for (const weight of [.2, .4, .6, .8]) for (let f = 0; f < 64; f++) {
  const phase = (f + .37) / 64;
  walk.pose(phase * walk.duration); run.pose(wrapPhase(phase + RUN_PHASE_OFFSET) * run.duration);
  for (const [name, destBone] of mixed.bones) {
    const a = walk.bones.get(name), b = run.bones.get(name);
    destBone.position.lerpVectors(a.position, b.position, weight);
    destBone.quaternion.slerpQuaternions(a.quaternion, b.quaternion, weight).normalize();
  }
  mixed.updateMatrices();
  for (let i = 0; i < names.length; i++) matrices[i].copy(mixed.bones.get(names[i]).matrixWorld).multiply(inverse[i]);
  const result = new Float32Array(selected.length * 3);
  for (let k = 0; k < selected.length; k++) {
    const i = selected[k], x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2]; let a = 0, b = 0, c = 0;
    for (let j = 0; j < 4; j++) {
      const w = weights[4 * i + j]; if (!w) continue;
      const e = matrices[joint[4 * i + j]].elements;
      a += w * (e[0] * x + e[4] * y + e[8] * z + e[12]);
      b += w * (e[1] * x + e[5] * y + e[9] * z + e[13]);
      c += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
    result.set([a, b, c], 3 * k);
  }
  const name = `blend-${index++}`; states[name] = Buffer.from(result.buffer).toString('base64'); poses[name] = {phase, weight};
}
// A world-up translation by the guard changes no triangle intersections, so
// these raw vertices intentionally omit that uniform root lift.
fs.writeFileSync(dest, JSON.stringify({count: index, base, groups, sourceVertexIds: selected, poses, states}));
console.log(`Exported ${index} mixed poses, ${selected.length} selected vertices: ${dest} (${fs.statSync(dest).size} bytes).`);
