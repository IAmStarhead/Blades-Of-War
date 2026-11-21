// Gently regularize near-straight walking knees to avoid an unstable bend plane.
import { NodeIO } from "../male-library-motion/node_modules/@gltf-transform/core/dist/index.js";
import {
  Vector3,
  Quaternion,
} from "../male-library-motion/node_modules/three/build/three.module.js";
import { makeEvaluator } from "../male-motion-fit/pose.mjs";
if (process.argv.length !== 4)
  throw Error("Usage: node walk-knees.mjs input.glb output.glb");
let [input, output] = process.argv.slice(2),
  bias = 6,
  io = new NodeIO(),
  doc = await io.read(input),
  root = doc.getRoot(),
  e = makeEvaluator(root, "NewBody", "Walk_C"),
  anim = root.listAnimations().find((x) => x.getName() === "Walk_C"),
  channels = new Map(
    anim
      .listChannels()
      .filter((c) => c.getTargetPath() === "rotation")
      .map((c) => [c.getTargetNode().getName(), c]),
  ),
  times = channels.get("Rig_Thigh_L").getSampler().getInput().getArray(),
  N = times.length - 1,
  arrays = new Map(),
  P = (o) => o.getWorldPosition(new Vector3()),
  Q = (o) => o.getWorldQuaternion(new Quaternion()).normalize(),
  smooth = (a, b, x) => {
    let t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
if (input === output) throw Error("Refusing to overwrite input");
for (let s of ["L", "R"])
  for (let part of ["Thigh", "Shin", "Foot"]) {
    let n = `Rig_${part}_${s}`;
    arrays.set(n, channels.get(n).getSampler().getOutput().getArray().slice());
  }
let report = {
  biasDegrees: bias,
  maxKneeDelta: 0,
  maxAnkleDelta: 0,
  corrected: 0,
};
for (let i = 0; i < N; i++) {
  e.pose(times[i]);
  for (let s of ["L", "R"]) {
    let thigh = e.bones.get("Rig_Thigh_" + s),
      shin = e.bones.get("Rig_Shin_" + s),
      foot = e.bones.get("Rig_Foot_" + s),
      H = P(thigh),
      K = P(shin),
      A = P(foot),
      footWorld = Q(foot),
      angle =
        ((Math.PI - H.clone().sub(K).angleTo(A.clone().sub(K))) * 180) /
        Math.PI;
    if (angle >= 12) continue;
    let l1 = H.distanceTo(K),
      l2 = K.distanceTo(A),
      axis = A.clone().sub(H).normalize(),
      b = K.clone().sub(H);
    b.addScaledVector(axis, -b.dot(axis));
    if (b.length() < 1e-6) throw Error("singular knee");
    b.normalize();
    let forward = new Vector3(0, 0, 1)
        .addScaledVector(axis, -axis.z)
        .normalize(),
      directionBias = 1 - smooth(3, 10, angle);
    b.multiplyScalar(1 - directionBias)
      .addScaledVector(forward, directionBias)
      .normalize();
    let angleBias = bias * (1 - smooth(5, 12, angle)),
      targetAngle =
        (Math.sqrt(angle * angle + angleBias * angleBias) * Math.PI) / 180,
      reach = Math.sqrt(
        l1 * l1 + l2 * l2 + 2 * l1 * l2 * Math.cos(targetAngle),
      ),
      goal = H.clone().addScaledVector(axis, reach),
      along = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach),
      radius = Math.sqrt(Math.max(0, l1 * l1 - along * along)),
      newKnee = H.clone()
        .addScaledVector(axis, along)
        .addScaledVector(b, radius),
      r1 = new Quaternion().setFromUnitVectors(
        K.clone().sub(H).normalize(),
        newKnee.clone().sub(H).normalize(),
      );
    thigh.quaternion
      .copy(
        Q(thigh.parent)
          .invert()
          .multiply(r1.multiply(Q(thigh))),
      )
      .normalize();
    e.updateMatrices();
    let K2 = P(shin),
      A2 = P(foot),
      r2 = new Quaternion().setFromUnitVectors(
        A2.clone().sub(K2).normalize(),
        goal.clone().sub(K2).normalize(),
      );
    shin.quaternion
      .copy(
        Q(shin.parent)
          .invert()
          .multiply(r2.multiply(Q(shin))),
      )
      .normalize();
    e.updateMatrices();
    foot.quaternion
      .copy(Q(foot.parent).invert().multiply(footWorld))
      .normalize();
    e.updateMatrices();
    report.corrected++;
    report.maxKneeDelta = Math.max(report.maxKneeDelta, K.distanceTo(P(shin)));
    report.maxAnkleDelta = Math.max(
      report.maxAnkleDelta,
      A.distanceTo(P(foot)),
    );
    for (let part of ["Thigh", "Shin", "Foot"]) {
      let n = `Rig_${part}_${s}`;
      e.bones.get(n).quaternion.toArray(arrays.get(n), 4 * i);
    }
  }
}
for (let [n, a] of arrays) {
  for (let i = 1; i < N; i++) {
    let q = new Quaternion().fromArray(a, 4 * i),
      p = new Quaternion().fromArray(a, 4 * (i - 1));
    if (q.dot(p) < 0) for (let j = 0; j < 4; j++) a[4 * i + j] *= -1;
  }
  a.set(a.slice(0, 4), 4 * N);
  channels.get(n).getSampler().getOutput().setArray(a);
}
await io.write(output, doc);
console.log(JSON.stringify(report, null, 2));
