// Add a reversible, pose-driven knee-volume experiment to the last delivered
// character. Base surface, skin weights, skeleton and existing tracks remain
// unchanged. Two standard glTF morph targets and one weights channel per clip
// are added. Runtime must update those weights after mixing and any leg IK.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {Accessor, NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {BufferAttribute, BufferGeometry, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';
import {KNEE_VOLUME_GAIN, kneeVolumeWeight} from './knee-volume.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(repo, 'work/male-hand-flight/male_hands_airfoot_trial.glb');
const own = path.join(repo, 'work/male-leg-volume');
const expected = '576077e068f2c48a88c208be0ad72b4214e42164d1e5b0f0f9f7050f3967e2bf';
if (process.argv.length !== 4) throw Error('Usage: node author.mjs OUTPUT.glb REPORT.json');
const [output, reportPath] = process.argv.slice(2).map(p => path.resolve(p));
assert.notEqual(output, reportPath);
for (const p of [output, reportPath])
  if (p === repo || (p.startsWith(repo + path.sep) && !p.startsWith(own + path.sep)))
    throw Error('Refusing to overwrite another delivery or unrelated work: ' + p);
const sha = b => createHash('sha256').update(b).digest('hex'), bytes = fs.readFileSync(source);
assert.equal(sha(bytes), expected, 'Unexpected source model');
const io = new NodeIO(), doc = await io.readBinary(bytes), root = doc.getRoot();
const sourceRoot = (await io.readBinary(bytes)).getRoot(), buffer = root.listBuffers()[0];
const matches = root.listNodes().filter(n => n.getName() === 'NewBody'); assert.equal(matches.length, 1);
const node = matches[0], mesh = node.getMesh(), primitive = mesh.listPrimitives()[0], skin = node.getSkin();
assert.equal(mesh.listPrimitives().length, 1); assert.equal(primitive.listTargets().length, 0);
assert.deepEqual(root.listAnimations().map(a => a.getName()), ['Walk_Game_Trial', 'Run_Game_Trial']);
const names = skin.listJoints().map(j => j.getName()), positions = primitive.getAttribute('POSITION').getArray();
const normals = primitive.getAttribute('NORMAL').getArray(), joints = primitive.getAttribute('JOINTS_0').getArray();
const weights = primitive.getAttribute('WEIGHTS_0').getArray(), indices = primitive.getIndices().getArray();
assert.equal(positions.length, 14703 * 3);
const influence = (i, joint) => {
  let value = 0; for (let k = 0; k < 4; k++) if (joints[4 * i + k] === joint) value += weights[4 * i + k];
  return value;
};

// Find the rear edge of each horizontal rest-space cross-section. The body is
// symmetric and separates into two legs in this interval. Anchoring the rear
// edge avoids pushing the already-compressed inner crease into itself as the
// anterior side expands. The correction remains local to this pinned rig.
function rearEdgeAt(y, side) {
  const sign = side === 'L' ? 1 : -1; let low = Infinity, high = -Infinity;
  for (let a = 0; a < indices.length; a += 3) {
    const tri = [indices[a], indices[a + 1], indices[a + 2]];
    if (!tri.every(i => positions[3 * i] * sign > .015 && positions[3 * i] * sign < .25)) continue;
    for (let k = 0; k < 3; k++) {
      const i = tri[k], j = tri[(k + 1) % 3], yi = positions[3 * i + 1], yj = positions[3 * j + 1];
      if ((yi - y) * (yj - y) >= 0) continue;
      const t = (y - yi) / (yj - yi), z = positions[3 * i + 2] * (1 - t) + positions[3 * j + 2] * t;
      low = Math.min(low, z); high = Math.max(high, z);
    }
  }
  assert.ok(Number.isFinite(low) && high > low, `Missing leg slice ${side} ${y}`);
  return low;
}
function geometricNormals(vertices) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(vertices, 3)); geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals(); const result = geometry.getAttribute('normal').array; geometry.dispose(); return result;
}
const baseGeometricNormals = geometricNormals(positions), report = {
  source: path.relative(repo, source), sourceSha256: expected, gain: KNEE_VOLUME_GAIN, maskPower: 1.35,
  method: 'Two bind-space depth morphs, localized by the existing thigh/shin blend; pose-angle driver approximates 85% compensation of linear-blend shrink. Keyed for each original clip and recomputed after transition/terrain IK in the viewer.',
  targets: [], clips: [],
};
for (const side of ['L', 'R']) {
  const thigh = names.indexOf('Rig_Thigh_' + side), shin = names.indexOf('Rig_Shin_' + side);
  assert.ok(thigh >= 0 && shin >= 0);
  assert.deepEqual(skin.listJoints()[shin].getRotation(), [0, 0, 0, 1], 'Driver assumes an identity knee bind rotation');
  const anchors = Array.from({length: 73}, (_, i) => rearEdgeAt(.35 + i * .005, side));
  const rearEdge = y => {
    const f = Math.max(0, Math.min(71.999999, (y - .35) / .005)), i = Math.floor(f), t = f - i;
    return anchors[i] * (1 - t) + anchors[i + 1] * t;
  };
  const delta = new Float32Array(positions.length), morphed = Float32Array.from(positions);
  let changed = 0, maxDelta = 0, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < positions.length / 3; i++) {
    const a = influence(i, thigh), b = influence(i, shin), mass = a + b;
    if (mass < .01) continue;
    // The existing smooth weight field determines where the volume correction
    // fades. The exponent reduces over-expansion at the edges of the joint.
    const mask = Math.pow(4 * a * b / (mass * mass), 1.35) * mass;
    const y = positions[3 * i + 1], dz = (positions[3 * i + 2] - rearEdge(y)) * mask;
    if (Math.abs(dz) <= 1e-9) continue;
    assert.ok(y > .35 && y < .72 && positions[3 * i] * (side === 'L' ? 1 : -1) > 0);
    delta[3 * i + 2] = dz; morphed[3 * i + 2] += dz; changed++;
    minY = Math.min(minY, y); maxY = Math.max(maxY, y); maxDelta = Math.max(maxDelta, Math.abs(dz));
  }
  assert.ok(changed > 200 && changed < 500);
  const newGeometricNormals = geometricNormals(morphed), normalDelta = new Float32Array(normals.length);
  let changedNormals = 0, maxNormalDelta = 0;
  for (let i = 0; i < normals.length; i += 3) {
    const diff = new Vector3().fromArray(newGeometricNormals, i).sub(new Vector3().fromArray(baseGeometricNormals, i));
    if (diff.lengthSq() < 1e-18) continue;
    const old = new Vector3().fromArray(normals, i), next = old.clone().add(diff).normalize(), d = next.sub(old);
    d.toArray(normalDelta, i); changedNormals++; maxNormalDelta = Math.max(maxNormalDelta, d.length());
  }
  const target = doc.createPrimitiveTarget('KneeVolume_' + side);
  target.setAttribute('POSITION', doc.createAccessor(`KneeVolume_${side}_position`, buffer).setType(Accessor.Type.VEC3).setArray(delta));
  target.setAttribute('NORMAL', doc.createAccessor(`KneeVolume_${side}_normal`, buffer).setType(Accessor.Type.VEC3).setArray(normalDelta));
  primitive.addTarget(target);
  report.targets.push({side, positionVertices: changed, normalVertices: changedNormals, restYRange: [minY, maxY], maxUnitPositionDelta: maxDelta, maxUnitNormalDelta: maxNormalDelta});
}
mesh.setWeights([0, 0]);

// Standard clip-only playback remains corrected in an ordinary glTF viewer.
// The blended/IK pose in our separate runtime needs a post-IK update instead.
for (const animation of root.listAnimations()) {
  const evaluator = makeEvaluator(sourceRoot, 'NewBody', animation.getName()), keys = 257;
  const times = new Float32Array(keys), values = new Float32Array(keys * 2); let maximumWeight = 0;
  for (let i = 0; i < keys; i++) {
    const t = i * evaluator.duration / (keys - 1); times[i] = t;
    if (i === keys - 1) { values[2 * i] = values[0]; values[2 * i + 1] = values[1]; continue; }
    evaluator.pose(t);
    for (let k = 0; k < 2; k++) {
      const q = evaluator.bones.get('Rig_Shin_' + ['L', 'R'][k]).quaternion;
      values[2 * i + k] = kneeVolumeWeight(q); maximumWeight = Math.max(maximumWeight, values[2 * i + k]);
    }
  }
  const input = doc.createAccessor(animation.getName() + '_volume_times', buffer).setType(Accessor.Type.SCALAR).setArray(times);
  const outputAccessor = doc.createAccessor(animation.getName() + '_volume_weights', buffer).setType(Accessor.Type.SCALAR).setArray(values);
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(outputAccessor).setInterpolation('LINEAR');
  animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('weights').setSampler(sampler));
  report.clips.push({name: animation.getName(), duration: evaluator.duration, keys, maximumWeight});
}
fs.mkdirSync(path.dirname(output), {recursive: true}); fs.mkdirSync(path.dirname(reportPath), {recursive: true});
await io.write(output, doc); report.outputSha256 = sha(fs.readFileSync(output));
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Authored separate leg-volume GLB: ${report.outputSha256}`);
