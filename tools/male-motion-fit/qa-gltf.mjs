// Check the published copy, unchanged previous rig/clips, loop keys and sampled
// skinned-sole behavior. This does not certify all poses or anatomical quality.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {makeEvaluator} from './pose.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(process.argv[2] || path.join(repo, 'work/male-motion-fit'));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json')), validator = require('gltf-validator');
const io = new NodeIO(), hash = b => createHash('sha256').update(b).digest('hex');
const raw = a => { assert.ok(a); const x = a.getArray(); return Buffer.from(x.buffer, x.byteOffset, x.byteLength); };
const same = (a, b, label) => assert.equal(hash(raw(a)), hash(raw(b)), label);
const close = (a, b, tolerance, label) => assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const originals = {
  'work/male-static-rebuild/male_static_rebuild.glb': '4ff3f49882d1544a856d1d9061a696e13224803fd58250782e456a3bca5982c2',
  'work/male-body-contour/male_body_contour.glb': 'db361ec8c18620802acb8dfa02b534a33e9e249134668ea8258c29c8a0a7fba5',
  'work/male-rig-rebuild/male_rig_rebuild.glb': '8c92f19a522d287ea8bd3fb2a683b27cc7bdc36b0adc4f3aa7ca7de86d11755c',
  'work/male-rig-rebuild/male_cut_placeholders.glb': 'fb5b29137bcdad4abc45b28a99e0e353b490bc21c183eb36c6e0e1670c751947',
};
for (const [file, expected] of Object.entries(originals)) assert.equal(hash(fs.readFileSync(path.join(repo, file))), expected, file);
const source = (await io.read(path.join(repo, 'work/male-rig-rebuild/male_rig_rebuild.glb'))).getRoot();
const bytes = fs.readFileSync(path.join(out, 'male_motion_C_trial.glb'));
const result = await validator.validateBytes(new Uint8Array(bytes), {uri: 'male_motion_C_trial.glb', maxIssues: 10000});
if (result.issues.numErrors || result.issues.numWarnings) console.log(JSON.stringify(result.issues, null, 2));
assert.equal(result.issues.numErrors, 0); assert.equal(result.issues.numWarnings, 0);
const trial = (await io.readBinary(bytes)).getRoot(), info = JSON.parse(fs.readFileSync(path.join(out, 'build-info.json'), 'utf8'));
const byName = (root, name) => { const found = root.listNodes().filter(n => n.getName() === name); assert.equal(found.length, 1, name); return found[0]; };
assert.equal(source.listNodes().length, trial.listNodes().length);
assert.equal(source.listSkins().length, 1); assert.equal(trial.listSkins().length, 1);
const oldSkin = source.listSkins()[0], newSkin = trial.listSkins()[0];
assert.equal(newSkin.listJoints().length, 52);
assert.deepEqual(newSkin.listJoints().map(n => n.getName()), oldSkin.listJoints().map(n => n.getName()));
same(oldSkin.getInverseBindMatrices(), newSkin.getInverseBindMatrices(), 'inverse bind matrices');
for (const before of source.listNodes()) {
  const after = byName(trial, before.getName());
  assert.equal(after.getParentNode()?.getName(), before.getParentNode()?.getName(), before.getName() + ' parent');
  assert.deepEqual(after.getTranslation(), before.getTranslation(), before.getName() + ' translation');
  assert.deepEqual(after.getRotation(), before.getRotation(), before.getName() + ' rotation');
  assert.deepEqual(after.getScale(), before.getScale(), before.getName() + ' scale');
  assert.equal(Boolean(after.getSkin()), Boolean(before.getSkin()));
  if (!before.getMesh()) { assert.ok(!after.getMesh()); continue; }
  const oldPrimitives = before.getMesh().listPrimitives(), newPrimitives = after.getMesh().listPrimitives();
  assert.equal(newPrimitives.length, oldPrimitives.length);
  oldPrimitives.forEach((p, i) => {
    const q = newPrimitives[i]; assert.deepEqual(q.listSemantics().sort(), p.listSemantics().sort());
    for (const attribute of p.listSemantics()) same(p.getAttribute(attribute), q.getAttribute(attribute), before.getName() + ' ' + attribute);
    if (p.getIndices()) same(p.getIndices(), q.getIndices(), before.getName() + ' indices');
    assert.equal(q.listTargets().length, p.listTargets().length);
  });
}
assert.deepEqual(trial.listTextures().map(t => hash(t.getImage())), source.listTextures().map(t => hash(t.getImage())));
console.log('PASS: glTF Validator 0 errors, 0 warnings; original geometry, normals, skin weights, 52 joints, bind matrices and textures unchanged');
const channel = (animation, node, property) => animation.listChannels().find(c => c.getTargetNode().getName() === node && c.getTargetPath() === property);
assert.deepEqual(trial.listAnimations().map(a => a.getName()), ['Walk_NewBody', 'Run_NewBody', 'Walk_C', 'Run_C']);
for (const name of ['Walk_NewBody', 'Run_NewBody']) {
  const a = source.listAnimations().find(x => x.getName() === name), b = trial.listAnimations().find(x => x.getName() === name);
  assert.equal(b.listChannels().length, a.listChannels().length);
  for (const c of a.listChannels()) {
    const d = channel(b, c.getTargetNode().getName(), c.getTargetPath()); assert.ok(d, name);
    assert.equal(d.getSampler().getInterpolation(), c.getSampler().getInterpolation());
    same(c.getSampler().getInput(), d.getSampler().getInput(), name + ' times');
    same(c.getSampler().getOutput(), d.getSampler().getOutput(), name + ' values');
  }
}
console.log('PASS: both previous gait clips remain byte-identical at the accessor level; four earlier GLBs retain their pinned hashes');
for (const name of ['Walk_C', 'Run_C']) {
  const animation = trial.listAnimations().find(x => x.getName() === name), c = info.clips[name];
  assert.equal(animation.listChannels().length, 22);
  for (const ch of animation.listChannels()) {
    const s = ch.getSampler(), t = s.getInput().getArray(), v = s.getOutput().getArray(), size = v.length / t.length;
    assert.equal(s.getInterpolation(), 'LINEAR'); assert.equal(t[0], 0); close(t.at(-1), c.duration, 2e-6, name + ' duration');
    for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1], name + ' non-increasing time');
    for (let k = 0; k < size; k++) assert.equal(v[k], v[v.length - size + k], name + ' endpoint ' + ch.getTargetNode().getName());
    assert.ok(Array.from(v).every(Number.isFinite));
    if (ch.getTargetPath() === 'rotation') for (let i = 0; i < v.length; i += 4)
      close(Math.hypot(...v.slice(i, i + 4)), 1, 2e-5, 'rotation length');
  }
  close(c.duration, name === 'Walk_C' ? 1 : 23 / 30, 3e-6, name + ' source duration');
  const evaluator = makeEvaluator(trial, 'NewBody', name), profile = info.rootCalibration[name];
  let minimum = Infinity, maximum = -Infinity, maxError = 0;
  for (let i = 0; i < 4096; i++) {
    const u = (i + .31) / 4096, low = Math.min(...evaluator.lows(u * evaluator.duration));
    const frame = u * c.frames, j = Math.min(c.frames - 1, Math.floor(frame)), f = frame - j;
    const clear = c.sourceClear[j] * (1 - f) + c.sourceClear[j + 1] * f;
    const x = Math.max(0, clear - profile.nearGroundToleranceMeters), width = profile.easingWidthMeters, ratio = x / width;
    const expected = x < width ? width * (2 * ratio * ratio - ratio * ratio * ratio) : x;
    minimum = Math.min(minimum, low); maximum = Math.max(maximum, low); maxError = Math.max(maxError, Math.abs(low - expected));
  }
  assert.ok(minimum > -.0015, `${name} sampled floor penetration ${(minimum * 1000).toFixed(3)} mm`);
  assert.ok(maxError < .002, `${name} sole profile error ${(maxError * 1000).toFixed(3)} mm`);
  if (name === 'Run_C') assert.ok(maximum > .10 && minimum < .005, 'run flight and near-ground phases');
  if (name === 'Walk_C') assert.ok(maximum < .008, 'walking support should remain near floor');
  console.log(`PASS ${name}: exact loop endpoints, 4096 off-key sole samples ${ (minimum * 1000).toFixed(3) }..${ (maximum * 1000).toFixed(3) } mm; max profile error ${(maxError * 1000).toFixed(3)} mm`);
  // Diagnostic only. Lowest-vertex near-ground velocity includes rolling and
  // touchdown/liftoff, so it is NOT a measured contact-slip guarantee.
  const speed = info.viewerGroundSpeedMps[name], errors = [], dt = evaluator.duration / 480 / 6;
  for (let i = 2; i < 478; i++) {
    const t = evaluator.duration * i / 480, feet = evaluator.footDetails(t);
    for (const foot of feet) {
      if (foot.point[1] > .005) continue;
      const p = evaluator.vertex(t - dt, foot.index), q = evaluator.vertex(t + dt, foot.index);
      errors.push(Math.hypot((q[0] - p[0]) / (2 * dt), (q[2] - p[2]) / (2 * dt) + speed));
    }
  }
  errors.sort((a, b) => a - b);
  console.log(`NOTE ${name}: ${errors.length} near-floor lowest-vertex velocity samples; p95 residual ${(errors[Math.floor(.95 * errors.length)]).toFixed(2)} m/s against the approximate moving grid (includes rolling/transitions; no foot lock).`);
}
console.log('NOTE: sampled sole/loop checks do not prove collision freedom, transition quality, no sliding, engine compatibility or physical-device behavior.');
