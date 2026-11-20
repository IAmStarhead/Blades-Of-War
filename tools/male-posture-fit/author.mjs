// Separate posture/hip trial from the selected C/C fitting. Rest geometry,
// joint positions, skin weights and all four existing clips are left intact.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {Accessor, NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {BVHLoader} from '../male-library-motion/node_modules/three/examples/jsm/loaders/BVHLoader.js';
import {AnimationMixer, Quaternion, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..');
const input = path.join(repo, 'work/male-motion-fit/male_motion_C_trial.glb');
const stand = path.join(repo, 'tools/male-motion-fit/sources/accad_male2_stand_to_walk.bvh');
const expected = {input: 'b52a204a294ff7bf11e60b3da1be385eb406bdcd732e90d1e8240760f772270e',
  stand: 'deb6cf43aa2faaaccd734853dff8567736a49126e1263aee532478d49beea7c6'};
if (process.argv.length !== 4) throw Error('Usage: node author.mjs output.glb report.json');
const [output, reportPath] = process.argv.slice(2).map(p => path.resolve(p));
for (const dest of [output, reportPath]) {
  if (dest === input || (dest.startsWith(repo + path.sep) && !dest.startsWith(path.join(repo, 'work/male-posture-fit') + path.sep)))
    throw Error('Refusing to overwrite the input or unrelated repository work');
}
const sha = b => createHash('sha256').update(b).digest('hex');
const checked = (p, hash) => { const bytes = fs.readFileSync(p); assert.equal(sha(bytes), hash, 'Unexpected input: ' + p); return bytes; };
const bytes = checked(input, expected.input); checked(stand, expected.stand);
const io = new NodeIO(), doc = await io.readBinary(bytes), root = doc.getRoot(), buffer = root.listBuffers()[0];
assert.deepEqual(root.listAnimations().map(a => a.getName()), ['Walk_NewBody', 'Run_NewBody', 'Walk_C', 'Run_C']);
const targets = new Map(root.listSkins()[0].listJoints().map(n => [n.getName(), n]));
const {skeleton, clip} = new BVHLoader().parse(fs.readFileSync(stand, 'utf8'));
const srcRoot = skeleton.bones[0], mixer = new AnimationMixer(srcRoot), action = mixer.clipAction(clip).play();
action.paused = true; action.time = 0; mixer.update(0); srcRoot.updateMatrixWorld(true);
const source = new Map(skeleton.bones.map(b => [b.name, b]));
const P = o => o.getWorldPosition(new Vector3()), Q = o => o.getWorldQuaternion(new Quaternion()).normalize();
const hipsAxis = P(source.get('LeftUpLeg')).sub(P(source.get('RightUpLeg'))), yaw = Math.atan2(hipsAxis.z, hipsAxis.x);
const standTurn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
const aligns = new Map();
for (const [name, child, src, srcChild] of [
  ['Rig_Hips', 'Rig_Spine', 'ToSpine', 'Spine'],
  ['Rig_Spine', 'Rig_Chest', 'Spine', 'Spine1'],
  ['Rig_Chest', 'Rig_Neck', 'Spine1', 'Neck'],
]) {
  const targetDirection = new Vector3().fromArray(targets.get(child).getWorldTranslation()).sub(new Vector3().fromArray(targets.get(name).getWorldTranslation())).normalize();
  const sourceDirection = P(source.get(srcChild)).sub(P(source.get(src))).applyQuaternion(standTurn).normalize();
  aligns.set(name, new Quaternion().setFromUnitVectors(targetDirection, sourceDirection));
}
const order = ['Rig_Hips', 'Rig_Spine', 'Rig_Chest', 'Rig_Neck', 'Rig_Shoulder_L', 'Rig_Shoulder_R', 'Rig_Thigh_L', 'Rig_Thigh_R'];
const report = {description: 'Remove the standing-reference torso-direction bias from the retarget, preserve limb world rotations at keys, and restore the previous sole height profile.',
  inputSha256: expected.input, referenceSha256: expected.stand, referenceYawDegrees: yaw * 180 / Math.PI,
  torsoAlignment: Object.fromEntries([...aligns].map(([name, q]) => [name, {quaternion: q.toArray(), degrees: q.angleTo(new Quaternion()) * 180 / Math.PI}])), clips: {}};
for (const [oldName, newName, samples] of [['Walk_C', 'Walk_C_Posture', 1024], ['Run_C', 'Run_C_Posture', 768]]) {
  const old = root.listAnimations().find(a => a.getName() === oldName), evaluator = makeEvaluator(root, 'NewBody', oldName);
  const oldChannels = new Map(old.listChannels().map(c => [c.getTargetNode().getName() + ':' + c.getTargetPath(), c]));
  const master = oldChannels.get('Rig_Hips:rotation').getSampler().getInput().getArray();
  const arrays = new Map(order.map(name => [name, new Float32Array(master.length * 4)]));
  let maxPreservedWorldError = 0;
  for (let i = 0; i < master.length; i++) {
    evaluator.pose(master[i]);
    const original = new Map(order.map(name => [name, Q(evaluator.bones.get(name))]));
    for (const name of order) {
      const bone = evaluator.bones.get(name), desired = original.get(name).clone();
      if (aligns.has(name)) desired.multiply(aligns.get(name).clone().invert());
      bone.quaternion.copy(Q(bone.parent).invert().multiply(desired)).normalize(); evaluator.updateMatrices();
      if (!aligns.has(name)) maxPreservedWorldError = Math.max(maxPreservedWorldError, Q(bone).angleTo(original.get(name)));
      const arr = arrays.get(name), previous = i ? new Quaternion().fromArray(arr, 4 * (i - 1)) : null;
      const q = bone.quaternion.clone(); if (previous && previous.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      q.toArray(arr, 4 * i);
    }
  }
  for (const arr of arrays.values()) for (let j = 0; j < 4; j++) arr[arr.length - 4 + j] = arr[j];
  const animation = doc.createAnimation(newName);
  for (const original of old.listChannels()) {
    const name = original.getTargetNode().getName(), property = original.getTargetPath(), src = original.getSampler();
    const replacement = property === 'rotation' && arrays.has(name) ? doc.createAccessor(`${newName}_${name}_rotation`, buffer).setType(Accessor.Type.VEC4).setArray(arrays.get(name)) : src.getOutput();
    if (arrays.has(name) && property === 'rotation') assert.equal(src.getInput().getCount(), master.length, 'Mismatched rotation key count');
    const sampler = doc.createAnimationSampler().setInput(src.getInput()).setOutput(replacement).setInterpolation(src.getInterpolation());
    animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(original.getTargetNode()).setTargetPath(property).setSampler(sampler));
  }
  // Pose changes shift the hip joint slightly. Restore the original C clip's
  // lowest skinned-foot trajectory, including its flight; no horizontal lock.
  const updated = makeEvaluator(root, 'NewBody', newName), sourceEval = makeEvaluator(root, 'NewBody', oldName);
  const rootChannel = animation.listChannels().find(c => c.getTargetNode().getName() === 'Rig_Root' && c.getTargetPath() === 'translation');
  const originalTimes = rootChannel.getSampler().getInput().getArray(); assert.equal(originalTimes.length, samples + 1);
  const translations = new Float32Array((samples + 1) * 3), changes = [];
  for (let i = 0; i <= samples; i++) {
    const t = originalTimes[i], oldLow = Math.min(...sourceEval.lows(t)), newLow = Math.min(...updated.lows(t));
    const tr = sourceEval.rootTranslation(t), change = oldLow - newLow; changes.push(change);
    translations.set([tr[0], tr[1] + change, tr[2]], i * 3);
  }
  for (let j = 0; j < 3; j++) translations[samples * 3 + j] = translations[j];
  rootChannel.getSampler().setOutput(doc.createAccessor(`${newName}_sole_root`, buffer).setType(Accessor.Type.VEC3).setArray(translations));
  report.clips[newName] = {sourceClip: oldName, duration: evaluator.duration, rotationKeys: master.length, rootKeys: samples + 1,
    maxPreservedWorldRotationErrorDegreesAtKeys: maxPreservedWorldError * 180 / Math.PI,
    minRootCorrectionMeters: Math.min(...changes), maxRootCorrectionMeters: Math.max(...changes)};
  console.log(newName, report.clips[newName]);
}
await io.write(output, doc);
report.outputSha256 = sha(fs.readFileSync(output)); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log('Wrote', output, report.outputSha256);
