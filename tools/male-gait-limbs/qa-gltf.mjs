// Verify a targeted track edit against the exact previous model. Sampled
// checks do not establish all-time collision safety or visual naturalness.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Quaternion, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-gait-limbs'));
const bytes = fs.readFileSync(path.join(folder, 'male_feet_arms_trial.glb'));
const beforeBytes = fs.readFileSync(path.join(folder, 'previous_game_gait.glb'));
const sha = b => createHash('sha256').update(b).digest('hex');
const info = JSON.parse(fs.readFileSync(path.join(folder, 'build-info.json')));
assert.equal(sha(bytes), info.modelSha256); assert.equal(info.modelSha256, info.pose.outputSha256);
assert.equal(sha(beforeBytes), info.previousModelSha256);
assert.equal(sha(beforeBytes), sha(fs.readFileSync(path.join(repo, 'work/male-game-gait/male_game_gait_trial.glb'))));
const validator = createRequire(path.join(repo, 'tools/character-showcase/package.json'))('gltf-validator');
const result = await validator.validateBytes(new Uint8Array(bytes), {uri: 'male_feet_arms_trial.glb', maxIssues: 10000});
if (result.issues.numErrors || result.issues.numWarnings) console.error(JSON.stringify(result.issues, null, 2));
assert.equal(result.issues.numErrors, 0); assert.equal(result.issues.numWarnings, 0);
console.log(`PASS glTF validator: 0 errors, 0 warnings (${result.issues.numInfos} informational notices).`);

const io = new NodeIO(), previous = (await io.readBinary(beforeBytes)).getRoot(), next = (await io.readBinary(bytes)).getRoot();
const node = (root, name) => { const found = root.listNodes().filter(n => n.getName() === name); assert.equal(found.length, 1); return found[0]; };
const digest = a => { const v = a.getArray(); return sha(Buffer.from(v.buffer, v.byteOffset, v.byteLength)); };
const same = (a, b, label) => { assert.ok(a && b, label); assert.equal(digest(a), digest(b), label); };
const skinA = previous.listSkins()[0], skinB = next.listSkins()[0];
assert.equal(next.listNodes().length, previous.listNodes().length); assert.equal(next.listSkins().length, previous.listSkins().length);
assert.deepEqual(skinA.listJoints().map(n => n.getName()), skinB.listJoints().map(n => n.getName()));
same(skinA.getInverseBindMatrices(), skinB.getInverseBindMatrices(), 'inverse binds');
for (const a of previous.listNodes()) {
  const b = node(next, a.getName());
  assert.equal(a.getParentNode()?.getName(), b.getParentNode()?.getName());
  for (const method of ['getTranslation', 'getRotation', 'getScale']) assert.deepEqual(a[method](), b[method]());
  if (!a.getMesh()) { assert.ok(!b.getMesh()); continue; }
  const aa = a.getMesh().listPrimitives(), bb = b.getMesh().listPrimitives(); assert.equal(aa.length, bb.length);
  aa.forEach((p, i) => {
    const q = bb[i]; assert.deepEqual(p.listSemantics().sort(), q.listSemantics().sort());
    for (const sem of p.listSemantics()) same(p.getAttribute(sem), q.getAttribute(sem), `${a.getName()} ${sem}`);
    if (p.getIndices()) same(p.getIndices(), q.getIndices(), `${a.getName()} indices`);
    assert.equal(p.listTargets().length, q.listTargets().length);
    p.listTargets().forEach((t, k) => {
      const u = q.listTargets()[k]; assert.deepEqual(t.listSemantics().sort(), u.listSemantics().sort());
      for (const sem of t.listSemantics()) same(t.getAttribute(sem), u.getAttribute(sem), `${a.getName()} morph ${k} ${sem}`);
    });
  });
}
assert.deepEqual(previous.listTextures().map(t => sha(t.getImage())), next.listTextures().map(t => sha(t.getImage())));
assert.equal(next.listAccessors().filter(a => a.listParents().every(p => p.propertyType === 'Root')).length, 0);
console.log('PASS: rest hierarchy/transforms, mesh attributes, skin/inverse binds and texture images match the previous model.');

const changed = {Walk_Game_Trial: ['Rig_Foot_L', 'Rig_Foot_R', 'Rig_UpperArm_L', 'Rig_UpperArm_R'], Run_Game_Trial: ['Rig_Foot_L', 'Rig_Foot_R']};
assert.deepEqual(next.listAnimations().map(a => a.getName()), Object.keys(changed));
const channelMap = animation => new Map(animation.listChannels().map(c => [`${c.getTargetNode().getName()}:${c.getTargetPath()}`, c]));
for (const clipName of Object.keys(changed)) {
  const old = previous.listAnimations().find(a => a.getName() === clipName), current = next.listAnimations().find(a => a.getName() === clipName);
  const aa = channelMap(old), bb = channelMap(current); assert.deepEqual([...aa.keys()].sort(), [...bb.keys()].sort());
  const changedActual = [];
  for (const [key, a] of aa) {
    const b = bb.get(key), sa = a.getSampler(), sb = b.getSampler(), times = sb.getInput().getArray(), values = sb.getOutput().getArray();
    assert.equal(sa.getInterpolation(), sb.getInterpolation()); assert.equal(sb.getInterpolation(), 'LINEAR');
    same(sa.getInput(), sb.getInput(), `${clipName} ${key} times`);
    assert.equal(sa.getOutput().getCount(), sb.getOutput().getCount());
    if (digest(sa.getOutput()) !== digest(sb.getOutput())) changedActual.push(key);
    assert.ok(Array.from(values).every(Number.isFinite));
    if (b.getTargetPath() === 'rotation') {
      for (let i = 0; i < values.length; i += 4) {
        assert.ok(Math.abs(Math.hypot(...values.slice(i, i + 4)) - 1) < 2e-5, `${clipName} ${key} non-unit rotation`);
        if (i) assert.ok(new Quaternion().fromArray(values, i - 4).dot(new Quaternion().fromArray(values, i)) >= 0, `${clipName} ${key} quaternion discontinuity`);
      }
      assert.ok(new Quaternion().fromArray(values, 0).angleTo(new Quaternion().fromArray(values, values.length - 4)) < .001);
    } else {
      const size = values.length / times.length;
      for (let i = 0; i < size; i++) assert.equal(values[i], values[values.length - size + i]);
    }
  }
  assert.deepEqual(changedActual.sort(), changed[clipName].map(n => n + ':rotation').sort(), `Unexpected changed tracks in ${clipName}`);
  console.log(`PASS ${clipName}: identical time keys and exactly these changed rotations: ${changed[clipName].join(', ')}.`);
}

const P = o => o.getWorldPosition(new Vector3()), Q = o => o.getWorldQuaternion(new Quaternion()).normalize();
const yaw = info.pose.outwardWorldYawDegrees, Y = new Vector3(0, 1, 0), rad = Math.PI / 180;
for (const clipName of Object.keys(changed)) {
  const a = makeEvaluator(previous, 'NewBody', clipName), b = makeEvaluator(next, 'NewBody', clipName);
  assert.equal(a.duration, b.duration);
  let maxPosition = 0, maxRotation = 0, maxSoleDelta = 0, minSole = Infinity, maxSole = -Infinity, maxYawError = 0;
  const unchanged = ['Rig_Root', 'Rig_Hips', 'Rig_Spine', 'Rig_Chest', 'Rig_Neck', 'Rig_Head',
    'Rig_Thigh_L', 'Rig_Thigh_R', 'Rig_Shin_L', 'Rig_Shin_R', 'Rig_Shoulder_L', 'Rig_Shoulder_R'];
  if (clipName === 'Run_Game_Trial') unchanged.push('Rig_UpperArm_L', 'Rig_UpperArm_R', 'Rig_Forearm_L', 'Rig_Forearm_R', 'Rig_Hand_L', 'Rig_Hand_R');
  const samples = 4096;
  for (let i = 0; i < samples; i++) {
    const t = a.duration * (i + .31) / samples, lowA = a.lows(t), lowB = b.lows(t);
    minSole = Math.min(minSole, ...lowB); maxSole = Math.max(maxSole, Math.min(...lowB));
    maxSoleDelta = Math.max(maxSoleDelta, ...lowA.map((v, k) => Math.abs(v - lowB[k])));
    for (const name of unchanged) {
      maxPosition = Math.max(maxPosition, P(a.bones.get(name)).distanceTo(P(b.bones.get(name))));
      maxRotation = Math.max(maxRotation, Q(a.bones.get(name)).angleTo(Q(b.bones.get(name))));
    }
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      const oldFoot = a.bones.get('Rig_Foot_' + side), newFoot = b.bones.get('Rig_Foot_' + side);
      maxPosition = Math.max(maxPosition, P(oldFoot).distanceTo(P(newFoot)));
      const expected = new Quaternion().setFromAxisAngle(Y, sign * yaw[clipName][side] * rad).multiply(Q(oldFoot));
      maxYawError = Math.max(maxYawError, expected.angleTo(Q(newFoot)));
    }
  }
  assert.ok(maxPosition < 1e-6 && maxRotation < 1e-6, `An unchanged joint moved: ${maxPosition} m, ${maxRotation} rad`);
  assert.ok(maxSoleDelta < .001 && minSole > -.003, `Sole height changed unexpectedly: ${maxSoleDelta} m, minimum ${minSole} m`);
  assert.ok(maxYawError < .1 * rad, `Unexpected between-key world yaw error: ${maxYawError / rad} degrees`);
  console.log(`PASS ${clipName}: ${samples} sampled phases; unchanged joints/ankle positions within ${(maxPosition * 1000).toFixed(5)} mm, sole height change ≤ ${(maxSoleDelta * 1000).toFixed(4)} mm, lowest sole ${(minSole * 1000).toFixed(2)}–${(maxSole * 1000).toFixed(2)} mm; max yaw approximation error ${(maxYawError / rad).toFixed(4)}°.`);
}
console.log('NOTE: foot heights and unchanged joints are sampled; neither a horizontal foot lock nor all-time collision/visual quality is established.');
