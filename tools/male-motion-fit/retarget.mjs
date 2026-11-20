// Retarget the two selected ACCAD Male 2 windows to an exact copy of the
// delivered 52-joint rig. The BVH's zero-rotation skeleton is NOT its stand:
// its companion stand-to-walk recording supplies the actor's reference pose.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {Accessor, NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {BVHLoader} from '../male-library-motion/node_modules/three/examples/jsm/loaders/BVHLoader.js';
import {AnimationMixer, Object3D, Quaternion, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const rigPath = path.join(repo, 'work/male-rig-rebuild/male_rig_rebuild.glb');
const referencePath = path.join(here, 'sources/accad_male2_stand_to_walk.bvh');
const sourceDir = path.join(repo, 'tools/male-motion-candidates/sources');
const sourceSha = {
  rig: '8c92f19a522d287ea8bd3fb2a683b27cc7bdc36b0adc4f3aa7ca7de86d11755c',
  stand: 'deb6cf43aa2faaaccd734853dff8567736a49126e1263aee532478d49beea7c6',
  walk: '6cf2fcba98c7dc5c827896edccc16a8a9444350a8833a24e8ac7f6267c81cab3',
  run: 'ef33bc8c0c3472f35cb01f494265bdf383dcff006efbe88d0762ab1572f0021c',
};
const specs = [
  {mode: 'walk', animation: 'Walk_C', file: 'accad_male2_walk.bvh', frames: [271, 391], fps: 120, spreadDegrees: 12, thighScale: 1},
  {mode: 'run', animation: 'Run_C', file: 'accad_male2_run.bvh', frames: [11, 34], fps: 30, spreadDegrees: 16, thighScale: .90},
];
if (process.argv.length !== 4) throw Error('Usage: node retarget.mjs raw.glb intermediate.json');
const [output, infoPath] = process.argv.slice(2).map(p => path.resolve(p));
for (const dest of [output, infoPath]) {
  if (dest === rigPath || (dest.startsWith(repo + path.sep) && !dest.startsWith(path.join(repo, 'work/male-motion-fit') + path.sep)))
    throw Error('Refusing to write into the input or an unrelated repository directory');
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const checked = (p, expected) => { const bytes = fs.readFileSync(p); assert.equal(sha(bytes), expected, 'Unexpected source: ' + p); return bytes; };
const rigBytes = checked(rigPath, sourceSha.rig);
checked(referencePath, sourceSha.stand);
for (const s of specs) checked(path.join(sourceDir, s.file), sourceSha[s.mode]);
const io = new NodeIO(), doc = await io.readBinary(rigBytes), root = doc.getRoot(), buffer = root.listBuffers()[0];
assert.deepEqual(root.listAnimations().map(a => a.getName()), ['Walk_NewBody', 'Run_NewBody']);

function readBvh(p) {
  const {skeleton, clip} = new BVHLoader().parse(fs.readFileSync(p, 'utf8'));
  const root = skeleton.bones[0], mixer = new AnimationMixer(root), action = mixer.clipAction(clip).play();
  action.paused = true;
  const bones = new Map(skeleton.bones.map(b => [b.name, b]));
  return {root, clip, bones, pose(time) { action.time = time; mixer.update(0); root.updateMatrixWorld(true); }};
}
const reference = readBvh(referencePath);
reference.pose(0);
const nodes = root.listSkins()[0].listJoints();
assert.equal(nodes.length, 52);
const targetNodes = new Map(nodes.map(n => [n.getName(), n])), target = new Map();
for (const n of nodes) {
  const o = new Object3D(); o.name = n.getName();
  o.position.fromArray(n.getTranslation()); o.quaternion.fromArray(n.getRotation()); o.scale.fromArray(n.getScale());
  target.set(o.name, o);
}
for (const n of nodes) {
  const parent = n.getParentNode();
  if (parent && target.has(parent.getName())) target.get(parent.getName()).add(target.get(n.getName()));
}
const targetRoot = target.get('Rig_Root'); targetRoot.updateMatrixWorld(true);
const P = o => o.getWorldPosition(new Vector3());
const Q = o => o.getWorldQuaternion(new Quaternion()).normalize();
const up = new Vector3(0, 1, 0);
// Align the actor's standing left/right hip axis to the character's X axis.
const hipAxis = P(reference.bones.get('LeftUpLeg')).sub(P(reference.bones.get('RightUpLeg')));
const standYaw = Math.atan2(hipAxis.z, hipAxis.x);
const standTurn = new Quaternion().setFromAxisAngle(up, standYaw);
const mapping = [
  ['Rig_Hips', 'ToSpine', 'Rig_Spine', 'Spine'],
  ['Rig_Spine', 'Spine', 'Rig_Chest', 'Spine1'],
  ['Rig_Chest', 'Spine1', 'Rig_Neck', 'Neck'],
  ['Rig_Neck', 'Neck', 'Rig_Head', 'Head'],
  ['Rig_Head', 'Head', null, 'ENDSITE'],
];
for (const [side, src] of [['L', 'Left'], ['R', 'Right']]) mapping.push(
  [`Rig_Shoulder_${side}`, `${src}Shoulder`, `Rig_UpperArm_${side}`, `${src}Arm`],
  [`Rig_UpperArm_${side}`, `${src}Arm`, `Rig_Forearm_${side}`, `${src}ForeArm`],
  [`Rig_Forearm_${side}`, `${src}ForeArm`, `Rig_Hand_${side}`, `${src}Hand`],
  [`Rig_Hand_${side}`, `${src}Hand`, null, null],
  [`Rig_Thigh_${side}`, `${src}UpLeg`, `Rig_Shin_${side}`, `${src}Leg`],
  [`Rig_Shin_${side}`, `${src}Leg`, `Rig_Foot_${side}`, `${src}Foot`],
  [`Rig_Foot_${side}`, `${src}Foot`, `Rig_Toes_${side}`, `${src}ToeBase`],
  [`Rig_Toes_${side}`, `${src}ToeBase`, null, null],
);
const referenceQ = new Map(), alignment = new Map();
for (const [targetName, sourceName, targetChild, sourceChild] of mapping) {
  const sb = reference.bones.get(sourceName), tb = target.get(targetName);
  assert.ok(sb && tb, `${targetName}/${sourceName}`);
  referenceQ.set(targetName, standTurn.clone().multiply(Q(sb)));
  if (sourceChild) {
    const child = sourceChild === 'ENDSITE' ? sb.children[0] : reference.bones.get(sourceChild);
    assert.ok(child);
    const srcDirection = P(child).sub(P(sb)).applyQuaternion(standTurn).normalize();
    const tgtDirection = targetChild ? P(target.get(targetChild)).sub(P(tb)).normalize() : new Vector3(0, 1, 0);
    alignment.set(targetName, new Quaternion().setFromUnitVectors(tgtDirection, srcDirection));
  }
}
for (const side of ['L', 'R']) {
  alignment.set(`Rig_Hand_${side}`, alignment.get(`Rig_Forearm_${side}`).clone());
  alignment.set(`Rig_Toes_${side}`, alignment.get(`Rig_Foot_${side}`).clone());
}
const targetLeg = P(target.get('Rig_Thigh_L')).distanceTo(P(target.get('Rig_Shin_L'))) + P(target.get('Rig_Shin_L')).distanceTo(P(target.get('Rig_Foot_L')));
const sourceLeg = .01 * (P(reference.bones.get('LeftUpLeg')).distanceTo(P(reference.bones.get('LeftLeg'))) + P(reference.bones.get('LeftLeg')).distanceTo(P(reference.bones.get('LeftFoot'))));
const scale = targetLeg / sourceLeg;
const smooth = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const info = {rigSha256: sourceSha.rig, referenceSha256: sourceSha.stand, standYawRadians: standYaw, legScale: scale, clips: {}};

for (const spec of specs) {
  const source = readBvh(path.join(sourceDir, spec.file));
  // Check named skeleton offsets/parents rather than assuming any Male 2 BVH
  // uses identical topology. Root offset and duplicated ENDSITE names differ.
  for (const [name, bone] of source.bones) {
    const ref = reference.bones.get(name);
    if (name === 'Hips' || name === 'ENDSITE' || !ref) continue;
    assert.ok(bone.position.distanceTo(ref.position) < 1e-4, `Different skeleton offset ${name}`);
    assert.equal(bone.parent?.name, ref.parent?.name, `Different parent ${name}`);
  }
  const track = source.clip.tracks.find(t => t.name === 'Hips.position');
  assert.ok(track && source.root.name === 'Hips');
  const [a, b] = spec.frames, t0 = track.times[a], t1 = track.times[b], duration = t1 - t0;
  assert.ok(Math.abs(1 / track.times[1] - spec.fps) < .002 && b < track.times.length - 1);
  const frames = Math.round(duration * 120), times = new Float32Array(frames + 1);
  const dx = track.values[b * 3] - track.values[a * 3], dz = track.values[b * 3 + 2] - track.values[a * 3 + 2];
  const yaw = -Math.atan2(dx, dz), turn = new Quaternion().setFromAxisAngle(up, yaw);
  const first = new Vector3(track.values[a * 3], track.values[a * 3 + 1], track.values[a * 3 + 2]);
  // Same three source foot markers and floor estimate used in the selection viewer.
  function sourceFeet() {
    return ['Left', 'Right'].map(side => {
      const toe = source.bones.get(side + 'ToeBase');
      return Math.min(...[source.bones.get(side + 'Foot'), toe, toe.children[0]].map(o => P(o).y));
    });
  }
  let floorCm = Infinity;
  for (let i = a; i <= b; i++) { source.pose(track.times[i]); floorCm = Math.min(floorCm, ...sourceFeet()); }
  const values = new Map(mapping.map(([name]) => [name, new Float32Array((frames + 1) * 4)]));
  const roots = new Float32Array((frames + 1) * 3), sourceClear = [], feet = [[], []], previous = new Map();
  let maxDirectionError = 0;
  for (let i = 0; i <= frames; i++) {
    const u = i / frames, time = t0 + u * duration; times[i] = u * duration; source.pose(time);
    targetRoot.position.set(0, 0, 0);
    for (const n of nodes) { const o = target.get(n.getName()); o.quaternion.fromArray(n.getRotation()); o.scale.fromArray(n.getScale()); }
    targetRoot.updateMatrixWorld(true);
    // Global rest-relative rotations plus bone-direction alignment: source and
    // destination axes are not interchangeable local quaternions.
    for (const [targetName, sourceName, targetChild, sourceChild] of mapping) {
      const o = target.get(targetName), sb = source.bones.get(sourceName);
      const world = turn.clone().multiply(Q(sb)).multiply(referenceQ.get(targetName).clone().invert()).multiply(alignment.get(targetName)).normalize();
      o.quaternion.copy(Q(o.parent).invert().multiply(world)).normalize(); targetRoot.updateMatrixWorld(true);
      if (targetChild && sourceChild) {
        const s = P(source.bones.get(sourceChild)).sub(P(sb)).applyQuaternion(turn).normalize();
        const d = P(target.get(targetChild)).sub(P(o)).normalize();
        maxDirectionError = Math.max(maxDirectionError, s.angleTo(d));
      }
    }
    // These are explicit fitting adjustments, not the untouched actor motion.
    // Arm spread helps clear this continuous armpit; the stronger run hip swing
    // is reduced slightly because it pinched this body's pelvis on first fit.
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      target.get(`Rig_UpperArm_${side}`).quaternion.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), sign * spec.spreadDegrees * Math.PI / 180));
      target.get(`Rig_Thigh_${side}`).quaternion.slerp(new Quaternion(), 1 - spec.thighScale);
    }
    targetRoot.updateMatrixWorld(true);
    for (const [name] of mapping) {
      const q = target.get(name).quaternion.clone(), last = previous.get(name);
      if (last && last.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      q.toArray(values.get(name), i * 4); previous.set(name, q);
    }
    // Remove only average horizontal travel, keeping the in-cycle sway.
    const delta = P(source.root).sub(first); delta.x -= dx * u; delta.z -= dz * u;
    delta.applyQuaternion(turn).multiplyScalar(.01 * scale).toArray(roots, i * 3);
    const rawFeet = sourceFeet();
    for (let side = 0; side < 2; side++) feet[side].push((rawFeet[side] - floorCm) * .01 * scale);
    sourceClear.push((Math.min(...rawFeet) - floorCm) * .01 * scale);
  }
  // Ease additive endpoint corrections over 12% at each end; unlike blending
  // the whole pose to a constant, this largely retains the source velocities.
  const seamFrames = Math.max(2, Math.round(frames * .12));
  let maxSeamCorrection = 0;
  for (const arr of values.values()) {
    const q0 = new Quaternion().fromArray(arr, 0), q1 = new Quaternion().fromArray(arr, frames * 4);
    if (q0.dot(q1) < 0) q1.set(-q1.x, -q1.y, -q1.z, -q1.w);
    const mid = q0.clone().slerp(q1, .5), c0 = mid.clone().multiply(q0.clone().invert()), c1 = mid.clone().multiply(q1.clone().invert());
    for (let i = 0; i <= frames; i++) {
      const f = i < seamFrames ? 1 - smooth(i / seamFrames) : i > frames - seamFrames ? smooth((i - (frames - seamFrames)) / seamFrames) : 0;
      if (!f) continue;
      const old = new Quaternion().fromArray(arr, i * 4), correction = new Quaternion().slerp(i < frames / 2 ? c0 : c1, f);
      const now = correction.multiply(old).normalize(); maxSeamCorrection = Math.max(maxSeamCorrection, old.angleTo(now));
      if (i && new Quaternion().fromArray(arr, (i - 1) * 4).dot(now) < 0) now.set(-now.x, -now.y, -now.z, -now.w);
      now.toArray(arr, i * 4);
    }
    for (let j = 0; j < 4; j++) arr[frames * 4 + j] = arr[j];
  }
  const sourceFirst = sourceClear[0], sourceLast = sourceClear[frames], sourceMid = (sourceFirst + sourceLast) / 2;
  const feetFirst = feet.map(a => a[0]), feetLast = feet.map(a => a[frames]), feetMid = feetFirst.map((v, j) => (v + feetLast[j]) / 2);
  const rootFirst = Array.from(roots.slice(0, 3)), rootLast = Array.from(roots.slice(frames * 3, frames * 3 + 3));
  const rootMid = rootFirst.map((v, j) => (v + rootLast[j]) / 2);
  for (let i = 0; i <= frames; i++) {
    const f = i < seamFrames ? 1 - smooth(i / seamFrames) : i > frames - seamFrames ? smooth((i - (frames - seamFrames)) / seamFrames) : 0;
    if (!f) continue;
    for (let j = 0; j < 3; j++) roots[i * 3 + j] += (rootMid[j] - (i < frames / 2 ? rootFirst[j] : rootLast[j])) * f;
    sourceClear[i] += (sourceMid - (i < frames / 2 ? sourceFirst : sourceLast)) * f;
    for (let j = 0; j < 2; j++) feet[j][i] += (feetMid[j] - (i < frames / 2 ? feetFirst[j] : feetLast[j])) * f;
  }
  for (let j = 0; j < 3; j++) roots[frames * 3 + j] = roots[j];
  sourceClear[frames] = sourceClear[0];
  for (let j = 0; j < 2; j++) feet[j][frames] = feet[j][0];
  function add(anim, nodeName, targetPath, type, arr) {
    const input = doc.createAccessor(`${spec.animation}_${nodeName}_time`, buffer).setType(Accessor.Type.SCALAR).setArray(times);
    const output = doc.createAccessor(`${spec.animation}_${nodeName}_${targetPath}`, buffer).setType(type).setArray(arr);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(targetNodes.get(nodeName)).setTargetPath(targetPath).setSampler(sampler));
  }
  const anim = doc.createAnimation(spec.animation);
  add(anim, 'Rig_Root', 'translation', Accessor.Type.VEC3, roots);
  for (const [name, arr] of values) add(anim, name, 'rotation', Accessor.Type.VEC4, arr);
  info.clips[spec.animation] = {
    sourceFile: spec.file, sourceSha256: sourceSha[spec.mode], sourceFramesZeroBased: spec.frames,
    frameRate: spec.fps, duration, frames, floorCm, yawRadians: yaw,
    sourceSpeedMps: Math.hypot(dx, dz) * .01 / duration,
    scaledSourceSpeedMps: Math.hypot(dx, dz) * .01 * scale / duration,
    armSpreadDegrees: spec.spreadDegrees, thighRotationScale: spec.thighScale,
    maxPreAdjustmentDirectionErrorDegrees: maxDirectionError * 180 / Math.PI,
    seamWindowFramesEachEnd: seamFrames, maxSeamCorrectionDegrees: maxSeamCorrection * 180 / Math.PI,
    sourceClear, sourceFeet: feet,
  };
  console.log(`${spec.animation}: ${duration.toFixed(3)} s, ${frames + 1} keys, seam correction max ${(maxSeamCorrection * 180 / Math.PI).toFixed(2)}°`);
}
await io.write(output, doc);
fs.writeFileSync(infoPath, JSON.stringify(info, null, 2) + '\n');
