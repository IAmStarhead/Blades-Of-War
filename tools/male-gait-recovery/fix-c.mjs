// A separate, reproducible partial refit of the previously delivered C/C trial.
// Weights are shared between the resulting C clips and the alternative clips.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "../male-library-motion/node_modules/@gltf-transform/core/dist/index.js";
import {
  Matrix4,
  Quaternion,
  Vector3,
} from "../male-library-motion/node_modules/three/build/three.module.js";
import { makeEvaluator } from "../male-motion-fit/pose.mjs";
if (process.argv.length !== 4)
  throw Error("Usage: node fix-c.mjs output.glb report.json");
const [out, reportPath] = process.argv.slice(2).map((p) => path.resolve(p));
const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const delivered = path.join(
  repo,
  "work/male-gait-refine/male_gait_C_refined.glb",
);
const previous = path.join(
  repo,
  "work/male-gait-refine/previous_posture_C.glb",
);
for (const dest of [out, reportPath]) {
  if (
    [delivered, previous].includes(dest) ||
    (dest.startsWith(repo + path.sep) &&
      !dest.startsWith(path.join(repo, "work/male-gait-recovery") + path.sep))
  )
    throw Error(
      "Refusing to overwrite a source or unrelated project directory",
    );
}
const check = (p, digest) =>
  assert.equal(
    createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
    digest,
    `Changed source: ${p}`,
  );
check(
  delivered,
  "c0685047069bf2a25e7cdc2c23580543b7e349281ad27d64dc240d63b9446013",
);
check(
  previous,
  "c72ec5c2386362d4f4c30dc0e541ffa3c6664f9ca4c27d49d8cd428ce87c3847",
);
const [hipRestore, chestRestore, extraChest, torsoRetain, footStrength] = [
  0.75, 0.85, 0.35, 0.55, 0.8,
];
const io = new NodeIO(),
  doc = await io.read(delivered),
  root = doc.getRoot();
const old = (await io.read(previous)).getRoot();
const body = (r) =>
    r
      .listNodes()
      .find((n) => n.getName() === "NewBody")
      .getMesh()
      .listPrimitives()[0],
  p = body(root),
  p0 = body(old);
const names = root
    .listSkins()[0]
    .listJoints()
    .map((n) => n.getName()),
  j = p.getAttribute("JOINTS_0").getArray(),
  w = p.getAttribute("WEIGHTS_0").getArray(),
  j0 = p0.getAttribute("JOINTS_0").getArray(),
  w0 = p0.getAttribute("WEIGHTS_0").getArray(),
  pos = p.getAttribute("POSITION").getArray();
const boneIndex = (name) => names.indexOf(name),
  chest = boneIndex("Rig_Chest");
const smooth = (a, b, x) => {
    let v = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return v * v * (3 - 2 * v);
  },
  clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function get(ja, wa, i) {
  let m = new Map();
  for (let k = 0; k < 4; k++)
    if (wa[4 * i + k])
      m.set(ja[4 * i + k], (m.get(ja[4 * i + k]) || 0) + wa[4 * i + k]);
  return m;
}
let stats = { hip: 0, chest: 0, extra: 0, maxDropped: 0 };
for (let i = 0; i < pos.length / 3; i++) {
  const x = pos[i * 3],
    y = pos[i * 3 + 1],
    z = pos[i * 3 + 2],
    a = get(j, w, i),
    b = get(j0, w0, i);
  let f = 0;
  if (y < 1.05) f = hipRestore;
  else if (y > 1.25)
    f =
      chestRestore *
      smooth(-0.015, 0.055, z) *
      (1 - smooth(0.16, 0.225, Math.abs(x)));
  let W = new Map();
  for (let k of new Set([...a.keys(), ...b.keys()]))
    W.set(k, (a.get(k) || 0) * (1 - f) + (b.get(k) || 0) * f);
  const side = x >= 0 ? "L" : "R";
  const fm =
    extraChest *
    smooth(0.015, 0.065, z) *
    (1 - smooth(0.125, 0.19, Math.abs(x))) *
    smooth(1.25, 1.3, y) *
    (1 - smooth(1.37, 1.43, y));
  if (fm > 0) {
    for (let n of ["Rig_Shoulder_" + side, "Rig_UpperArm_" + side]) {
      let k = boneIndex(n),
        d = (W.get(k) || 0) * fm;
      W.set(k, (W.get(k) || 0) - d);
      W.set(chest, (W.get(chest) || 0) + d);
      if (d > 1e-9) stats.extra++;
    }
  }
  const sorted = [...W].filter(([, v]) => v > 1e-9).sort((x, y) => y[1] - x[1]),
    keep = sorted.slice(0, 4),
    sum = keep.reduce((a, b) => a + b[1], 0);
  if (!(sum > 0.99)) throw Error("significant influence loss " + sum);
  stats.maxDropped = Math.max(stats.maxDropped, 1 - sum);
  let diff = false;
  for (let k = 0; k < 4; k++)
    if (
      j[4 * i + k] !== (keep[k]?.[0] || 0) ||
      Math.abs(w[4 * i + k] - (keep[k] ? keep[k][1] / sum : 0)) > 1e-7
    )
      diff = true;
  if (diff) {
    if (y < 1.05) stats.hip++;
    else stats.chest++;
  }
  for (let k = 0; k < 4; k++) {
    j[4 * i + k] = keep[k]?.[0] || 0;
    w[4 * i + k] = keep[k] ? keep[k][1] / sum : 0;
  }
}
const skin = root.listSkins()[0],
  ibm = skin.getInverseBindMatrices().getArray(),
  inv = names.map((_, i) => new Matrix4().fromArray(ibm, 16 * i)),
  mats = names.map(() => new Matrix4());
const groups = {};
for (let side of ["L", "R"]) {
  let s = side === "L" ? 1 : -1;
  for (let kind of ["heel", "tip"]) groups[side + kind] = [];
  for (let i = 0; i < pos.length / 3; i++) {
    let x = s * pos[3 * i],
      y = pos[3 * i + 1],
      z = pos[3 * i + 2];
    if (x > 0.03 && x < 0.28 && y < 0.12 && z < -0.075)
      groups[side + "heel"].push(i);
    if (x > 0.03 && x < 0.28 && y < 0.12 && z > 0.15)
      groups[side + "tip"].push(i);
  }
}
function updateMats(ev) {
  for (let k = 0; k < names.length; k++)
    mats[k].copy(ev.bones.get(names[k]).matrixWorld).multiply(inv[k]);
}
function centroid(ids) {
  let r = new Vector3();
  for (let i of ids) {
    let x = pos[3 * i],
      y = pos[3 * i + 1],
      z = pos[3 * i + 2];
    for (let k = 0; k < 4; k++) {
      let wt = w[4 * i + k];
      if (!wt) continue;
      let e = mats[j[4 * i + k]].elements;
      r.x += wt * (e[0] * x + e[4] * y + e[8] * z + e[12]);
      r.y += wt * (e[1] * x + e[5] * y + e[9] * z + e[13]);
      r.z += wt * (e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
  }
  return r.divideScalar(ids.length);
}
const P = (o) => o.getWorldPosition(new Vector3()),
  Q = (o) => o.getWorldQuaternion(new Quaternion()).normalize(),
  Y = new Vector3(0, 1, 0),
  identity = new Quaternion(),
  D = 180 / Math.PI,
  rad = (x) => (x * Math.PI) / 180,
  wrap = (x) => ((x + 540) % 360) - 180;
const order = [
  "Rig_Hips",
  "Rig_Spine",
  "Rig_Chest",
  "Rig_Neck",
  ...["L", "R"].flatMap((s) =>
    ["Shoulder", "UpperArm", "Thigh", "Shin", "Foot"].map(
      (n) => `Rig_${n}_${s}`,
    ),
  ),
];
function base(ev) {
  const oldQ = new Map(order.map((n) => [n, Q(ev.bones.get(n))]));
  const hip = P(ev.bones.get("Rig_Thigh_L")).sub(
      P(ev.bones.get("Rig_Thigh_R")),
    ),
    shoulder = P(ev.bones.get("Rig_Shoulder_L")).sub(
      P(ev.bones.get("Rig_Shoulder_R")),
    );
  const hipYaw = Math.atan2(-hip.z, hip.x) * D,
    chestYaw = Math.atan2(-shoulder.z, shoulder.x) * D;
  const dh = (torsoRetain - 1) * hipYaw,
    dc = (torsoRetain - 1) * chestYaw,
    qh = new Quaternion().setFromAxisAngle(Y, rad(dh)),
    qc = new Quaternion().setFromAxisAngle(Y, rad(dc));
  function world(n, q) {
    let b = ev.bones.get(n);
    b.quaternion.copy(Q(b.parent).invert().multiply(q)).normalize();
    ev.updateMatrices();
  }
  world("Rig_Hips", qh.clone().multiply(oldQ.get("Rig_Hips")));
  for (let n of ["Rig_Spine", "Rig_Chest", "Rig_Neck"])
    world(n, qc.clone().multiply(oldQ.get(n)));
  for (let side of ["L", "R"]) {
    for (let n of ["Shoulder", "UpperArm"])
      world(
        `Rig_${n}_${side}`,
        qc.clone().multiply(oldQ.get(`Rig_${n}_${side}`)),
      );
    for (let n of ["Thigh", "Shin", "Foot"])
      world(`Rig_${n}_${side}`, oldQ.get(`Rig_${n}_${side}`));
  }
  return {
    oldQ,
    world,
    hipYaw: hipYaw * torsoRetain,
    chestYaw: chestYaw * torsoRetain,
  };
}
let result = {
  input: "male_gait_C_refined.glb",
  hipRestore,
  chestRestore,
  extraChest,
  torsoRetain,
  footStrength,
  skin: stats,
  clips: {},
};
for (let clipName of ["Walk_C_Refined", "Run_C_Refined"]) {
  const anim = root.listAnimations().find((a) => a.getName() === clipName),
    ev = makeEvaluator(root, "NewBody", clipName),
    channels = new Map(
      anim
        .listChannels()
        .filter((c) => c.getTargetPath() === "rotation")
        .map((c) => [c.getTargetNode().getName(), c]),
    ),
    times = channels.get("Rig_Hips").getSampler().getInput().getArray(),
    N = times.length - 1;
  let correction = { L: new Float64Array(N), R: new Float64Array(N) },
    quality = { L: [], R: [] },
    preYaw = { L: [], R: [] };
  for (let i = 0; i < N; i++) {
    ev.pose(times[i]);
    let { hipYaw } = base(ev);
    updateMats(ev);
    for (let side of ["L", "R"]) {
      const d = centroid(groups[side + "tip"]).sub(
          centroid(groups[side + "heel"]),
        ),
        length = d.length(),
        dir = Math.atan2(d.x, d.z) * D,
        s = side === "L" ? 1 : -1,
        desired = 0.45 * hipYaw + s * 5;
      let trust = smooth(0.1, 0.65, d.z / length),
        delta = clamp(wrap(desired - dir), -22, 22) * trust * footStrength;
      correction[side][i] = delta;
      quality[side].push(trust);
      preYaw[side].push(s * dir);
    }
  }
  for (let pass = 0; pass < 3; pass++)
    for (let side of ["L", "R"]) {
      let a = correction[side];
      correction[side] = Float64Array.from(
        a,
        (v, i) => 0.25 * a[(i + N - 1) % N] + 0.5 * v + 0.25 * a[(i + 1) % N],
      );
    }
  const arrs = new Map(
    order.map((n) => [n, new Float32Array(times.length * 4)]),
  );
  let maxHipDisplacement = 0,
    maxAnkleDisplacement = 0;
  for (let i = 0; i < N; i++) {
    ev.pose(times[i]);
    let before = Object.fromEntries(
      ["L", "R"].map((s) => [
        s,
        {
          hip: P(ev.bones.get("Rig_Thigh_" + s)),
          ankle: P(ev.bones.get("Rig_Foot_" + s)),
        },
      ]),
    );
    let { oldQ, world } = base(ev);
    for (let side of ["L", "R"]) {
      world(
        `Rig_Foot_${side}`,
        new Quaternion()
          .setFromAxisAngle(Y, rad(correction[side][i]))
          .multiply(oldQ.get(`Rig_Foot_${side}`)),
      );
      maxHipDisplacement = Math.max(
        maxHipDisplacement,
        before[side].hip.distanceTo(P(ev.bones.get("Rig_Thigh_" + side))),
      );
      maxAnkleDisplacement = Math.max(
        maxAnkleDisplacement,
        before[side].ankle.distanceTo(P(ev.bones.get("Rig_Foot_" + side))),
      );
    }
    for (let n of order) {
      let arr = arrs.get(n),
        q = ev.bones.get(n).quaternion.clone().normalize();
      if (i && new Quaternion().fromArray(arr, 4 * (i - 1)).dot(q) < 0)
        q.set(-q.x, -q.y, -q.z, -q.w);
      q.toArray(arr, 4 * i);
    }
  }
  for (let [n, arr] of arrs) {
    arr.set(arr.slice(0, 4), 4 * N);
    channels.get(n).getSampler().getOutput().setArray(arr);
  }
  result.clips[clipName] = {
    rotationKeys: N + 1,
    maxHipDisplacementMm: maxHipDisplacement * 1000,
    maxAnkleDisplacementMm: maxAnkleDisplacement * 1000,
    footCorrectionDegrees: Object.fromEntries(
      ["L", "R"].map((s) => [
        s,
        [Math.min(...correction[s]), Math.max(...correction[s])],
      ]),
    ),
  };
}
await io.write(out, doc);
fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
