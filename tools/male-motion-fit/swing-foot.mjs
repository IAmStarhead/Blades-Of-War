// Bake a small, smoothed swing-foot lift into a separate GLB. This is not a
// planted-foot lock or runtime IK. Keep the knee's bend plane and the foot's
// world orientation; sample the actual skinned sole, not just joint positions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Vector3, Quaternion} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from './pose.mjs';
if (process.argv.length !== 6) throw Error('Usage: node swing-foot.mjs raw.glb intermediate.json adjusted.glb report.json');
const [input, infoPath, output, reportPath] = process.argv.slice(2);
assert.notEqual(input, output, 'Do not overwrite input');
const io = new NodeIO(), doc = await io.read(input), root = doc.getRoot(), info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
const smooth = (a, b, x) => { const v = Math.max(0, Math.min(1, (x - a) / (b - a))); return v * v * (3 - 2 * v); };
const P = o => o.getWorldPosition(new Vector3()), Q = o => o.getWorldQuaternion(new Quaternion()).normalize();
const report = {};
for (const name of ['Walk_C', 'Run_C']) {
  const c = info.clips[name], evaluator = makeEvaluator(root, 'NewBody', name), animation = root.listAnimations().find(a => a.getName() === name);
  const channels = new Map(animation.listChannels().filter(ch => ch.getTargetPath() === 'rotation').map(ch => [ch.getTargetNode().getName(), ch]));
  const copies = new Map();
  for (const side of ['L', 'R']) for (const part of ['Thigh', 'Shin', 'Foot']) {
    const key = `Rig_${part}_${side}`; copies.set(key, channels.get(key).getSampler().getOutput().getArray().slice());
  }
  let lifts = [new Float64Array(c.frames), new Float64Array(c.frames)];
  for (let i = 0; i < c.frames; i++) {
    evaluator.pose(evaluator.duration * i / c.frames);
    const source = c.sourceFeet.map(a => a[i]), support = source[0] <= source[1] ? 0 : 1, swing = 1 - support;
    const gap = source[swing] - source[support], clearance = Math.min(...source), lows = evaluator.currentLows();
    const lift = Math.max(0, Math.min(.075, .60 * gap - (lows[swing] - lows[support]) - .008));
    lifts[swing][i] = lift * smooth(.018, .05, gap) * (1 - smooth(.018, .06, clearance));
  }
  // A cyclic low-pass filter avoids sharply switching the correction on/off.
  for (let pass = 0; pass < 8; pass++)
    lifts = lifts.map(a => Float64Array.from(a, (v, i) => .25 * a[(i + c.frames - 1) % c.frames] + .5 * v + .25 * a[(i + 1) % c.frames]));
  let maxLift = 0, correctedKeys = 0, reachClamps = 0, maxFootOrientationError = 0;
  for (let i = 0; i <= c.frames; i++) {
    evaluator.pose(evaluator.duration * i / c.frames);
    for (let swing = 0; swing < 2; swing++) {
      let lift = lifts[swing][i % c.frames]; if (lift < 1e-5) continue;
      correctedKeys++; maxLift = Math.max(maxLift, lift);
      const before = evaluator.currentLows(), side = swing === 0 ? 'L' : 'R';
      const thigh = evaluator.bones.get('Rig_Thigh_' + side), shin = evaluator.bones.get('Rig_Shin_' + side), foot = evaluator.bones.get('Rig_Foot_' + side);
      const footWorld = Q(foot), requested = lift;
      for (let iteration = 0; iteration < 2; iteration++) {
        const hip = P(thigh), knee = P(shin), ankle = P(foot), desired = ankle.clone().add(new Vector3(0, lift, 0));
        const l1 = hip.distanceTo(knee), l2 = knee.distanceTo(ankle), axis = desired.clone().sub(hip), distance = axis.length();
        const reach = Math.min(l1 + l2 - 1e-5, Math.max(Math.abs(l1 - l2) + 1e-5, distance));
        if (Math.abs(distance - reach) > 1e-5) reachClamps++;
        axis.normalize(); desired.copy(hip).addScaledVector(axis, reach);
        const project = knee.clone().sub(hip), bend = project.clone().addScaledVector(axis, -project.dot(axis));
        if (bend.length() < 1e-6) bend.set(0, 0, 1).addScaledVector(axis, -axis.z);
        bend.normalize();
        const along = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach), radius = Math.sqrt(Math.max(0, l1 * l1 - along * along));
        const newKnee = hip.clone().addScaledVector(axis, along).addScaledVector(bend, radius);
        const r1 = new Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(), newKnee.clone().sub(hip).normalize());
        thigh.quaternion.copy(Q(thigh.parent).invert().multiply(r1.multiply(Q(thigh)))).normalize(); evaluator.updateMatrices();
        const knee2 = P(shin), ankle2 = P(foot);
        const r2 = new Quaternion().setFromUnitVectors(ankle2.clone().sub(knee2).normalize(), desired.clone().sub(knee2).normalize());
        shin.quaternion.copy(Q(shin.parent).invert().multiply(r2.multiply(Q(shin)))).normalize(); evaluator.updateMatrices();
        foot.quaternion.copy(Q(foot.parent).invert().multiply(footWorld)).normalize(); evaluator.updateMatrices();
        const remaining = Math.max(0, requested - (evaluator.currentLows()[swing] - before[swing]));
        if (iteration === 0 && remaining > .001) lift = Math.min(.015, remaining); else break;
      }
      maxFootOrientationError = Math.max(maxFootOrientationError, footWorld.angleTo(Q(foot)));
      for (const part of ['Thigh', 'Shin', 'Foot']) {
        const key = `Rig_${part}_${side}`; evaluator.bones.get(key).quaternion.toArray(copies.get(key), i * 4);
      }
    }
  }
  for (const [key, arr] of copies) {
    for (let j = 0; j < 4; j++) arr[c.frames * 4 + j] = arr[j];
    channels.get(key).getSampler().getOutput().setArray(arr);
  }
  report[name] = {maxRequestedLiftMeters: maxLift, correctedSideKeys: correctedKeys, reachClamps,
    maxFootWorldOrientationErrorDegrees: maxFootOrientationError * 180 / Math.PI,
    method: 'Smoothed two-joint swing clearance; not planted-foot locking.'};
  console.log(name, report[name]);
}
await io.write(output, doc);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
