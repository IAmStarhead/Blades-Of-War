// Reproduce the reported upper-platform run pose on the unmodified source and
// compare linear-blend skinning against a CPU dual-quaternion counterfactual.
// The latter is an investigation, not the correction shipped in the GLB.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Matrix4, Quaternion, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = (await new NodeIO().read(path.join(repo, 'work/male-hand-flight/male_hands_airfoot_trial.glb'))).getRoot();
const node = root.listNodes().find(n => n.getName() === 'NewBody'), skin = node.getSkin(), prim = node.getMesh().listPrimitives()[0];
const p = prim.getAttribute('POSITION').getArray(), w = prim.getAttribute('WEIGHTS_0').getArray(), j = prim.getAttribute('JOINTS_0').getArray();
const triangles = prim.getIndices().getArray(), names = skin.listJoints().map(n => n.getName()), shin = names.indexOf('Rig_Shin_L');
const inverse = skin.getInverseBindMatrices().getArray(), evalRun = makeEvaluator(root, 'NewBody', 'Run_Game_Trial');
const y = .5332, phase = .8082678539918424; evalRun.pose(evalRun.duration * phase);
const matrices = skin.listJoints().map((n, i) => evalRun.bones.get(n.getName()).matrixWorld.clone().multiply(new Matrix4().fromArray(inverse, 16 * i)));
const point = i => new Vector3(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
const weight = (i, id) => { let value = 0; for (let k = 0; k < 4; k++) if (j[4 * i + k] === id) value += w[4 * i + k]; return value; };
const edges = new Map();
for (let a = 0; a < triangles.length; a += 3) {
  const tri = [triangles[a], triangles[a + 1], triangles[a + 2]];
  if (!tri.every(i => p[3 * i] > .015 && p[3 * i] < .25)) continue;
  for (let k = 0; k < 3; k++) {
    let i = tri[k], b = tri[(k + 1) % 3], yi = p[3 * i + 1], yj = p[3 * b + 1];
    if ((yi - y) * (yj - y) >= 0) continue;
    let t = (y - yi) / (yj - yi); if (i > b) { [i, b] = [b, i]; t = 1 - t; }
    edges.set(i + ',' + b, {i, b, t, rest: point(i).lerp(point(b), t), shin: weight(i, shin) * (1 - t) + weight(b, shin) * t});
  }
}
const ring = [...edges.values()]; assert.ok(ring.length >= 12);
const blend = ring.reduce((sum, e) => sum + e.shin, 0) / ring.length;
const upper = evalRun.bones.get('Rig_Thigh_L').getWorldQuaternion(new Quaternion());
const lower = evalRun.bones.get('Rig_Shin_L').getWorldQuaternion(new Quaternion());
const axis = new Vector3(0, 0, 1).applyQuaternion(upper).multiplyScalar(1 - blend)
  .addScaledVector(new Vector3(0, 0, 1).applyQuaternion(lower), blend).normalize();
function vertex(i, dual) {
  if (!dual) {
    const out = new Vector3(); for (let k = 0; k < 4; k++) if (w[4 * i + k])
      out.addScaledVector(point(i).applyMatrix4(matrices[j[4 * i + k]]), w[4 * i + k]);
    return out;
  }
  // Standard normalized dual-quaternion blending of the same rigid bone
  // transforms, locally simulated only as a counterfactual diagnostic.
  const real = new Quaternion(0, 0, 0, 0), dualPart = new Quaternion(0, 0, 0, 0); let reference = null;
  for (let k = 0; k < 4; k++) {
    const wk = w[4 * i + k]; if (!wk) continue;
    const m = matrices[j[4 * i + k]], q = new Quaternion().setFromRotationMatrix(m), t = new Vector3().setFromMatrixPosition(m);
    if (!reference) reference = q.clone(); if (q.dot(reference) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    const d = new Quaternion(t.x, t.y, t.z, 0).multiply(q);
    real.set(real.x + wk * q.x, real.y + wk * q.y, real.z + wk * q.z, real.w + wk * q.w);
    dualPart.set(dualPart.x + .5 * wk * d.x, dualPart.y + .5 * wk * d.y, dualPart.z + .5 * wk * d.z, dualPart.w + .5 * wk * d.w);
  }
  const n = real.length(); real.set(real.x / n, real.y / n, real.z / n, real.w / n);
  dualPart.set(dualPart.x / n, dualPart.y / n, dualPart.z / n, dualPart.w / n);
  const t = dualPart.multiply(real.clone().conjugate());
  return point(i).applyQuaternion(real).add(new Vector3(2 * t.x, 2 * t.y, 2 * t.z));
}
const rest = ring.map(e => e.rest.z), linear = ring.map(e => vertex(e.i, false).lerp(vertex(e.b, false), e.t).dot(axis));
const dual = ring.map(e => vertex(e.i, true).lerp(vertex(e.b, true), e.t).dot(axis));
const range = v => Math.max(...v) - Math.min(...v);
const angle = evalRun.bones.get('Rig_Shin_L').quaternion.angleTo(new Quaternion());
const report = {runPhase: phase, restRingY: y, edgeCount: ring.length, shinWeightRange: [Math.min(...ring.map(e => e.shin)), Math.max(...ring.map(e => e.shin))],
  relativeRotationDeg: angle * 180 / Math.PI, theoreticalEqualBlendScale: Math.cos(angle / 2),
  restWidthMm: range(rest) * 1000, linearWidthMm: range(linear) * 1000, dualCounterfactualWidthMm: range(dual) * 1000};
assert.ok(report.restWidthMm > 125 && report.restWidthMm < 127 && report.linearWidthMm > 80 && report.linearWidthMm < 84);
assert.ok(report.dualCounterfactualWidthMm > 123 && report.dualCounterfactualWidthMm < 127);
console.log(JSON.stringify(report, null, 2));
console.log('PASS: the same rest ring and bone pose shrink under LBS, but not under this isolated DQS counterfactual. This does not test all poses or make DQS the shipped solution.');
