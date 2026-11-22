// Verify standard glTF validity, strict scope, and baked single-clip morphs.
// This is a sampled technical check, not an aesthetic or collision guarantee.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {LinearInterpolant, Quaternion} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';
import {kneeVolumeWeight} from './knee-volume.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-leg-volume'));
const source = fs.readFileSync(path.join(repo, 'work/male-hand-flight/male_hands_airfoot_trial.glb'));
const bytes = fs.readFileSync(path.join(folder, 'male_leg_volume_trial.glb'));
const sha = b => createHash('sha256').update(b).digest('hex'), info = JSON.parse(fs.readFileSync(path.join(folder, 'build-info.json')));
assert.equal(sha(source), '576077e068f2c48a88c208be0ad72b4214e42164d1e5b0f0f9f7050f3967e2bf');
assert.equal(sha(bytes), info.modelSha256); assert.equal(info.pose.outputSha256, info.modelSha256);
const validator = createRequire(path.join(repo, 'tools/character-showcase/package.json'))('gltf-validator');
const validation = await validator.validateBytes(new Uint8Array(bytes), {uri: 'male_leg_volume_trial.glb', maxIssues: 10000});
if (validation.issues.numErrors || validation.issues.numWarnings) console.error(JSON.stringify(validation.issues, null, 2));
assert.equal(validation.issues.numErrors, 0); assert.equal(validation.issues.numWarnings, 0);
console.log(`PASS glTF validator: 0 errors, 0 warnings (${validation.issues.numInfos} informational notices).`);
const io = new NodeIO(), before = (await io.readBinary(source)).getRoot(), after = (await io.readBinary(bytes)).getRoot();
const node = (root, name) => { const m = root.listNodes().filter(n => n.getName() === name); assert.equal(m.length, 1); return m[0]; };
const digest = a => { const v = a.getArray(); return sha(Buffer.from(v.buffer, v.byteOffset, v.byteLength)); };
const same = (a, b, label) => { assert.ok(a && b, label); assert.equal(digest(a), digest(b), label); };
assert.equal(after.listNodes().length, before.listNodes().length); assert.equal(after.listSkins().length, before.listSkins().length);
const skinA = before.listSkins()[0], skinB = after.listSkins()[0];
assert.deepEqual(skinA.listJoints().map(n => n.getName()), skinB.listJoints().map(n => n.getName()));
same(skinA.getInverseBindMatrices(), skinB.getInverseBindMatrices(), 'inverse bind matrices');
for (const old of before.listNodes()) {
  const now = node(after, old.getName()); assert.equal(old.getParentNode()?.getName(), now.getParentNode()?.getName());
  for (const method of ['getTranslation', 'getRotation', 'getScale']) assert.deepEqual(old[method](), now[method]());
  if (!old.getMesh()) { assert.ok(!now.getMesh()); continue; }
  const aa = old.getMesh().listPrimitives(), bb = now.getMesh().listPrimitives(); assert.equal(aa.length, bb.length);
  aa.forEach((p, i) => {
    const q = bb[i]; assert.deepEqual(p.listSemantics().sort(), q.listSemantics().sort());
    for (const sem of p.listSemantics()) same(p.getAttribute(sem), q.getAttribute(sem), `${old.getName()} ${sem}`);
    if (p.getIndices()) same(p.getIndices(), q.getIndices(), `${old.getName()} indices`);
    assert.equal(p.listTargets().length, 0); assert.equal(q.listTargets().length, old.getName() === 'NewBody' ? 2 : 0);
  });
}
assert.deepEqual(before.listTextures().map(t => sha(t.getImage())), after.listTextures().map(t => sha(t.getImage())));
const body = node(after, 'NewBody').getMesh(); assert.deepEqual(body.getWeights(), [0, 0]);
const prim = body.listPrimitives()[0], p = prim.getAttribute('POSITION').getArray(), targets = prim.listTargets();
assert.deepEqual(targets.map(t => t.getName()), ['KneeVolume_L', 'KneeVolume_R']);
for (const [k, target] of targets.entries()) {
  assert.deepEqual(target.listSemantics().sort(), ['NORMAL', 'POSITION']);
  const position = target.getAttribute('POSITION').getArray(), normals = target.getAttribute('NORMAL').getArray(), sign = k === 0 ? 1 : -1;
  let changed = 0, normalChanged = 0;
  for (let i = 0; i < p.length / 3; i++) {
    assert.equal(position[3 * i], 0); assert.equal(position[3 * i + 1], 0);
    if (position[3 * i + 2]) {
      changed++; assert.ok(p[3 * i] * sign > 0 && p[3 * i + 1] > .35 && p[3 * i + 1] < .72);
    }
    if (normals[3 * i] || normals[3 * i + 1] || normals[3 * i + 2]) {
      normalChanged++; assert.ok(p[3 * i] * sign > 0 && p[3 * i + 1] > .29 && p[3 * i + 1] < .76);
    }
  }
  assert.equal(changed, 245); assert.equal(normalChanged, 287);
}
console.log('PASS: all base vertices, normals, topology, skin weights, bind hierarchy, transforms and original textures are byte-identical; two local leg morphs added with default weight 0.');
const channelMap = a => new Map(a.listChannels().map(c => [`${c.getTargetNode().getName()}:${c.getTargetPath()}`, c]));
let maxBakedError = 0;
for (const name of ['Walk_Game_Trial', 'Run_Game_Trial']) {
  const sourceAnimation = before.listAnimations().find(a => a.getName() === name), outputAnimation = after.listAnimations().find(a => a.getName() === name);
  const a = channelMap(sourceAnimation), b = channelMap(outputAnimation);
  assert.deepEqual([...a.keys()].filter(k => !b.has(k)), []);
  assert.deepEqual([...b.keys()].filter(k => !a.has(k)), ['NewBody:weights']);
  for (const [key, old] of a) {
    const now = b.get(key), sa = old.getSampler(), sb = now.getSampler();
    assert.equal(sa.getInterpolation(), sb.getInterpolation());
    same(sa.getInput(), sb.getInput(), `${name} ${key} time`); same(sa.getOutput(), sb.getOutput(), `${name} ${key} values`);
  }
  const sampler = b.get('NewBody:weights').getSampler(), time = sampler.getInput().getArray(), values = sampler.getOutput().getArray();
  assert.equal(sampler.getInterpolation(), 'LINEAR'); assert.equal(time.length, 257); assert.equal(values.length, 514);
  assert.equal(values[0], values.at(-2)); assert.equal(values[1], values.at(-1));
  assert.ok(Array.from(values).every(v => Number.isFinite(v) && v >= 0 && v <= .850001));
  const interpolant = new LinearInterpolant(time, values, 2), evaluator = makeEvaluator(before, 'NewBody', name), samples = 8192;
  let localMax = 0;
  for (let i = 0; i < samples; i++) {
    const t = evaluator.duration * (i + .37) / samples; evaluator.pose(t); const actual = interpolant.evaluate(t);
    for (let k = 0; k < 2; k++) {
      const q = evaluator.bones.get('Rig_Shin_' + ['L', 'R'][k]).quaternion;
      localMax = Math.max(localMax, Math.abs(actual[k] - kneeVolumeWeight(q)));
    }
  }
  assert.ok(localMax < .002, `${name} baked morph differs too far from direct driver: ${localMax}`);
  maxBakedError = Math.max(maxBakedError, localMax);
  console.log(`PASS ${name}: all original tracks and times byte-identical; 257 looped morph keys approximate the driver across ${samples} samples (max weight error ${localMax.toFixed(6)}).`);
}
// The runtime driver must behave identically for equivalent quaternion signs,
// and remain bounded and continuously differentiable at its two cap joins.
for (let i = 0; i <= 1800; i++) {
  const q = new Quaternion().setFromAxisAngle({x: 1, y: 0, z: 0}, i * Math.PI / 1800);
  const w = kneeVolumeWeight(q), minus = kneeVolumeWeight(new Quaternion(-q.x, -q.y, -q.z, -q.w));
  assert.ok(w >= 0 && w <= .850001); assert.ok(Math.abs(w - minus) < 1e-12);
}
assert.equal(kneeVolumeWeight(new Quaternion().setFromAxisAngle({x: 1, y: 0, z: 0}, -70 * Math.PI / 180)), 0, 'reverse bend must not trigger a bulge');
assert.equal(kneeVolumeWeight(new Quaternion().setFromAxisAngle({x: 0, y: 1, z: 0}, 90 * Math.PI / 180)), 0, 'twisting alone must not trigger a bulge');
const f = degrees => kneeVolumeWeight(new Quaternion().setFromAxisAngle({x: 1, y: 0, z: 0}, degrees * Math.PI / 180));
for (const degrees of [110, 130]) {
  const e = .001, left = (f(degrees) - f(degrees - e)) / e, right = (f(degrees + e) - f(degrees)) / e;
  assert.ok(Math.abs(left - right) < .00001, `cap derivative discontinuity at ${degrees}`);
}
console.log(`PASS bounded sign-invariant pose driver and smooth cap; maximum sampled baked discrepancy ${maxBakedError.toFixed(6)}.`);
