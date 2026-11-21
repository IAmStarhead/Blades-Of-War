// Scope, validity and sampled motion checks against the exact previous GLB.
// They do not establish naturalness, continuous collision safety or foot lock.
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
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-hand-flight'));
const bytes = fs.readFileSync(path.join(folder, 'male_hands_airfoot_trial.glb'));
const beforeBytes = fs.readFileSync(path.join(folder, 'previous_feet_arms.glb'));
const sha = b => createHash('sha256').update(b).digest('hex');
const info = JSON.parse(fs.readFileSync(path.join(folder, 'build-info.json')));
assert.equal(sha(bytes), info.modelSha256); assert.equal(info.modelSha256, info.pose.outputSha256);
assert.equal(sha(beforeBytes), info.previousModelSha256);
assert.equal(sha(beforeBytes), '9dd20ca505bf5194cd9ab3bf0034343cd134db400a4b907cd0a51caad32ef83e');
assert.equal(sha(beforeBytes), sha(fs.readFileSync(path.join(repo, 'work/male-gait-limbs/male_feet_arms_trial.glb'))));
const validator = createRequire(path.join(repo, 'tools/character-showcase/package.json'))('gltf-validator');
const result = await validator.validateBytes(new Uint8Array(bytes), {uri: 'male_hands_airfoot_trial.glb', maxIssues: 10000});
if (result.issues.numErrors || result.issues.numWarnings) console.error(JSON.stringify(result.issues, null, 2));
assert.equal(result.issues.numErrors, 0); assert.equal(result.issues.numWarnings, 0);
console.log(`PASS glTF validator: 0 errors, 0 warnings (${result.issues.numInfos} informational notices).`);

const io = new NodeIO(), before = (await io.readBinary(beforeBytes)).getRoot(), after = (await io.readBinary(bytes)).getRoot();
const node = (root, name) => { const matches = root.listNodes().filter(n => n.getName() === name); assert.equal(matches.length, 1); return matches[0]; };
const digest = a => { const v = a.getArray(); return sha(Buffer.from(v.buffer, v.byteOffset, v.byteLength)); };
const same = (a, b, label) => { assert.ok(a && b, label); assert.equal(digest(a), digest(b), label); };
const skinA = before.listSkins()[0], skinB = after.listSkins()[0];
assert.equal(after.listNodes().length, before.listNodes().length); assert.equal(after.listSkins().length, before.listSkins().length);
assert.deepEqual(skinA.listJoints().map(n => n.getName()), skinB.listJoints().map(n => n.getName()));
same(skinA.getInverseBindMatrices(), skinB.getInverseBindMatrices(), 'inverse binds');
for (const a of before.listNodes()) {
  const b = node(after, a.getName()); assert.equal(a.getParentNode()?.getName(), b.getParentNode()?.getName());
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
assert.deepEqual(before.listTextures().map(t => sha(t.getImage())), after.listTextures().map(t => sha(t.getImage())));
assert.equal(after.listAccessors().filter(a => a.listParents().every(p => p.propertyType === 'Root')).length, 0);
console.log('PASS: rest hierarchy, transforms, mesh attributes, skin, inverse binds and texture images are unchanged.');

const expectedClips = ['Walk_Game_Trial', 'Run_Game_Trial'];
assert.deepEqual(before.listAnimations().map(a => a.getName()), expectedClips);
assert.deepEqual(after.listAnimations().map(a => a.getName()), expectedClips);
const fingerNames = [];
for (const side of ['L', 'R']) for (let f = 1; f <= 5; f++) for (let p = 1; p <= 3; p++) fingerNames.push(`Rig_Finger${f}_${p}_${side}:rotation`);
const map = a => new Map(a.listChannels().map(c => [`${c.getTargetNode().getName()}:${c.getTargetPath()}`, c]));
for (const clip of expectedClips) {
  const a = map(before.listAnimations().find(x => x.getName() === clip)), b = map(after.listAnimations().find(x => x.getName() === clip));
  const additions = [...b.keys()].filter(k => !a.has(k)).sort(), removals = [...a.keys()].filter(k => !b.has(k));
  assert.deepEqual(removals, []);
  assert.deepEqual(additions, clip === 'Walk_Game_Trial' ? fingerNames.toSorted() : []);
  const changed = [];
  for (const [key, old] of a) {
    const current = b.get(key), sa = old.getSampler(), sb = current.getSampler();
    assert.equal(sa.getInterpolation(), sb.getInterpolation()); assert.equal(sb.getInterpolation(), 'LINEAR');
    same(sa.getInput(), sb.getInput(), `${clip} ${key} times`);
    assert.equal(sa.getOutput().getCount(), sb.getOutput().getCount());
    if (digest(sa.getOutput()) !== digest(sb.getOutput())) changed.push(key);
  }
  assert.deepEqual(changed.sort(), clip === 'Run_Game_Trial' ? ['Rig_Foot_L:rotation', 'Rig_Foot_R:rotation'] : []);
  for (const [key, c] of b) {
    const sampler = c.getSampler(), values = sampler.getOutput().getArray(), times = sampler.getInput().getArray();
    assert.ok(Array.from(values).every(Number.isFinite));
    if (c.getTargetPath() === 'rotation') {
      assert.equal(values.length, times.length * 4);
      for (let i = 0; i < values.length; i += 4) {
        assert.ok(Math.abs(Math.hypot(...values.slice(i, i + 4)) - 1) < 2e-5, `${clip} ${key} quaternion norm`);
        if (i) assert.ok(new Quaternion().fromArray(values, i - 4).dot(new Quaternion().fromArray(values, i)) >= 0, `${clip} ${key} quaternion sign`);
      }
      assert.ok(new Quaternion().fromArray(values, 0).normalize().angleTo(new Quaternion().fromArray(values, values.length - 4).normalize()) < .0001, `${clip} ${key} loop`);
    } else {
      const size = values.length / times.length; for (let i = 0; i < size; i++) assert.equal(values[i], values[values.length - size + i]);
    }
    if (additions.includes(key)) same(sampler.getInput(), b.get('Rig_Hand_L:rotation').getSampler().getInput(), `${clip} new finger times`);
  }
  console.log(`PASS ${clip}: ${additions.length} added finger tracks, existing changed rotations: ${changed.join(', ') || 'none'}; all other track data and times match.`);
}

const P = o => o.getWorldPosition(new Vector3()), Q = o => o.getWorldQuaternion(new Quaternion()).normalize();
const deg = Math.PI / 180, report = {};
for (const clip of expectedClips) {
  const old = makeEvaluator(before, 'NewBody', clip), now = makeEvaluator(after, 'NewBody', clip);
  assert.equal(old.duration, now.duration);
  const running = clip === 'Run_Game_Trial', samples = 4096;
  const unchanged = skinA.listJoints().map(n => n.getName()).filter(n => !n.startsWith('Rig_Finger') && !(running && /Rig_(Foot|Toes)_[LR]/.test(n)));
  let pos = 0, rot = 0, ankle = 0, soleDifference = 0, minLow = Infinity, maxLow = -Infinity;
  let nearFloorRotation = 0, forwardRotation = 0, footRotation = 0, maxStep = 0, lastDelta = {}, fullFlight = {L: [], R: []};
  for (let i = 0; i <= samples; i++) {
    const t = old.duration * ((i % samples) + .31) / samples, lowOld = old.lows(t), lowNow = now.lows(t);
    minLow = Math.min(minLow, ...lowNow); maxLow = Math.max(maxLow, Math.min(...lowNow));
    soleDifference = Math.max(soleDifference, ...lowOld.map((v, k) => Math.abs(v - lowNow[k])));
    for (const name of unchanged) {
      pos = Math.max(pos, P(old.bones.get(name)).distanceTo(P(now.bones.get(name))));
      rot = Math.max(rot, Q(old.bones.get(name)).angleTo(Q(now.bones.get(name))));
    }
    for (const [k, side] of [[0, 'L'], [1, 'R']]) {
      const footA = old.bones.get('Rig_Foot_' + side), footB = now.bones.get('Rig_Foot_' + side);
      ankle = Math.max(ankle, P(footA).distanceTo(P(footB)));
      const qa = Q(footA), qb = Q(footB), difference = qa.angleTo(qb);
      footRotation = Math.max(footRotation, difference);
      if (lowOld[k] < .05) nearFloorRotation = Math.max(nearFloorRotation, difference);
      const hip = P(old.bones.get('Rig_Hips')), foot = P(footA), behind = hip.z - foot.z;
      if (behind < .08) forwardRotation = Math.max(forwardRotation, difference);
      if (running && lowOld[k] > .16 && behind > .3) {
        const shinA = P(old.bones.get('Rig_Shin_' + side)), toeA = P(old.bones.get('Rig_Toes_' + side));
        const shinB = P(now.bones.get('Rig_Shin_' + side)), toeB = P(now.bones.get('Rig_Toes_' + side));
        const bend = (s, a, toe) => a.clone().sub(s).normalize().angleTo(toe.clone().sub(a).normalize()) / deg;
        fullFlight[side].push(bend(shinB, P(footB), toeB) - bend(shinA, foot, toeA));
      }
      const delta = qb.clone().multiply(qa.clone().invert()).normalize();
      if (lastDelta[side]) maxStep = Math.max(maxStep, lastDelta[side].angleTo(delta));
      lastDelta[side] = delta;
    }
  }
  assert.ok(pos < 1e-6 && rot < 1e-6 && ankle < 1e-6, `An unchanged joint moved: ${pos}, ${rot}, ${ankle}`);
  assert.ok(minLow > -.003, `Sampled foot below floor: ${minLow}`);
  if (!running) assert.ok(soleDifference < 1e-7 && footRotation < 1e-6, 'Walking feet changed');
  else {
    assert.ok(footRotation > 10 * deg && footRotation < 23 * deg, 'Unexpected running correction magnitude');
    // Original key times are retained; interpolating across the fade boundary
    // can leave a few hundredths of a degree outside the key-level mask.
    assert.ok(nearFloorRotation < .05 * deg && forwardRotation < .05 * deg, `Running correction leaked near floor/in front: ${nearFloorRotation / deg}° / ${forwardRotation / deg}°`);
    for (const [side, arr] of Object.entries(fullFlight)) {
      const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
      assert.ok(arr.length > 300 && mean > 5, `Rear-foot ${side} angle change: ${arr.length} samples, mean ${mean}°`);
    }
  }
  report[clip] = {samples, maxUnchangedJointPositionMm: pos * 1000, maxUnchangedJointRotationDeg: rot / deg, maxAnklePositionMm: ankle * 1000,
    minLowestSoleMm: minLow * 1000, maxLowestSoleMm: maxLow * 1000, maxSoleDifferenceMm: soleDifference * 1000,
    maxFootCorrectionDeg: footRotation / deg, maxNearFloorCorrectionDeg: nearFloorRotation / deg,
    maxForwardCorrectionDeg: forwardRotation / deg, maxCorrectionStepDeg: maxStep / deg,
    rearFlightMeanShinFootAngleChangeDeg: Object.fromEntries(Object.entries(fullFlight).map(([k, a]) => [k, a.length ? a.reduce((s, x) => s + x, 0) / a.length : null]))};
}
console.log(JSON.stringify(report, null, 2));
console.log('PASS sampled poses and target scope. NOTE: height/rotation sampling is not continuous contact proof; no foot lock or aesthetic guarantee.');
