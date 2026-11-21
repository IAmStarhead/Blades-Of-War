// Isolated follow-up to the reviewed feet/arms gait. Do not replace that GLB.
// Only walking finger rotations and airborne rear-foot rotations in running
// are authored; no mesh, rest pose, wrist, arm or other motion track changes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {Accessor, NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Quaternion, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = path.join(repo, 'work/male-gait-limbs/male_feet_arms_trial.glb');
const own = path.join(repo, 'work/male-hand-flight');
const expected = '9dd20ca505bf5194cd9ab3bf0034343cd134db400a4b907cd0a51caad32ef83e';
if (process.argv.length !== 4) throw Error('Usage: node author.mjs OUTPUT.glb REPORT.json');
const [output, reportPath] = process.argv.slice(2).map(p => path.resolve(p));
assert.notEqual(output, reportPath);
for (const p of [output, reportPath]) if (p === repo || (p.startsWith(repo + path.sep) && !p.startsWith(own + path.sep)))
  throw Error('Refusing to overwrite a previous delivery or unrelated work: ' + p);
const sha = b => createHash('sha256').update(b).digest('hex');
const bytes = fs.readFileSync(sourcePath); assert.equal(sha(bytes), expected, 'Unexpected source model');
const io = new NodeIO(), doc = await io.readBinary(bytes), root = doc.getRoot();
// Evaluate a separate, unmodified source document when choosing flight weights.
const source = (await io.readBinary(bytes)).getRoot(), buffer = root.listBuffers()[0];
assert.deepEqual(root.listAnimations().map(a => a.getName()), ['Walk_Game_Trial', 'Run_Game_Trial']);
const node = name => { const matches = root.listNodes().filter(n => n.getName() === name); assert.equal(matches.length, 1, name); return matches[0]; };
const animation = name => root.listAnimations().find(a => a.getName() === name);
const channel = (a, n) => { const c = a.listChannels().filter(c => c.getTargetNode().getName() === n && c.getTargetPath() === 'rotation'); assert.equal(c.length, 1, n); return c[0]; };
const deg = Math.PI / 180, smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const report = {input: 'work/male-gait-limbs/male_feet_arms_trial.glb', inputSha256: expected,
  method: 'Walking: add local finger rotation tracks based on this rig’s rest-palm normal, with a small cyclical flex. Wrist/arm tracks are untouched. Running: blend a shin-local pitch and a partial reversal of the previous world-yaw correction only when the original sole is raised and the ankle is behind the hips; restore the previous foot track near the floor or in front. This is not foot locking.',
  walking: {fingerTracksAdded: [], palmNormal: {}, curlDegreesByFinger: {2: [9, 7, 5], 3: [10, 8, 6], 4: [11, 9, 7], 5: [12, 10, 7]},
    thumbAdductionDegrees: [10, 8, 4], otherRootAdductionDegrees: {2: 6, 3: 0, 4: -1.5, 5: -3}, thumbBendDegrees: [0, 6, 3], flexOscillationDegrees: [1.2, .8, .4]},
  running: {pitchDegreesAtFullWeight: -14, reversedPreviousWorldYawFraction: .8, previousOutwardYawDegrees: {L: 8, R: 18},
    originalSoleHeightWeightMeters: [.055, .145], ankleBehindHipsWeightMeters: [.09, .27], sides: {}}};

const walk = animation('Walk_Game_Trial'), walkInput = channel(walk, 'Rig_Hand_L').getSampler().getInput();
const walkTimes = walkInput.getArray(), walkDuration = walkTimes.at(-1);
const radAxis = (axis, angle) => new Quaternion().setFromAxisAngle(axis, angle * deg);
for (const [side, sign] of [['L', 1], ['R', -1]]) {
  const local = n => new Vector3().fromArray(node(n).getTranslation());
  const palm = local(`Rig_Finger2_1_${side}`).cross(local(`Rig_Finger5_1_${side}`)).multiplyScalar(sign).normalize();
  assert.ok(palm.length() > .99); report.walking.palmNormal[side] = palm.toArray();
  for (let finger = 1; finger <= 5; finger++) for (let part = 1; part <= 3; part++) {
    const name = `Rig_Finger${finger}_${part}_${side}`, target = node(name);
    assert.deepEqual(target.getRotation(), [0, 0, 0, 1], 'Finger bind rotation is not identity');
    assert.ok(!walk.listChannels().some(c => c.getTargetNode() === target && c.getTargetPath() === 'rotation'));
    const values = new Float32Array(walkTimes.length * 4);
    for (let i = 0; i < walkTimes.length - 1; i++) {
      const phase = walkTimes[i] / walkDuration, wave = Math.sin(2 * Math.PI * phase + (side === 'L' ? 0 : Math.PI));
      const q = new Quaternion();
      if (part === 1) {
        const spread = finger === 1 ? report.walking.thumbAdductionDegrees[0] : report.walking.otherRootAdductionDegrees[finger];
        q.multiply(radAxis(palm, sign * spread));
      }
      if (finger > 1) {
        // The terminal segment has no child joint, so use the preceding
        // phalanx direction as a stable proxy for its hinge axis.
        const nextPart = Math.min(part + 1, 3), direction = local(`Rig_Finger${finger}_${nextPart}_${side}`).normalize();
        const axis = direction.cross(palm).normalize(); assert.ok(axis.length() > .99);
        const angle = report.walking.curlDegreesByFinger[finger][part - 1] + report.walking.flexOscillationDegrees[part - 1] * wave;
        q.multiply(radAxis(axis, -angle));
      } else if (part > 1) {
        // Distribute thumb adduction across joints. A larger first-joint
        // rotation alone folded this particular webbing in sampled poses.
        q.multiply(radAxis(palm, sign * report.walking.thumbAdductionDegrees[part - 1]));
        const direction = local(`Rig_Finger1_3_${side}`).normalize(), axis = direction.cross(palm).normalize();
        q.multiply(radAxis(axis, -report.walking.thumbBendDegrees[part - 1]));
      }
      q.normalize();
      if (i && new Quaternion().fromArray(values, 4 * (i - 1)).dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      q.toArray(values, 4 * i);
    }
    values.set(values.slice(0, 4), values.length - 4);
    const out = doc.createAccessor(`${walk.getName()}_${name}_rotation`, buffer).setType(Accessor.Type.VEC4).setArray(values);
    const sampler = doc.createAnimationSampler().setInput(walkInput).setOutput(out).setInterpolation('LINEAR');
    walk.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath('rotation').setSampler(sampler));
    report.walking.fingerTracksAdded.push(name);
  }
}

const run = animation('Run_Game_Trial'), ev = makeEvaluator(source, 'NewBody', 'Run_Game_Trial');
const runChannels = Object.fromEntries(['L', 'R'].map(s => [s, channel(run, 'Rig_Foot_' + s)]));
const times = runChannels.L.getSampler().getInput().getArray();
assert.deepEqual(Array.from(times), Array.from(runChannels.R.getSampler().getInput().getArray()));
assert.ok(Math.abs(times.at(-1) - ev.duration) < 1e-8);
const changed = Object.fromEntries(['L', 'R'].map(s => [s, new Float32Array(runChannels[s].getSampler().getOutput().getArray().length)]));
const old = Object.fromEntries(['L', 'R'].map(s => [s, runChannels[s].getSampler().getOutput().getArray()]));
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0);
const world = b => b.getWorldQuaternion(new Quaternion()).normalize(), position = b => b.getWorldPosition(new Vector3());
for (const side of ['L', 'R']) report.running.sides[side] = {changedKeys: 0, weightMin: 1, weightMax: 0, maximumCorrectionDegrees: 0};
for (let i = 0; i < times.length - 1; i++) {
  const lows = ev.footDetails(times[i]), hip = position(ev.bones.get('Rig_Hips'));
  for (const [k, side, sign] of [[0, 'L', 1], [1, 'R', -1]]) {
    const foot = ev.bones.get('Rig_Foot_' + side), height = lows[k].point[1], behind = hip.z - position(foot).z;
    const w = smooth((height - .055) / .09) * smooth((behind - .09) / .18);
    const base = new Quaternion().fromArray(old[side], 4 * i), q = base.clone(), stats = report.running.sides[side];
    if (w > 1e-10) {
      // Flex about the shin's local transverse axis, then undo 80% of the
      // old world-up yaw in this specific rear flight. That old yaw improved
      // toe direction on the floor but acts in the opposite lateral direction
      // when a foot points backwards. It is restored as the foot approaches
      // the ground or moves forward.
      q.premultiply(radAxis(X, -14 * w));
      const parent = world(foot.parent), turn = radAxis(Y, -sign * report.running.previousOutwardYawDegrees[side] * .8 * w);
      q.copy(parent.clone().invert().multiply(turn.multiply(parent).multiply(q))).normalize();
      stats.changedKeys++; stats.weightMin = Math.min(stats.weightMin, w); stats.weightMax = Math.max(stats.weightMax, w);
      stats.maximumCorrectionDegrees = Math.max(stats.maximumCorrectionDegrees, base.angleTo(q) / deg);
    }
    if (i && new Quaternion().fromArray(changed[side], 4 * (i - 1)).dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    q.toArray(changed[side], 4 * i);
  }
}
for (const side of ['L', 'R']) {
  const values = changed[side]; values.set(values.slice(0, 4), values.length - 4);
  assert.ok(report.running.sides[side].changedKeys > 0);
  runChannels[side].getSampler().getOutput().setArray(values);
}
fs.mkdirSync(path.dirname(output), {recursive: true}); fs.mkdirSync(path.dirname(reportPath), {recursive: true});
await io.write(output, doc); report.outputSha256 = sha(fs.readFileSync(output));
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Authored ${output}: ${report.outputSha256}`);
