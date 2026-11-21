// Diagnostics use a near-floor lowest vertex and do not measure true foot slip.
import { NodeIO } from "../male-library-motion/node_modules/@gltf-transform/core/dist/index.js";
import { makeEvaluator } from "../male-motion-fit/pose.mjs";
import { Vector3, Quaternion } from "../male-library-motion/node_modules/three/build/three.module.js";
const file = process.argv[2] || "work/male-game-gait/male_game_gait_trial.glb", clips = ["Walk_Game_Trial", "Run_Game_Trial"], r = (await new NodeIO().read(file)).getRoot(), P = (x) => x.getWorldPosition(new Vector3()), Q = (x) => x.getWorldQuaternion(new Quaternion()), qs = (a, q) => {
  if (!a.length) return null;
  a = [...a].sort((a2, b) => a2 - b);
  return a[Math.floor(q * (a.length - 1))];
}, fmt = (x) => x === null ? null : +x.toFixed(4);
const reports = [];
for (let name of clips) {
  let ev = makeEvaluator(r, "NewBody", name), N = 960, dt = ev.duration / N / 8, lows = [], bothAir = 0, penetrated = 0, vel = [], angles = [], lastQ = {}, rates = {}, rootVel = [], lastRoot;
  let ev2 = makeEvaluator(r, "NewBody", name);
  let dn = ["Rig_Thigh_L", "Rig_Shin_L", "Rig_Foot_L", "Rig_UpperArm_L", "Rig_Forearm_L", "Rig_Neck", "Rig_Hips"];
  for (let bone of dn) rates[bone] = [];
  for (let i = 0; i < N; i++) {
    let t = ev.duration * (i + 0.37) / N, feet = ev.footDetails(t), low = Math.min(...feet.map((f) => f.point[1]));
    lows.push(low);
    if (low > 0.015) bothAir++;
    if (low < -3e-3) penetrated++;
    for (let f of feet) if (f.point[1] < 8e-3) {
      let a = ev2.vertex(Math.max(0, t - dt), f.index), b = ev2.vertex(Math.min(ev.duration, t + dt), f.index);
      let div = Math.min(ev.duration, t + dt) - Math.max(0, t - dt);
      vel.push([(b[0] - a[0]) / div, (b[2] - a[2]) / div]);
    }
    ev.pose(t);
    for (let s of ["L", "R"]) {
      let h = P(ev.bones.get("Rig_Thigh_" + s)), k = P(ev.bones.get("Rig_Shin_" + s)), a = P(ev.bones.get("Rig_Foot_" + s));
      angles.push(k.sub(h).normalize().angleTo(a.sub(P(ev.bones.get("Rig_Shin_" + s))).normalize()) * 180 / Math.PI);
    }
    for (let n of dn) {
      let q = Q(ev.bones.get(n));
      if (lastQ[n]) rates[n].push(q.angleTo(lastQ[n]) * 180 / Math.PI * N / ev.duration);
      lastQ[n] = q;
    }
    let root = ev.rootTranslation(t);
    if (lastRoot) rootVel.push(Math.hypot(...root.map((v, k) => v - lastRoot[k])) * N / ev.duration);
    lastRoot = root;
  }
  let speed = vel.length ? -qs(vel.map((v) => v[1]), 0.5) : 0, res = vel.map((v) => Math.hypot(v[0], v[1] + speed));
  reports.push({ file, name, duration: ev.duration, lowestSoleMM: { min: fmt(1e3 * Math.min(...lows)), p05: fmt(1e3 * qs(lows, 0.05)), p50: fmt(1e3 * qs(lows, 0.5)), p95: fmt(1e3 * qs(lows, 0.95)), max: fmt(1e3 * Math.max(...lows)) }, samples: N, bothFeetAbove15mm: bothAir, lowestBelowMinus3mm: penetrated, closeFeetSamples: vel.length, nearFloorLowVertexProxy: { thresholdMm: 8, medianForwardMps: fmt(speed), residualP50Mps: fmt(qs(res, 0.5)), residualP95Mps: fmt(qs(res, 0.95)), note: "NOT planted foot slip: includes roll, landing, takeoff and changes in the selected lowest vertex" }, kneeFlexDegrees: { min: fmt(Math.min(...angles)), p95: fmt(qs(angles, 0.95)), max: fmt(Math.max(...angles)) }, worldAngularSpeedDegPerSec: Object.fromEntries(Object.entries(rates).map(([n, v]) => [n, { p95: fmt(qs(v, 0.95)), max: fmt(Math.max(...v)) }])), rootSpeed: { p95: fmt(qs(rootVel, 0.95)), max: fmt(Math.max(...rootVel)) } });
}
console.log(JSON.stringify(reports, null, 2));
