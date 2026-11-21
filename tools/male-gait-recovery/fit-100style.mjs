// Fit 100STYLE head, clavicle and foot orientations to the trial character.
// Input/output must be separate; metrics are logged for build-info.json.
import fs from "node:fs";
import { NodeIO } from "../male-library-motion/node_modules/@gltf-transform/core/dist/index.js";
import {
  Matrix4,
  Vector3,
  Quaternion,
} from "../male-library-motion/node_modules/three/build/three.module.js";
import { makeEvaluator } from "../male-motion-fit/pose.mjs";
if (process.argv.length !== 4)
  throw Error("Usage: node fit-100style.mjs input.glb output.glb");
let [input, output] = process.argv.slice(2),
  shoulderText = "9",
  io = new NodeIO(),
  doc = await io.read(input),
  root = doc.getRoot(),
  body = root
    .listNodes()
    .find((n) => n.getName() === "NewBody")
    .getMesh()
    .listPrimitives()[0],
  pos = body.getAttribute("POSITION").getArray(),
  joints = body.getAttribute("JOINTS_0").getArray(),
  weights = body.getAttribute("WEIGHTS_0").getArray(),
  skin = root.listSkins()[0],
  names = skin.listJoints().map((x) => x.getName()),
  ibm = skin.getInverseBindMatrices().getArray(),
  invs = names.map((_, i) => new Matrix4().fromArray(ibm, 16 * i)),
  mats = names.map(() => new Matrix4());
const P = (o) => o.getWorldPosition(new Vector3()),
  Q = (o) => o.getWorldQuaternion(new Quaternion()).normalize(),
  up = new Vector3(0, 1, 0),
  X = new Vector3(1, 0, 0),
  Z = new Vector3(0, 0, 1),
  rad = (x) => (x * Math.PI) / 180,
  D = 180 / Math.PI,
  wrap = (x) => ((x + 540) % 360) - 180,
  clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
  smooth = (a, b, x) => {
    let q = clamp((x - a) / (b - a), 0, 1);
    return q * q * (3 - 2 * q);
  },
  groups = {};
for (let s of ["L", "R"]) {
  let sign = s === "L" ? 1 : -1;
  for (let part of ["heel", "tip"]) groups[s + part] = [];
  for (let i = 0; i < pos.length / 3; i++) {
    let x = pos[3 * i] * sign,
      y = pos[3 * i + 1],
      z = pos[3 * i + 2];
    if (x > 0.03 && x < 0.28 && y < 0.12 && z < -0.075)
      groups[s + "heel"].push(i);
    if (x > 0.03 && x < 0.28 && y < 0.12 && z > 0.15) groups[s + "tip"].push(i);
  }
}
function centroid(ids) {
  let out = new Vector3();
  for (let i of ids) {
    let x = pos[3 * i],
      y = pos[3 * i + 1],
      z = pos[3 * i + 2];
    for (let k = 0; k < 4; k++) {
      let w = weights[4 * i + k];
      if (!w) continue;
      let e = mats[joints[4 * i + k]].elements;
      out.x += w * (e[0] * x + e[4] * y + e[8] * z + e[12]);
      out.y += w * (e[1] * x + e[5] * y + e[9] * z + e[13]);
      out.z += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
  }
  return out.divideScalar(ids.length);
}
if (input === output) throw Error("Refusing to overwrite input");
let report = { shoulderDegrees: +shoulderText, clips: {} };
for (let name of ["Walk_C", "Run_C"]) {
  let anim = root.listAnimations().find((a) => a.getName() === name),
    ev = makeEvaluator(root, "NewBody", name),
    channels = new Map(
      anim
        .listChannels()
        .filter((c) => c.getTargetPath() === "rotation")
        .map((c) => [c.getTargetNode().getName(), c]),
    ),
    keys = channels.get("Rig_Thigh_L").getSampler().getInput().getArray(),
    N = keys.length - 1,
    correction = { L: new Float64Array(N), R: new Float64Array(N) };
  for (let i = 0; i < N; i++) {
    ev.pose(keys[i]);
    for (let k = 0; k < names.length; k++)
      mats[k].copy(ev.bones.get(names[k]).matrixWorld).multiply(invs[k]);
    let hip = P(ev.bones.get("Rig_Thigh_L")).sub(
        P(ev.bones.get("Rig_Thigh_R")),
      ),
      hy = Math.atan2(-hip.z, hip.x) * D;
    for (let s of ["L", "R"]) {
      let sign = s === "L" ? 1 : -1,
        d = centroid(groups[s + "tip"]).sub(centroid(groups[s + "heel"])),
        direction = Math.atan2(d.x, d.z) * D,
        trust = smooth(0.1, 0.65, d.z / d.length()),
        desired = 0.35 * hy + sign * 5;
      correction[s][i] = clamp(wrap(desired - direction), -32, 32) * trust;
    }
  }
  for (let pass = 0; pass < 4; pass++)
    for (let s of ["L", "R"]) {
      let a = correction[s];
      correction[s] = Float64Array.from(
        a,
        (v, i) => 0.25 * a[(i + N - 1) % N] + 0.5 * v + 0.25 * a[(i + 1) % N],
      );
    }
  let order = [
      "Rig_Neck",
      "Rig_Head",
      ...["L", "R"].flatMap((s) => [
        `Rig_Shoulder_${s}`,
        `Rig_UpperArm_${s}`,
        `Rig_Foot_${s}`,
      ]),
    ],
    arr = new Map(order.map((n) => [n, new Float32Array(4 * keys.length)])),
    moved = 0,
    neckTilt = name === "Walk_C" ? -4 : -6,
    headTilt = name === "Walk_C" ? -7 : -12;
  function world(n, q) {
    let bone = ev.bones.get(n);
    bone.quaternion.copy(Q(bone.parent).invert().multiply(q)).normalize();
    ev.updateMatrices();
  }
  for (let i = 0; i < N; i++) {
    ev.pose(keys[i]);
    let old = new Map(order.map((n) => [n, Q(ev.bones.get(n))])),
      before = {
        L: P(ev.bones.get("Rig_UpperArm_L")),
        R: P(ev.bones.get("Rig_UpperArm_R")),
      };
    world(
      "Rig_Neck",
      new Quaternion()
        .setFromAxisAngle(X, rad(neckTilt))
        .multiply(old.get("Rig_Neck")),
    );
    world(
      "Rig_Head",
      new Quaternion()
        .setFromAxisAngle(X, rad(headTilt))
        .multiply(old.get("Rig_Head")),
    );
    for (let s of ["L", "R"]) {
      let sign = s === "L" ? 1 : -1;
      world(
        "Rig_Shoulder_" + s,
        new Quaternion()
          .setFromAxisAngle(Z, rad(-sign * +shoulderText))
          .multiply(old.get("Rig_Shoulder_" + s)),
      );
      world("Rig_UpperArm_" + s, old.get("Rig_UpperArm_" + s));
      world(
        "Rig_Foot_" + s,
        new Quaternion()
          .setFromAxisAngle(up, rad(correction[s][i]))
          .multiply(old.get("Rig_Foot_" + s)),
      );
      moved = Math.max(
        moved,
        before[s].distanceTo(P(ev.bones.get("Rig_UpperArm_" + s))),
      );
    }
    for (let n of order) {
      let q = ev.bones.get(n).quaternion.clone().normalize(),
        a = arr.get(n);
      if (i && new Quaternion().fromArray(a, 4 * (i - 1)).dot(q) < 0)
        q.set(-q.x, -q.y, -q.z, -q.w);
      q.toArray(a, 4 * i);
    }
  }
  for (let [n, a] of arr) {
    a.set(a.slice(0, 4), 4 * N);
    channels.get(n).getSampler().getOutput().setArray(a);
  }
  report.clips[name] = {
    footDegrees: Object.fromEntries(
      ["L", "R"].map((s) => [
        s,
        [Math.min(...correction[s]), Math.max(...correction[s])],
      ]),
    ),
    maxArmOriginDisplacementMeters: moved,
    neckTilt,
    headTilt,
  };
}
await io.write(output, doc);
console.log(JSON.stringify(report, null, 2));
