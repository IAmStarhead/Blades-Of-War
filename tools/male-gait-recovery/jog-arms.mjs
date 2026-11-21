// Use the adjusted C arm motion at the 100STYLE jogging cadence.
// The fixed offset approximately aligns mid-support phases, not identical poses.
import { NodeIO } from "../male-library-motion/node_modules/@gltf-transform/core/dist/index.js";
import { Quaternion } from "../male-library-motion/node_modules/three/build/three.module.js";
import { makeEvaluator } from "../male-motion-fit/pose.mjs";
if (process.argv.length !== 5)
  throw Error("Usage: node jog-arms.mjs adjusted-C.glb input.glb output.glb");
let [source, target, output] = process.argv.slice(2),
  offsetText = ".201",
  io = new NodeIO(),
  ref = (await io.read(source)).getRoot(),
  doc = await io.read(target),
  root = doc.getRoot(),
  e = makeEvaluator(root, "NewBody", "Run_C"),
  s = makeEvaluator(ref, "NewBody", "Run_C_Refined"),
  a = root.listAnimations().find((a) => a.getName() === "Run_C"),
  ch = new Map(
    a
      .listChannels()
      .filter((c) => c.getTargetPath() === "rotation")
      .map((c) => [c.getTargetNode().getName(), c]),
  ),
  times = ch.get("Rig_Thigh_L").getSampler().getInput().getArray(),
  N = times.length - 1,
  order = ["L", "R"].flatMap((x) =>
    ["Shoulder", "UpperArm", "Forearm", "Hand"].map((p) => `Rig_${p}_${x}`),
  ),
  out = new Map(order.map((n) => [n, new Float32Array(4 * (N + 1))])),
  Q = (o) => o.getWorldQuaternion(new Quaternion()).normalize();
if (source === output || target === output)
  throw Error("Refusing to overwrite input");
for (let i = 0; i < N; i++) {
  e.pose(times[i]);
  s.pose(s.duration * ((i / N - Number(offsetText) + 1) % 1));
  for (let name of order) {
    let bone = e.bones.get(name),
      world = Q(s.bones.get(name));
    bone.quaternion.copy(Q(bone.parent).invert().multiply(world)).normalize();
    e.updateMatrices();
    let q = bone.quaternion.clone(),
      a = out.get(name);
    if (i && new Quaternion().fromArray(a, 4 * (i - 1)).dot(q) < 0)
      q.set(-q.x, -q.y, -q.z, -q.w);
    q.toArray(a, 4 * i);
  }
}
for (let [name, arr] of out) {
  arr.set(arr.slice(0, 4), 4 * N);
  ch.get(name).getSampler().getOutput().setArray(arr);
}
await io.write(output, doc);
console.log(
  JSON.stringify(
    { source: "adjusted C arms", phaseOffsetCycles: Number(offsetText) },
    null,
    2,
  ),
);
