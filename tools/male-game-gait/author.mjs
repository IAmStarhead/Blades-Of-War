import { Accessor, NodeIO } from "../male-library-motion/node_modules/@gltf-transform/core/dist/index.js";
import { Object3D, Vector3, Matrix4, Quaternion, QuaternionLinearInterpolant, LinearInterpolant, DiscreteInterpolant } from "../male-library-motion/node_modules/three/build/three.module.js";
import { makeEvaluator } from "../male-motion-fit/pose.mjs";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Reproducible, deliberately isolated retarget of Quaternius Animated Human
// 2017 onto the previously delivered character. This is a trial, not an
// engine integration or a general-purpose retargeter. See DEVELOPMENT.md.
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "../..");
const args = process.argv.slice(2);
if (args.length !== 2) throw Error("Usage: node author.mjs OUTPUT.glb REPORT.json");
const [out, reportPath] = args.map(x => path.resolve(x));
const permitted = path.join(repo, "work/male-game-gait");
for (const dest of [out, reportPath]) {
  if (dest === repo || (dest.startsWith(repo + path.sep) && !dest.startsWith(permitted + path.sep)))
    throw Error("Refusing to overwrite another repository artifact: " + dest);
}
if (out === reportPath) throw Error("Output and report must be different files");
const kind = "human2017";
const sourcePath = path.join(here, "source/character.glb");
const base = path.join(repo, "work/male-gait-refine/male_gait_C_refined.glb");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
if (hash(fs.readFileSync(sourcePath)) !== "ce4d543e82e455d5a1253798c9759f12b9eec74929ddbca464447eeaa3a42c5d") throw Error("Unexpected 2017 source");
if (hash(fs.readFileSync(base)) !== "c0685047069bf2a25e7cdc2c23580543b7e349281ad27d64dc240d63b9446013") throw Error("Unexpected base character");
// Values were tuned for this body; contact results alone do not certify motion quality.
const opt = {walkArm: 14, walkLeg: 0.75, walkShin: 0.85, runArm: 10,
  runArmScale: 0.65, walkShoulderScale: 0, runShoulderScale: 0,
  runLeg: 0.78, runShin: 0.72, runFlightScale: 0.65, runRadius: 0.05};
const spec = {
  hips: "Hips",
  head: "Head",
  sourceLeg: ["LeftUpLeg", "LeftLeg", "LeftFoot"],
  targetLeg: ["Rig_Thigh_L", "Rig_Shin_L", "Rig_Foot_L"],
  referenceYaw: -Math.PI / 2,
  mapping: [["Rig_Hips", "Hips"], ["Rig_Spine", "Spine1"], ["Rig_Chest", "Spine2"], ["Rig_Neck", "Head"], ...["L", "R"].flatMap((side) => {
    let s2 = side === "L" ? "Left" : "Right";
    return [["Shoulder", "Shoulder"], ["UpperArm", "Arm"], ["Forearm", "ForeArm"], ["Hand", "Hand"], ["Thigh", "UpLeg"], ["Shin", "Leg"], ["Foot", "Foot"], ["Toes", "ToeBase"]].map(([a, b]) => [`Rig_${a}_${side}`, `${s2}${b}`]);
  })],
  children: [["UpperArm", "Forearm", "Arm", "ForeArm"], ["Forearm", "Hand", "ForeArm", "Hand"], ["Thigh", "Shin", "UpLeg", "Leg"], ["Shin", "Foot", "Leg", "Foot"], ["Foot", "Toes", "Foot", "ToeBase"]],
  clips: [["Human Armature|Walk", "Human2017_Walk", "walk", 1 / 24], ["Human Armature|Run", "Human2017_Run", "run", 1 / 24]],
  foot: (s2) => (s2 === "L" ? "Left" : "Right") + "Foot",
  toe: (s2) => (s2 === "L" ? "Left" : "Right") + "ToeBase"
};
const io = new NodeIO(), doc = await io.read(base), root = doc.getRoot(), buffer = root.listBuffers()[0], targetNodes = root.listSkins()[0].listJoints(), src = (await io.read(sourcePath)).getRoot(), sourceJoints = src.listSkins()[0].listJoints();
for (let a of [...root.listAnimations()]) a.dispose();
const obj = (nodes) => {
  let map = new Map(nodes.map((n) => {
    let o = new Object3D();
    o.name = n.getName();
    o.position.fromArray(n.getTranslation());
    o.quaternion.fromArray(n.getRotation());
    o.scale.fromArray(n.getScale());
    return [n, o];
  }));
  for (let n of nodes) if (map.has(n.getParentNode())) map.get(n.getParentNode()).add(map.get(n));
  return map;
};
const T = obj(targetNodes), top = T.get(root.listSkins()[0].getSkeleton()), t = new Map(targetNodes.map((n) => [n.getName(), T.get(n)])), allNodes = src.listNodes(), S = obj(allNodes), sourceTops = [...S.values()].filter((o) => !o.parent), s = new Map(sourceJoints.map((n) => [n.getName(), S.get(n)])), referenceTurn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), spec.referenceYaw), P = (o) => o.getWorldPosition(new Vector3()), Q = (o) => o.getWorldQuaternion(new Quaternion()).normalize(), id = new Quaternion(), Z = new Vector3(0, 0, 1), X = new Vector3(1, 0, 0), deg = Math.PI / 180;
function resetT() {
  for (let n of targetNodes) {
    let o = T.get(n);
    o.position.fromArray(n.getTranslation());
    o.quaternion.fromArray(n.getRotation());
    o.scale.fromArray(n.getScale());
  }
  top.updateMatrixWorld(true);
}
;
function resetS() {
  for (let n of allNodes) {
    let o = S.get(n);
    o.position.fromArray(n.getTranslation());
    o.quaternion.fromArray(n.getRotation());
    o.scale.fromArray(n.getScale());
  }
  sourceTops.forEach((o) => o.updateMatrixWorld(true));
}
;
resetT();
resetS();
const skin = src.listSkins()[0], ibm = skin.getInverseBindMatrices().getArray(), mesh = src.listNodes().find((n) => n.getSkin() === skin), meshWorld = new Matrix4().fromArray(mesh.getWorldMatrix()), R = new Map();
for (let i = 0; i < sourceJoints.length; i++) {
  let n = sourceJoints[i], m = meshWorld.clone().multiply(new Matrix4().fromArray(ibm, i * 16).invert()), p = new Vector3(), q = new Quaternion(), scale = new Vector3();
  m.decompose(p, q, scale);
  R.set(n.getName(), { p: p.applyQuaternion(referenceTurn), q: referenceTurn.clone().multiply(q).normalize() });
}
const align = new Map();
// The 2017 bind mesh is X-forward; its animated clips are already Z-forward.
// Align the bind reference to the target while preserving clip coordinates.
for (const [side, srcside] of [["L", "Left"], ["R", "Right"]]) {
  for (const [a, b, c, d] of spec.children) {
    let tn = `Rig_${a}_${side}`, tc = `Rig_${b}_${side}`, n1 = `${srcside}${c}`, n2 = `${srcside}${d}`;
    let td = P(t.get(tc)).sub(P(t.get(tn))).normalize(), sd = R.get(n2).p.clone().sub(R.get(n1).p).normalize();
    align.set(tn, new Quaternion().setFromUnitVectors(td, sd));
  }
  align.set(`Rig_Hand_${side}`, align.get(`Rig_Forearm_${side}`).clone());
  align.set(`Rig_Toes_${side}`, align.get(`Rig_Foot_${side}`).clone());
}
const targetLeg = spec.targetLeg.slice(0, 2).reduce((sum, n, i) => sum + P(t.get(n)).distanceTo(P(t.get(spec.targetLeg[i + 1]))), 0), sourceLeg = spec.sourceLeg.slice(0, 2).reduce((sum, n, i) => sum + R.get(n).p.distanceTo(R.get(spec.sourceLeg[i + 1]).p), 0), ratio = targetLeg / sourceLeg;
const proxies = {};
for (const side of ["L", "R"]) {
  let name = spec.foot(side), q = R.get(name).q, p = R.get(name).p, heel = new Vector3(0, -p.y, -sourceLeg * 0.03).applyQuaternion(q.clone().invert());
  proxies[side] = { heel };
  if (spec.toe) {
    let n = spec.toe(side), r = R.get(n);
    proxies[side].toe = new Vector3(0, -r.p.y, 0).applyQuaternion(r.q.clone().invert());
  }
}
let report = { base, sourcePath, kind, referenceYawDegrees: spec.referenceYaw / deg, legRatio: ratio, options: opt, clips: [] };
for (let [source, name, mode, extraDuration] of spec.clips) {
  let add = function(n, prop, type, arr) {
    let out2 = doc.createAccessor(`${name}_${n}`, buffer).setType(type).setArray(arr), sampler = doc.createAnimationSampler().setInput(time).setOutput(out2).setInterpolation("LINEAR");
    target.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(targetNodes.find((v) => v.getName() === n)).setTargetPath(prop).setSampler(sampler));
  };
  let anim = src.listAnimations().find((a) => a.getName() === source), tracks = anim.listChannels().map((c) => {
    let sm = c.getSampler(), v = sm.getOutput(), size = v.getElementSize(), arr = new Float32Array(v.getCount() * size);
    for (let i = 0; i < v.getCount(); i++) arr.set(v.getElement(i, []), i * size);
    let type = c.getTargetPath(), C = sm.getInterpolation() === "STEP" ? DiscreteInterpolant : type === "rotation" ? QuaternionLinearInterpolant : LinearInterpolant;
    return { object: S.get(c.getTargetNode()), type, arr, size, times: sm.getInput().getArray(), inter: new C(sm.getInput().getArray(), arr, size) };
  }), duration0 = Math.max(...tracks.map((c) => c.times.at(-1))), duration = duration0 + extraDuration, frames = Math.round(duration * 120), times = Float32Array.from({ length: frames + 1 }, (_, i) => i / frames * duration);
  let rotations = new Map(spec.mapping.map(([n]) => [n, new Float32Array((frames + 1) * 4)]));
  rotations.set("Rig_Head", new Float32Array((frames + 1) * 4));
  for (let side of ["L", "R"]) if (!rotations.has("Rig_Toes_" + side)) rotations.set("Rig_Toes_" + side, new Float32Array((frames + 1) * 4));
  let trans = new Float32Array((frames + 1) * 3), rawRoot = [], clear = [], last = new Map();
  for (let i = 0; i <= frames; i++) {
    const time2 = times[i];
    resetS();
    for (let tr of tracks) {
      let value = tr.inter.evaluate(Math.min(duration0, time2));
      if (time2 > duration0) {
        let f = (time2 - duration0) / extraDuration;
        if (tr.type === "rotation") value = new Quaternion().fromArray(value).slerp(new Quaternion().fromArray(tr.arr, 0), f).toArray();
        else value = Array.from(value, (x, k) => x + (tr.arr[k] - x) * f);
      }
      if (tr.type === "rotation") tr.object.quaternion.fromArray(value).normalize();
      else if (tr.type === "translation") tr.object.position.fromArray(value);
      else if (tr.type === "scale") tr.object.scale.fromArray(value);
    }
    sourceTops.forEach((x) => x.updateMatrixWorld(true));
    resetT();
    for (let [tn, sn] of spec.mapping) {
      let bone = t.get(tn), desired = Q(s.get(sn)).multiply(R.get(sn).q.clone().invert()).multiply(align.get(tn) || id).normalize();
      bone.quaternion.copy(Q(bone.parent).invert().multiply(desired));
      top.updateMatrixWorld(true);
    }
    // The head follows the mapped neck as a rigid piece; this rig has no jaw joint.
    t.get("Rig_Head").quaternion.identity();
    top.updateMatrixWorld(true);
    // Reduce clavicle rotations while retaining the upper-arm world pose. Then
    // limit exaggerated limb swings and retain the original foot orientation.
    let originalArm = {};
    for (let side of ["L", "R"]) originalArm[side] = Q(t.get("Rig_UpperArm_" + side));
    for (let side of ["L", "R"]) {
      let shoulder = t.get("Rig_Shoulder_" + side), arm = t.get("Rig_UpperArm_" + side), scale = mode === "walk" ? opt.walkShoulderScale ?? 1 : opt.runShoulderScale ?? 1;
      if (scale !== 1) {
        shoulder.quaternion.slerp(id, 1 - scale);
        top.updateMatrixWorld(true);
        arm.quaternion.copy(Q(arm.parent).invert().multiply(originalArm[side]));
        top.updateMatrixWorld(true);
      }
    }
    let originalFoot = {};
    for (let side of ["L", "R"]) originalFoot[side] = { foot: Q(t.get("Rig_Foot_" + side)), toe: Q(t.get("Rig_Toes_" + side)) };
    for (let [side, sign] of [["L", 1], ["R", -1]]) {
      let arm = t.get("Rig_UpperArm_" + side), thigh = t.get("Rig_Thigh_" + side), shin = t.get("Rig_Shin_" + side), spread = mode === "walk" ? opt.walkArm ?? 0 : opt.runArm ?? 0, forward = mode === "walk" ? opt.walkForward ?? 0 : opt.runForward ?? 0, leg = mode === "walk" ? opt.walkLeg ?? 1 : opt.runLeg ?? 1, knee = mode === "walk" ? opt.walkShin ?? 1 : opt.runShin ?? 1;
      arm.quaternion.slerp(id, 1 - (mode === "walk" ? opt.walkArmScale ?? 1 : opt.runArmScale ?? 1)).premultiply(new Quaternion().setFromAxisAngle(Z, sign * spread * deg)).premultiply(new Quaternion().setFromAxisAngle(X, -forward * deg)).normalize();
      if (leg !== 1) thigh.quaternion.slerp(id, 1 - leg);
      if (knee !== 1) shin.quaternion.slerp(id, 1 - knee);
    }
    top.updateMatrixWorld(true);
    for (const side of ["L", "R"]) {
      let foot = t.get("Rig_Foot_" + side), toe = t.get("Rig_Toes_" + side);
      foot.quaternion.copy(Q(foot.parent).invert().multiply(originalFoot[side].foot));
      top.updateMatrixWorld(true);
      toe.quaternion.copy(Q(toe.parent).invert().multiply(originalFoot[side].toe));
      top.updateMatrixWorld(true);
    }
    for (let [n, arr] of rotations) {
      let q = t.get(n).quaternion.clone(), p = last.get(n);
      if (p && p.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      q.toArray(arr, 4 * i);
      last.set(n, q);
    }
    let hip = P(s.get(spec.hips));
    rawRoot.push(hip.toArray());
    let low = Infinity;
    for (let side of ["L", "R"]) {
      let foot = s.get(spec.foot(side));
      low = Math.min(low, P(foot).add(proxies[side].heel.clone().applyQuaternion(Q(foot))).y);
      if (spec.toe) {
        let toe = s.get(spec.toe(side));
        low = Math.min(low, P(toe).add(proxies[side].toe.clone().applyQuaternion(Q(toe))).y);
      }
    }
    clear.push(low * ratio);
  }
  let seamFrames = Math.round(frames * 0.1), smooth = (x) => {
    x = Math.min(1, Math.max(0, x));
    return x * x * (3 - 2 * x);
  }, maxSeam = 0;
  for (let arr of rotations.values()) {
    let a = new Quaternion().fromArray(arr, 0), b = new Quaternion().fromArray(arr, 4 * frames);
    if (a.dot(b) < 0) b.set(-b.x, -b.y, -b.z, -b.w);
    let mid2 = a.clone().slerp(b, 0.5), da = mid2.clone().multiply(a.clone().invert()), db = mid2.clone().multiply(b.clone().invert());
    for (let i = 0; i <= frames; i++) {
      let f = i < seamFrames ? 1 - smooth(i / seamFrames) : i > frames - seamFrames ? smooth((i - (frames - seamFrames)) / seamFrames) : 0;
      if (!f) continue;
      let q = new Quaternion().fromArray(arr, 4 * i), old = q.clone();
      q.premultiply(id.clone().slerp(i < frames / 2 ? da : db, f)).normalize();
      maxSeam = Math.max(maxSeam, q.angleTo(old));
      q.toArray(arr, 4 * i);
    }
    arr.set(arr.slice(0, 4), 4 * frames);
    for (let i = 1; i <= frames; i++) {
      let q0 = new Quaternion().fromArray(arr, 4 * (i - 1)), q1 = new Quaternion().fromArray(arr, 4 * i);
      if (q0.dot(q1) < 0) for (let k = 0; k < 4; k++) arr[4 * i + k] *= -1;
    }
  }
  let avg = [0, 1, 2].map((k) => rawRoot.reduce((v, p) => v + p[k], 0) / rawRoot.length);
  for (let i = 0; i <= frames; i++) for (let k = 0; k < 3; k++) trans[3 * i + k] = (rawRoot[i][k] - avg[k]) * ratio * (k === 1 ? opt.vertical ?? 0.5 : opt.horiz ?? 0.5);
  let mid = [0, 1, 2].map((k) => (trans[k] + trans[3 * frames + k]) / 2), first = Array.from(trans.slice(0, 3)), final = Array.from(trans.slice(3 * frames, 3 * frames + 3));
  for (let i = 0; i <= frames; i++) {
    let f = i < seamFrames ? 1 - smooth(i / seamFrames) : i > frames - seamFrames ? smooth((i - (frames - seamFrames)) / seamFrames) : 0;
    for (let k = 0; k < 3; k++) trans[3 * i + k] += (mid[k] - (i < frames / 2 ? first[k] : final[k])) * f;
  }
  trans.set(trans.slice(0, 3), 3 * frames);
  let target = doc.createAnimation(name), time = doc.createAccessor(name + "_time", buffer).setType(Accessor.Type.SCALAR).setArray(times);
  add("Rig_Root", "translation", Accessor.Type.VEC3, trans);
  for (let [n, arr] of rotations) add(n, "rotation", Accessor.Type.VEC4, arr);
  let ev = makeEvaluator(root, "NewBody", name), low0 = Math.min(...clear), raw = [], correction = [];
  for (let i = 0; i <= frames; i++) {
    let low = Math.min(...ev.lows(times[i])), extra = mode === "walk" ? Math.min(5e-3, Math.max(0, clear[i] - low0)) : (opt.runFlightScale ?? 1) * Math.min(0.13, Math.max(0, clear[i] - low0));
    raw.push(low);
    correction.push(2e-3 + extra - low);
  }
  let delta = new Float32Array(frames + 1), radius = mode === "walk" ? opt.walkRadius ?? 0.03 : opt.runRadius ?? 0.025;
  for (let i = 0; i < frames; i++) {
    let sum = 0, w = 0;
    for (let j = 0; j < frames; j++) {
      let d = Math.min(Math.abs(times[i] - times[j]), duration - Math.abs(times[i] - times[j]));
      if (d < radius) {
        let v = 0.5 * (1 + Math.cos(Math.PI * d / radius));
        sum += v * correction[j];
        w += v;
      }
    }
    delta[i] = sum / w;
  }
  delta[frames] = delta[0];
  for (let i = 0; i <= frames; i++) trans[i * 3 + 1] += delta[i];
  trans.set(trans.slice(0, 3), 3 * frames);
  target.listChannels().find((c) => c.getTargetNode().getName() === "Rig_Root").getSampler().getOutput().setArray(trans);
  report.clips.push({ source, name, duration, frames, maxSeamDegrees: maxSeam / deg, sourceLowRange: [Math.min(...clear), Math.max(...clear)], rawLowRange: [Math.min(...raw), Math.max(...raw)], rootCorrectionRange: [Math.min(...delta), Math.max(...delta)], rootYRange: [Math.min(...Array.from(trans).filter((_, i) => i % 3 === 1)), Math.max(...Array.from(trans).filter((_, i) => i % 3 === 1))] });
}
// Round-trip to discard the disposed previous animation graph, then rename and
// lengthen only the run by 10%. No prior C animation is used in the new clips.
let finalDoc = await io.readBinary(await io.writeBinary(doc));
for (const anim of finalDoc.getRoot().listAnimations()) {
  const run = anim.getName() === "Human2017_Run";
  anim.setName(run ? "Run_Game_Trial" : "Walk_Game_Trial");
  if (run) for (const input of new Set(anim.listSamplers().map(s => s.getInput())))
    input.setArray(Float32Array.from(input.getArray(), v => v * 1.1));
}
// Removing the previous animation does not automatically delete its accessors.
// Read once more and discard root-only accessors rather than retaining old data.
const clean = await io.readBinary(await io.writeBinary(finalDoc));
let removedUnusedAccessors = 0;
for (const accessor of [...clean.getRoot().listAccessors()]) {
  if (accessor.listParents().every(parent => parent.propertyType === "Root")) {
    accessor.dispose(); removedUnusedAccessors++;
  }
}
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.mkdirSync(path.dirname(reportPath), {recursive: true});
await io.write(out, clean);
for (const clip of report.clips) {
  const run = clip.name === "Human2017_Run";
  clip.name = run ? "Run_Game_Trial" : "Walk_Game_Trial";
  if (run) clip.duration *= 1.1;
}
report.base = "work/male-gait-refine/male_gait_C_refined.glb";
report.sourcePath = "tools/male-game-gait/source/character.glb";
report.runTimeScale = 1.1;
report.removedUnusedAccessors = removedUnusedAccessors;
report.sha256 = hash(fs.readFileSync(out));
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
