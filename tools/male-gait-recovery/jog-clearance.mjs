// Raise a near-ground, forward-moving jog swing foot; no stance locking.
import fs from "node:fs";
import { NodeIO } from "../male-library-motion/node_modules/@gltf-transform/core/dist/index.js";
import {
  Vector3,
  Quaternion,
} from "../male-library-motion/node_modules/three/build/three.module.js";
import { makeEvaluator } from "../male-motion-fit/pose.mjs";
if (process.argv.length !== 5)
  throw Error(
    "Usage: node jog-clearance.mjs input.glb output.glb intermediate.json",
  );
let [input, output, infoPath] = process.argv.slice(2),
  h = 0.03,
  io = new NodeIO(),
  d = await io.read(input),
  r = d.getRoot(),
  name = "Run_C",
  e = makeEvaluator(r, "NewBody", name),
  a = r.listAnimations().find((x) => x.getName() === name),
  ch = new Map(
    a
      .listChannels()
      .filter((c) => c.getTargetPath() === "rotation")
      .map((c) => [c.getTargetNode().getName(), c]),
  ),
  times = ch.get("Rig_Thigh_L").getSampler().getInput().getArray(),
  N = times.length - 1,
  dt = e.duration / 960,
  speed = JSON.parse(fs.readFileSync(infoPath, "utf8")).clips.Run_C
    .scaledSourceSpeedMps;
if (input === output) throw Error("Refusing to overwrite input");
const smooth = (a, b, x) => {
    let t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  },
  P = (o) => o.getWorldPosition(new Vector3()),
  Q = (o) => o.getWorldQuaternion(new Quaternion()).normalize(),
  wrap = (t) => (t + e.duration) % e.duration;
let lifts = { L: new Float64Array(N), R: new Float64Array(N) },
  details = [];
for (let i = 0; i < N; i++) {
  let t = times[i],
    feet = e.footDetails(t);
  for (let [k, s] of ["L", "R"].entries()) {
    let f = feet[k],
      before = e.vertex(wrap(t - dt), f.index),
      after = e.vertex(wrap(t + dt), f.index),
      forward = (after[2] - before[2]) / (2 * dt) + speed;
    let confidence = smooth(0.6, 2.5, forward),
      amount = Math.max(0, Math.min(0.045, +h * confidence - f.point[1]));
    lifts[s][i] = amount;
    details.push({ side: s, phase: i / N, low: f.point[1], forward, amount });
  }
}
for (let pass = 0; pass < 7; pass++)
  for (let s of ["L", "R"]) {
    let arr = lifts[s];
    lifts[s] = Float64Array.from(
      arr,
      (v, i) => 0.25 * arr[(i + N - 1) % N] + 0.5 * v + 0.25 * arr[(i + 1) % N],
    );
  }
let arrays = new Map();
for (let s of ["L", "R"])
  for (let part of ["Thigh", "Shin", "Foot"]) {
    let n = `Rig_${part}_${s}`;
    arrays.set(n, ch.get(n).getSampler().getOutput().getArray().slice());
  }
let stats = {
  maxLift: 0,
  maxKneeMotion: 0,
  maxAnkleError: 0,
  reachClamps: 0,
  phases: 0,
};
for (let i = 0; i < N; i++) {
  e.pose(times[i]);
  for (let s of ["L", "R"]) {
    let lift = lifts[s][i];
    if (lift < 0.00001) continue;
    stats.phases++;
    stats.maxLift = Math.max(stats.maxLift, lift);
    let thigh = e.bones.get("Rig_Thigh_" + s),
      shin = e.bones.get("Rig_Shin_" + s),
      foot = e.bones.get("Rig_Foot_" + s),
      hip = P(thigh),
      knee = P(shin),
      ankle = P(foot),
      footWorld = Q(foot),
      desired = ankle.clone().add(new Vector3(0, lift, 0)),
      l1 = hip.distanceTo(knee),
      l2 = knee.distanceTo(ankle),
      axis = desired.clone().sub(hip),
      distance = axis.length(),
      reach = Math.min(
        l1 + l2 - 1e-5,
        Math.max(Math.abs(l1 - l2) + 1e-5, distance),
      );
    if (Math.abs(reach - distance) > 1e-5) stats.reachClamps++;
    axis.normalize();
    desired.copy(hip).addScaledVector(axis, reach);
    let bend = knee.clone().sub(hip);
    bend.addScaledVector(axis, -bend.dot(axis));
    if (bend.length() < 0.001) throw Error("Singular knee near " + i + " " + s);
    bend.normalize();
    let along = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach),
      radius = Math.sqrt(Math.max(0, l1 * l1 - along * along)),
      newKnee = hip
        .clone()
        .addScaledVector(axis, along)
        .addScaledVector(bend, radius);
    let r1 = new Quaternion().setFromUnitVectors(
      knee.clone().sub(hip).normalize(),
      newKnee.clone().sub(hip).normalize(),
    );
    thigh.quaternion
      .copy(
        Q(thigh.parent)
          .invert()
          .multiply(r1.multiply(Q(thigh))),
      )
      .normalize();
    e.updateMatrices();
    let knee2 = P(shin),
      ankle2 = P(foot),
      r2 = new Quaternion().setFromUnitVectors(
        ankle2.clone().sub(knee2).normalize(),
        desired.clone().sub(knee2).normalize(),
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
    stats.maxKneeMotion = Math.max(
      stats.maxKneeMotion,
      knee.distanceTo(P(shin)),
    );
    stats.maxAnkleError = Math.max(
      stats.maxAnkleError,
      desired.distanceTo(P(foot)),
    );
    for (let part of ["Thigh", "Shin", "Foot"]) {
      let n = `Rig_${part}_${s}`;
      e.bones.get(n).quaternion.toArray(arrays.get(n), i * 4);
    }
  }
}
for (let [n, arr] of arrays) {
  for (let i = 1; i < N; i++) {
    let q = new Quaternion().fromArray(arr, 4 * i),
      prev = new Quaternion().fromArray(arr, 4 * (i - 1));
    if (q.dot(prev) < 0) {
      for (let j = 0; j < 4; j++) arr[4 * i + j] *= -1;
    }
  }
  arr.set(arr.slice(0, 4), 4 * N);
  ch.get(n).getSampler().getOutput().setArray(arr);
}
await io.write(output, d);
console.log(
  JSON.stringify(
    {
      heightMeters: h,
      scaledSourceSpeedMps: speed,
      stats,
      requestedKeyCount: details.filter((x) => x.amount > 0.001).length,
    },
    null,
    2,
  ),
);
