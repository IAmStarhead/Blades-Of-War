// Reproduce the phase-offset heuristic for the exact last character.
// Similar joint positions are only a proxy; they do not prove natural motion.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(repo, 'work/male-hand-flight/male_hands_airfoot_trial.glb');
assert.equal(createHash('sha256').update(fs.readFileSync(source)).digest('hex'), '576077e068f2c48a88c208be0ad72b4214e42164d1e5b0f0f9f7050f3967e2bf');
const root = (await new NodeIO().read(source)).getRoot(), N = 256, frames = {};
for (const name of ['Walk_Game_Trial', 'Run_Game_Trial']) {
  const ev = makeEvaluator(root, 'NewBody', name), samples = [];
  for (let i = 0; i < N; i++) {
    ev.pose(i * ev.duration / N);
    const hip = ev.bones.get('Rig_Hips').getWorldPosition(new Vector3()), point = {};
    for (const side of ['L', 'R']) for (const joint of ['Foot', 'Shin', 'Hand'])
      point[joint + side] = ev.bones.get(`Rig_${joint}_${side}`).getWorldPosition(new Vector3()).sub(hip).toArray();
    samples.push(point);
  }
  frames[name] = samples; console.log(`${name} duration: ${ev.duration.toFixed(9)} s`);
}
const a = frames.Walk_Game_Trial, b = frames.Run_Game_Trial;
const error = (v, w) => v.reduce((sum, x, i) => sum + (x - w[i]) ** 2, 0);
const offsets = [];
for (let offset = 0; offset < N; offset++) {
  let combined = 0, feet = 0;
  for (let i = 0; i < N; i++) for (const side of ['L', 'R']) {
    const x = a[i], y = b[(i + offset) % N];
    feet += error(x['Foot' + side], y['Foot' + side]);
    combined += error(x['Foot' + side], y['Foot' + side]) + .7 * error(x['Shin' + side], y['Shin' + side]) + .25 * error(x['Hand' + side], y['Hand' + side]);
  }
  offsets.push({offset, signedPhase: offset > N / 2 ? offset / N - 1 : offset / N, combined: combined / N, feet: feet / N});
}
for (const metric of ['combined', 'feet']) {
  const best = [...offsets].sort((x, y) => x[metric] - y[metric]).slice(0, 5);
  console.log(`${metric}: best offsets`, best, 'zero-offset error', offsets[0][metric]);
}
assert.equal([...offsets].sort((x, y) => x.combined - y.combined)[0].offset, 232);
console.log('PASS: weighted positional heuristic selects -3/32 cycle. Inspect contact and motion separately.');
