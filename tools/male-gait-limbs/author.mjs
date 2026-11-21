// Narrow the walking arms and turn the feet outward in the accepted game-gait
// trial. Only four walking and two running rotation tracks are changed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Quaternion, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';

if (process.argv.length !== 4) throw Error('Usage: node author.mjs OUTPUT.glb REPORT.json');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const input = path.join(repo, 'work/male-game-gait/male_game_gait_trial.glb');
const allowed = path.join(repo, 'work/male-gait-limbs');
const [output, reportPath] = process.argv.slice(2).map(p => path.resolve(p));
assert.notEqual(output, reportPath);
for (const dest of [output, reportPath]) {
  if (dest === repo || (dest.startsWith(repo + path.sep) && !dest.startsWith(allowed + path.sep)))
    throw Error('Refusing to overwrite a previous delivery or unrelated work: ' + dest);
}
const sha = b => createHash('sha256').update(b).digest('hex');
const source = fs.readFileSync(input), expected = '844de26eb624dcb6b630157dda1227b6be2c54e4654c35d086c74149be26f45a';
assert.equal(sha(source), expected, 'The input must be the reviewed 2017 game-gait trial');
const io = new NodeIO(), doc = await io.readBinary(source), root = doc.getRoot();
assert.deepEqual(root.listAnimations().map(a => a.getName()), ['Walk_Game_Trial', 'Run_Game_Trial']);
const degrees = Math.PI / 180, Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);
const world = node => node.getWorldQuaternion(new Quaternion()).normalize();
// Left/right differ because the original foot angles and arm clearances differ.
const outward = {Walk_Game_Trial: {L: 12, R: 14}, Run_Game_Trial: {L: 8, R: 18}};
const armCloser = {L: 12, R: 7};
const report = {input: 'work/male-game-gait/male_game_gait_trial.glb', inputSha256: expected,
  changedRotationTracks: {Walk_Game_Trial: ['Rig_Foot_L', 'Rig_Foot_R', 'Rig_UpperArm_L', 'Rig_UpperArm_R'],
    Run_Game_Trial: ['Rig_Foot_L', 'Rig_Foot_R']}, outwardWorldYawDegrees: outward, walkingArmInwardDegrees: armCloser,
  method: 'At each original key, pre-rotate each foot about world up around its ankle; toe rotation inherits that transform. In walking only, pre-rotate each upper arm inward about its parent Z. Other tracks, timing, root, rest pose and skin are unchanged. This is not foot locking.', clips: {}};
for (const clipName of ['Walk_Game_Trial', 'Run_Game_Trial']) {
  const animation = root.listAnimations().find(a => a.getName() === clipName);
  const evaluator = makeEvaluator(root, 'NewBody', clipName);
  const channels = new Map(animation.listChannels().filter(c => c.getTargetPath() === 'rotation')
    .map(c => [c.getTargetNode().getName(), c]));
  const clip = {durationSeconds: evaluator.duration, footKeys: {}};
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    const channel = channels.get('Rig_Foot_' + side); assert.ok(channel, 'Missing foot track');
    const sampler = channel.getSampler(), times = sampler.getInput().getArray(), original = sampler.getOutput().getArray();
    assert.equal(sampler.getInterpolation(), 'LINEAR'); assert.equal(original.length, times.length * 4);
    const last = times.length - 1, changed = new Float32Array(original.length);
    for (let i = 0; i < last; i++) {
      evaluator.pose(times[i]);
      const foot = evaluator.bones.get('Rig_Foot_' + side);
      const parentWorld = world(foot.parent);
      const desiredWorld = new Quaternion().setFromAxisAngle(Y, sign * outward[clipName][side] * degrees).multiply(world(foot));
      const local = parentWorld.invert().multiply(desiredWorld).normalize();
      if (i && new Quaternion().fromArray(changed, (i - 1) * 4).dot(local) < 0)
        local.set(-local.x, -local.y, -local.z, -local.w);
      local.toArray(changed, i * 4);
    }
    changed.set(changed.slice(0, 4), last * 4); sampler.getOutput().setArray(changed);
    clip.footKeys[side] = times.length;
    if (clipName === 'Walk_Game_Trial') {
      const armChannel = channels.get('Rig_UpperArm_' + side); assert.ok(armChannel, 'Missing upper-arm track');
      const armSampler = armChannel.getSampler(), values = armSampler.getOutput().getArray();
      assert.equal(armSampler.getInterpolation(), 'LINEAR');
      assert.deepEqual(Array.from(armSampler.getInput().getArray()), Array.from(times));
      const narrowed = new Float32Array(values.length);
      for (let i = 0; i < values.length - 4; i += 4) {
        const q = new Quaternion().setFromAxisAngle(Z, -sign * armCloser[side] * degrees)
          .multiply(new Quaternion().fromArray(values, i)).normalize();
        if (i && new Quaternion().fromArray(narrowed, i - 4).dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        q.toArray(narrowed, i);
      }
      narrowed.set(narrowed.slice(0, 4), narrowed.length - 4); armSampler.getOutput().setArray(narrowed);
    }
  }
  report.clips[clipName] = clip;
}
fs.mkdirSync(path.dirname(output), {recursive: true}); fs.mkdirSync(path.dirname(reportPath), {recursive: true});
await io.write(output, doc);
report.outputSha256 = sha(fs.readFileSync(output));
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Authored ${output}: ${report.outputSha256}`);
