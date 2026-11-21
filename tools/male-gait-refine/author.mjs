// Refit only the selected C/C clips on a separate copy of the previous trial.
// Rest transforms, topology, bind matrices and root translations are unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {BVHLoader} from '../male-library-motion/node_modules/three/examples/jsm/loaders/BVHLoader.js';
import {AnimationMixer, Quaternion, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const input = path.join(repo, 'work/male-posture-fit/male_posture_C_trial.glb');
const stand = path.join(repo, 'tools/male-motion-fit/sources/accad_male2_stand_to_walk.bvh');
const hashes = {input: 'c72ec5c2386362d4f4c30dc0e541ffa3c6664f9ca4c27d49d8cd428ce87c3847',
  stand: 'deb6cf43aa2faaaccd734853dff8567736a49126e1263aee532478d49beea7c6'};
if (process.argv.length !== 4) throw Error('Usage: node author.mjs output.glb report.json');
const [output, reportPath] = process.argv.slice(2).map(p => path.resolve(p));
const permitted = path.join(repo, 'work/male-gait-refine');
for (const dest of [output, reportPath]) {
  if (dest === input || (dest.startsWith(repo + path.sep) && !dest.startsWith(permitted + path.sep)))
    throw Error('Refusing to overwrite the input or unrelated repository work');
}
assert.notEqual(output, reportPath);
const sha = b => createHash('sha256').update(b).digest('hex');
const checked = (p, expected) => { const b = fs.readFileSync(p); assert.equal(sha(b), expected, `Unexpected input: ${p}`); return b; };
const bytes = checked(input, hashes.input); checked(stand, hashes.stand);
const io = new NodeIO(), doc = await io.readBinary(bytes), root = doc.getRoot();
assert.deepEqual(root.listAnimations().map(a => a.getName()), ['Walk_C_Posture', 'Run_C_Posture']);
const joints = new Map(root.listSkins()[0].listJoints().map(n => [n.getName(), n]));
const {skeleton, clip} = new BVHLoader().parse(fs.readFileSync(stand, 'utf8'));
const sourceRoot = skeleton.bones[0], mixer = new AnimationMixer(sourceRoot), action = mixer.clipAction(clip).play();
action.paused = true; action.time = 0; mixer.update(0); sourceRoot.updateMatrixWorld(true);
const source = new Map(skeleton.bones.map(b => [b.name, b]));
const P = o => o.getWorldPosition(new Vector3());
const Q = o => o.getWorldQuaternion(new Quaternion()).normalize();
const T = name => new Vector3().fromArray(joints.get(name).getWorldTranslation());
const hipAxis = P(source.get('LeftUpLeg')).sub(P(source.get('RightUpLeg')));
const yaw = Math.atan2(hipAxis.z, hipAxis.x), turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
const alignment = new Map();
for (const side of ['L', 'R']) {
  const src = side === 'L' ? 'Left' : 'Right';
  for (const [bone, child, sourceBone, sourceChild] of [
    [`Rig_Shoulder_${side}`, `Rig_UpperArm_${side}`, `${src}Shoulder`, `${src}Arm`],
    [`Rig_UpperArm_${side}`, `Rig_Forearm_${side}`, `${src}Arm`, `${src}ForeArm`],
  ]) {
    const targetDirection = T(child).sub(T(bone)).normalize();
    const sourceDirection = P(source.get(sourceChild)).sub(P(source.get(sourceBone))).applyQuaternion(turn).normalize();
    alignment.set(bone, new Quaternion().setFromUnitVectors(targetDirection, sourceDirection).invert());
  }
}
const specs = [
  {old: 'Walk_C_Posture', name: 'Walk_C_Refined', foot: {L: 22, R: 10}},
  {old: 'Run_C_Posture', name: 'Run_C_Refined', foot: {L: 30, R: 12}},
];
const shin = {L: 12, R: 5}, shoulderFactor = 1.25, backDegrees = -3;
const deg = n => n * Math.PI / 180, identity = new Quaternion(), xAxis = new Vector3(1, 0, 0), yAxis = new Vector3(0, 1, 0);
const rotation = (axis, degrees) => new Quaternion().setFromAxisAngle(axis, deg(degrees));
const order = ['Rig_Spine', 'Rig_Chest', 'Rig_Neck', ...['L', 'R'].flatMap(s => [
  `Rig_Shoulder_${s}`, `Rig_UpperArm_${s}`, `Rig_Shin_${s}`, `Rig_Foot_${s}`,
])];
const report = {inputSha256: hashes.input, standingReferenceSha256: hashes.stand, referenceYawDegrees: yaw * 180 / Math.PI,
  shoulderInverseReferenceFactor: shoulderFactor, spineWorldPitchDegrees: backDegrees, footWorldYawOutwardDegrees: {},
  shinTwistAroundBoneOutwardDegrees: shin, clips: {},
  method: 'Correct shoulder/upper-arm alignment and local skin separately, move spine/chest slightly back, and yaw feet outward while sharing part of the turn along each shin. Preserve ankle positions and foot roll at rotation keys; this is not planted-foot IK.'};
for (const spec of specs) {
  const animation = root.listAnimations().find(a => a.getName() === spec.old);
  const evaluator = makeEvaluator(root, 'NewBody', spec.old);
  const channels = new Map(animation.listChannels().filter(c => c.getTargetPath() === 'rotation').map(c => [c.getTargetNode().getName(), c]));
  const master = channels.get('Rig_Chest').getSampler().getInput().getArray();
  const arrays = new Map(order.map(name => {
    const sampler = channels.get(name)?.getSampler(); assert.ok(sampler, `Missing rotation channel ${name}`);
    assert.equal(sampler.getInterpolation(), 'LINEAR');
    assert.deepEqual(Array.from(sampler.getInput().getArray()), Array.from(master), `Mismatched keys: ${name}`);
    return [name, new Float32Array(master.length * 4)];
  }));
  let maxAnkleDisplacement = 0, maxFootAngleError = 0;
  for (let i = 0; i < master.length; i++) {
    evaluator.pose(master[i]);
    const old = new Map(order.map(name => [name, Q(evaluator.bones.get(name))]));
    const ankles = new Map(['L', 'R'].map(side => [side, P(evaluator.bones.get(`Rig_Foot_${side}`))]));
    function setWorld(name, desired) {
      const bone = evaluator.bones.get(name);
      bone.quaternion.copy(Q(bone.parent).invert().multiply(desired)).normalize(); evaluator.updateMatrices();
    }
    const back = rotation(xAxis, backDegrees);
    setWorld('Rig_Spine', back.clone().multiply(old.get('Rig_Spine')));
    setWorld('Rig_Chest', back.clone().multiply(old.get('Rig_Chest')));
    setWorld('Rig_Neck', old.get('Rig_Neck'));
    const chestDelta = Q(evaluator.bones.get('Rig_Chest')).multiply(old.get('Rig_Chest').clone().invert());
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? 1 : -1;
      const shoulder = `Rig_Shoulder_${side}`, arm = `Rig_UpperArm_${side}`, lower = `Rig_Shin_${side}`, foot = `Rig_Foot_${side}`;
      setWorld(shoulder, chestDelta.clone().multiply(old.get(shoulder)).multiply(identity.clone().slerp(alignment.get(shoulder), shoulderFactor)));
      setWorld(arm, old.get(arm).clone().multiply(identity.clone().slerp(alignment.get(arm), shoulderFactor)));
      // Rotating about the actual shin-to-ankle axis shares the yaw over the
      // lower leg without the centimetres of ankle translation that a world-Y
      // shin rotation would introduce in bent poses.
      const axis = P(evaluator.bones.get(foot)).sub(P(evaluator.bones.get(lower))).normalize();
      setWorld(lower, rotation(axis, -sign * shin[side]).multiply(old.get(lower)));
      const footWorld = rotation(yAxis, sign * spec.foot[side]).multiply(old.get(foot));
      setWorld(foot, footWorld);
      maxAnkleDisplacement = Math.max(maxAnkleDisplacement, P(evaluator.bones.get(foot)).distanceTo(ankles.get(side)));
      maxFootAngleError = Math.max(maxFootAngleError, Q(evaluator.bones.get(foot)).angleTo(footWorld.normalize()));
    }
    for (const name of order) {
      const arr = arrays.get(name), q = evaluator.bones.get(name).quaternion.clone();
      if (i && new Quaternion().fromArray(arr, (i - 1) * 4).dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      q.toArray(arr, i * 4);
    }
  }
  assert.ok(maxAnkleDisplacement < .000001 && maxFootAngleError < 1e-5);
  for (const [name, arr] of arrays) {
    for (let j = 0; j < 4; j++) arr[arr.length - 4 + j] = arr[j];
    channels.get(name).getSampler().getOutput().setArray(arr);
  }
  animation.setName(spec.name);
  report.footWorldYawOutwardDegrees[spec.name] = spec.foot;
  report.clips[spec.name] = {previous: spec.old, duration: evaluator.duration, rotationKeys: master.length,
    maxAnkleDisplacementMetersAtKeys: maxAnkleDisplacement, maxFootWorldAngleErrorDegreesAtKeys: maxFootAngleError * 180 / Math.PI};
}
await io.write(output, doc);
report.outputSha256 = sha(fs.readFileSync(output));
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log('Authored separate C/C pose trial:', report.clips);
