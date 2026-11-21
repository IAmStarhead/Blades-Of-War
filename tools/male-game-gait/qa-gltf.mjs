// Structural and sampled checks only; none certify visual quality, continuous
// contact, all collisions, transitions, or compatibility with a game engine.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {Quaternion} from '../male-library-motion/node_modules/three/build/three.module.js';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-game-gait'));
const bytes = fs.readFileSync(path.join(folder, 'male_game_gait_trial.glb'));
const hash = data => createHash('sha256').update(data).digest('hex');
const info = JSON.parse(fs.readFileSync(path.join(folder, 'build-info.json')));
assert.equal(hash(bytes), info.modelSha256); assert.equal(info.modelSha256, info.pose.sha256);
const validator = createRequire(path.join(repo, 'tools/character-showcase/package.json'))('gltf-validator');
const result = await validator.validateBytes(new Uint8Array(bytes), {uri: 'male_game_gait_trial.glb', maxIssues: 10000});
if (result.issues.numErrors || result.issues.numWarnings) console.error(JSON.stringify(result.issues, null, 2));
assert.equal(result.issues.numErrors, 0); assert.equal(result.issues.numWarnings, 0);
console.log(`PASS glTF validator: 0 errors, 0 warnings (${result.issues.numInfos} informational notices)`);

const io = new NodeIO(), previous = (await io.read(path.join(repo, 'work/male-gait-refine/male_gait_C_refined.glb'))).getRoot();
const next = (await io.readBinary(bytes)).getRoot();
const node = (root, name) => { const found = root.listNodes().filter(n => n.getName() === name); assert.equal(found.length, 1); return found[0]; };
const digest = a => { const v = a.getArray(); return hash(Buffer.from(v.buffer, v.byteOffset, v.byteLength)); };
const same = (a, b, label) => { assert.ok(a && b, label); assert.equal(digest(a), digest(b), label); };
const priorSkin = previous.listSkins()[0], skin = next.listSkins()[0];
assert.equal(next.listNodes().length, previous.listNodes().length);
assert.equal(next.listSkins().length, 1); assert.equal(skin.listJoints().length, 52);
assert.deepEqual(skin.listJoints().map(n => n.getName()), priorSkin.listJoints().map(n => n.getName()));
same(skin.getInverseBindMatrices(), priorSkin.getInverseBindMatrices(), 'inverse binds');
for (const oldNode of previous.listNodes()) {
  const newNode = node(next, oldNode.getName());
  assert.equal(newNode.getParentNode()?.getName(), oldNode.getParentNode()?.getName());
  assert.deepEqual(newNode.getTranslation(), oldNode.getTranslation());
  assert.deepEqual(newNode.getRotation(), oldNode.getRotation());
  assert.deepEqual(newNode.getScale(), oldNode.getScale());
  if (!oldNode.getMesh()) { assert.ok(!newNode.getMesh()); continue; }
  const oldPrimitives = oldNode.getMesh().listPrimitives(), newPrimitives = newNode.getMesh().listPrimitives();
  assert.equal(newPrimitives.length, oldPrimitives.length);
  oldPrimitives.forEach((p, i) => {
    const q = newPrimitives[i]; assert.deepEqual(p.listSemantics().sort(), q.listSemantics().sort());
    for (const sem of p.listSemantics()) same(p.getAttribute(sem), q.getAttribute(sem), `${oldNode.getName()} ${sem}`);
    if (p.getIndices()) same(p.getIndices(), q.getIndices(), `${oldNode.getName()} indices`);
    assert.equal(p.listTargets().length, q.listTargets().length);
    for (let k = 0; k < p.listTargets().length; k++) {
      const a = p.listTargets()[k], b = q.listTargets()[k];
      assert.deepEqual(a.listSemantics().sort(), b.listSemantics().sort());
      for (const sem of a.listSemantics()) same(a.getAttribute(sem), b.getAttribute(sem), `${oldNode.getName()} morph ${k} ${sem}`);
    }
  });
}
assert.deepEqual(previous.listTextures().map(t => hash(t.getImage())), next.listTextures().map(t => hash(t.getImage())));
assert.deepEqual(next.listAnimations().map(a => a.getName()), ['Walk_Game_Trial', 'Run_Game_Trial']);
assert.equal(next.listAccessors().filter(a => a.listParents().every(p => p.propertyType === 'Root')).length, 0);
console.log('PASS: prior body/face/ears, mesh attributes, skin, textures, hierarchy and inverse binds retained; old animation tracks and orphan accessors absent.');

for (const [name, expectedDuration] of [['Walk_Game_Trial', 1.0416667], ['Run_Game_Trial', .7333333]]) {
  const anim = next.listAnimations().find(a => a.getName() === name), ev = makeEvaluator(next, 'NewBody', name);
  assert.ok(Math.abs(ev.duration - expectedDuration) < 2e-6);
  for (const channel of anim.listChannels()) {
    const sampler = channel.getSampler(), times = sampler.getInput().getArray(), values = sampler.getOutput().getArray();
    const size = values.length / times.length; assert.equal(sampler.getInterpolation(), 'LINEAR');
    assert.equal(times[0], 0); assert.ok(Math.abs(times.at(-1) - ev.duration) < 2e-6);
    assert.ok(Array.from(values).every(Number.isFinite));
    for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1]);
    if (channel.getTargetPath() === 'rotation') {
      for (let i = 0; i < values.length; i += 4) {
        assert.ok(Math.abs(Math.hypot(...values.slice(i, i + 4)) - 1) < 2e-5);
        if (i) assert.ok(new Quaternion().fromArray(values, i - 4).dot(new Quaternion().fromArray(values, i)) >= 0);
      }
      assert.ok(new Quaternion().fromArray(values, 0).angleTo(new Quaternion().fromArray(values, values.length - 4)) < .001);
    } else for (let j = 0; j < size; j++) assert.equal(values[j], values[values.length - size + j]);
  }
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 4096; i++) {
    const low = Math.min(...ev.lows(ev.duration * (i + .31) / 4096)); min = Math.min(min, low); max = Math.max(max, low);
  }
  assert.ok(min > -.003, `sampled lowest sole below -3 mm: ${min}`);
  if (name.startsWith('Walk')) assert.ok(max < .015); else assert.ok(max > .04 && max < .15);
  console.log(`PASS ${name}: ${ev.duration.toFixed(6)} s, finite normalized rotations and closed endpoints; 4096 sampled lowest-sole heights ${(min * 1000).toFixed(2)}–${(max * 1000).toFixed(2)} mm.`);
}
console.log('NOTE: sampled sole heights are not planted-foot locking or a whole-animation collision guarantee.');
