// CPU evaluation of this pinned rig's linear glTF tracks and skinned soles.
// Based on tools/male-rig-rebuild/pose.mjs, with exposed bones for the baked
// swing-foot correction. It is not a general glTF animation evaluator.
import {Matrix4, Object3D, LinearInterpolant, QuaternionLinearInterpolant} from '../male-library-motion/node_modules/three/build/three.module.js';

export function makeEvaluator(root, meshName, animationName) {
  const meshNode = root.listNodes().find(n => n.getName() === meshName);
  const skin = meshNode?.getSkin(), mesh = meshNode?.getMesh();
  if (!skin || !mesh) throw Error(`Missing skinned mesh ${meshName}`);
  if (meshNode.getWorldMatrix().some((v, i) => Math.abs(v - ([0, 5, 10, 15].includes(i) ? 1 : 0)) > 1e-6))
    throw Error('This evaluator requires an identity mesh world transform');
  const primitive = mesh.listPrimitives()[0];
  if (primitive.listTargets().length) throw Error('Unexpected morph targets on this pinned body');
  const jointNodes = skin.listJoints(), objects = new Map();
  for (const n of jointNodes) {
    const o = new Object3D(); o.name = n.getName(); o.position.fromArray(n.getTranslation());
    o.quaternion.fromArray(n.getRotation()); o.scale.fromArray(n.getScale()); objects.set(n, o);
  }
  for (const n of jointNodes) for (const child of n.listChildren()) if (objects.has(child)) objects.get(n).add(objects.get(child));
  const skeletonRoot = objects.get(skin.getSkeleton());
  if (!skeletonRoot || skeletonRoot.parent) throw Error('Unexpected skeleton root');
  const inverse = skin.getInverseBindMatrices().getArray(), matrices = jointNodes.map(() => new Matrix4());
  const positions = primitive.getAttribute('POSITION').getArray(), joints = primitive.getAttribute('JOINTS_0').getArray();
  const weights = primitive.getAttribute('WEIGHTS_0').getArray();
  const animation = root.listAnimations().find(a => a.getName() === animationName);
  if (!animation) throw Error(`Missing animation ${animationName}`);
  let duration = 0; const tracks = [];
  for (const channel of animation.listChannels()) {
    const sampler = channel.getSampler(), input = sampler.getInput().getArray(), output = sampler.getOutput().getArray(), property = channel.getTargetPath();
    if (sampler.getInterpolation() !== 'LINEAR') throw Error('Only LINEAR tracks supported');
    duration = Math.max(duration, input.at(-1));
    const size = output.length / input.length;
    const interpolant = property === 'rotation' ? new QuaternionLinearInterpolant(input, output, size) : new LinearInterpolant(input, output, size);
    if (objects.has(channel.getTargetNode())) tracks.push({object: objects.get(channel.getTargetNode()), property, interpolant});
  }
  const selected = [[], []];
  for (let i = 0; i < positions.length / 3; i++) {
    const x = positions[3 * i], y = positions[3 * i + 1];
    if (y < .16 && Math.abs(x) > .035 && Math.abs(x) < .25) selected[x > 0 ? 0 : 1].push(i);
  }
  if (!selected[0].length || !selected[1].length) throw Error('Missing selected sole vertices');
  function updateMatrices() {
    skeletonRoot.updateMatrixWorld(true);
    jointNodes.forEach((n, i) => matrices[i].copy(objects.get(n).matrixWorld).multiply(new Matrix4().fromArray(inverse, 16 * i)));
  }
  function pose(t) {
    for (const {object, property, interpolant} of tracks) {
      const value = interpolant.evaluate(t);
      if (property === 'rotation') object.quaternion.fromArray(value);
      else if (property === 'translation') object.position.fromArray(value);
      else if (property === 'scale') object.scale.fromArray(value);
      else throw Error(`Unexpected joint property ${property}`);
    }
    updateMatrices();
  }
  function currentVertex(i) {
    const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
    let fx = 0, fy = 0, fz = 0;
    for (let k = 0; k < 4; k++) {
      const w = weights[4 * i + k]; if (!w) continue;
      const e = matrices[joints[4 * i + k]].elements;
      fx += w * (e[0] * x + e[4] * y + e[8] * z + e[12]);
      fy += w * (e[1] * x + e[5] * y + e[9] * z + e[13]);
      fz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
    return [fx, fy, fz];
  }
  function footDetails(t) {
    pose(t);
    return selected.map(group => {
      let low = Infinity, index = -1, point;
      for (const i of group) { const p = currentVertex(i); if (p[1] < low) { low = p[1]; index = i; point = p; } }
      return {index, point};
    });
  }
  function currentLows() {
    return selected.map(group => {
      let low = Infinity; for (const i of group) low = Math.min(low, currentVertex(i)[1]); return low;
    });
  }
  function lows(t) { pose(t); return currentLows(); }
  function vertex(t, i) { pose(t); return currentVertex(i); }
  function rootTranslation(t) {
    const track = tracks.find(x => x.object === skeletonRoot && x.property === 'translation');
    if (!track) throw Error('Missing root translation');
    return Array.from(track.interpolant.evaluate(t));
  }
  return {duration, lows, currentLows, rootTranslation, footDetails, vertex, pose, updateMatrices,
    bones: new Map([...objects.values()].map(o => [o.name, o])), selected: selected.map(g => g.length)};
}
