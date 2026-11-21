// Exports selected body triangle subsets and off-key CPU-skinned poses.
// Scratch output is large and must not be committed. See DEVELOPMENT.md.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import { NodeIO } from "../male-library-motion/node_modules/@gltf-transform/core/dist/index.js";
import { Matrix4 } from "../male-library-motion/node_modules/three/build/three.module.js";
import { makeEvaluator } from "../male-motion-fit/pose.mjs";
let [file, dest, count = "64"] = process.argv.slice(2);
if (!file || !dest) throw Error("Usage: node qa-export.mjs model.glb samples.json [phase-count]");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dest = path.resolve(dest);
if (dest === repo || dest.startsWith(repo + path.sep)) throw Error('Write scratch samples outside the repository');
count = +count;
if (!Number.isInteger(count) || count < 4 || count > 256) throw Error("Phase count must be 4..256");
let walk = "Walk_Game_Trial", run = "Run_Game_Trial";
let root = (await new NodeIO().read(file)).getRoot(), skin = root.listSkins()[0], prim = root.listNodes().find((n) => n.getName() === "NewBody").getMesh().listPrimitives()[0], pos = prim.getAttribute("POSITION").getArray(), joint = prim.getAttribute("JOINTS_0").getArray(), weights = prim.getAttribute("WEIGHTS_0").getArray(), indices = prim.getIndices().getArray();
const predicates = { kneeL: ([x, y]) => x > 0.03 && x < 0.25 && y > 0.39 && y < 0.69, kneeR: ([x, y]) => x < -0.03 && x > -0.25 && y > 0.39 && y < 0.69, elbowL: ([x, y]) => x > 0.17 && x < 0.37 && y > 1.07 && y < 1.3, elbowR: ([x, y]) => x < -0.17 && x > -0.37 && y > 1.07 && y < 1.3, shoulderL: ([x, y]) => x > 0.08 && x < 0.38 && y > 1.25 && y < 1.51, shoulderR: ([x, y]) => x < -0.08 && x > -0.38 && y > 1.25 && y < 1.51, hip: ([x, y]) => Math.abs(x) < 0.29 && y > 0.72 && y < 1.11, handL: ([x, y]) => x > 0.24 && y < 1.04 && y > 0.74, handR: ([x, y]) => x < -0.24 && y < 1.04 && y > 0.74, torso: ([x, y]) => Math.abs(x) < 0.23 && y > 0.8 && y < 1.48, footL: ([x, y]) => x > 0.035 && x < 0.25 && y < 0.2, footR: ([x, y]) => x < -0.035 && x > -0.25 && y < 0.2, neck: ([x, y]) => Math.abs(x) < 0.12 && y > 1.495 && y < 1.56 };
const P = Array.from({ length: pos.length / 3 }, (_, i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]), groups = Object.fromEntries(Object.keys(predicates).map((k) => [k, []]));
for (let i = 0; i < indices.length; i += 3) {
  let tr = [indices[i], indices[i + 1], indices[i + 2]];
  for (let [key, test] of Object.entries(predicates)) if (tr.some((id) => test(P[id]))) groups[key].push(...tr);
}
let selected = [...new Set(Object.values(groups).flat())].sort((a, b) => a - b), remap = new Map(selected.map((id, i) => [id, i]));
for (let k of Object.keys(groups)) groups[k] = groups[k].map((id) => remap.get(id));
const base = selected.flatMap((i) => P[i]), states = { stand: Buffer.from(Float32Array.from(base).buffer).toString("base64") }, ibm = skin.getInverseBindMatrices().getArray(), names = skin.listJoints().map((n) => n.getName()), inverse = names.map((_, i) => new Matrix4().fromArray(ibm, 16 * i)), matrices = names.map(() => new Matrix4());
for (let [mode, name] of [["walk", walk], ["run", run]]) {
  let ev = makeEvaluator(root, "NewBody", name);
  for (let f = 0; f < count; f++) {
    ev.pose(ev.duration * (f + 0.37) / count);
    for (let i = 0; i < names.length; i++) matrices[i].copy(ev.bones.get(names[i]).matrixWorld).multiply(inverse[i]);
    let result = new Float32Array(selected.length * 3);
    for (let k = 0; k < selected.length; k++) {
      let i = selected[k], x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2], a = 0, b = 0, c = 0;
      for (let j = 0; j < 4; j++) {
        let w = weights[4 * i + j];
        if (!w) continue;
        let e = matrices[joint[4 * i + j]].elements;
        a += w * (e[0] * x + e[4] * y + e[8] * z + e[12]);
        b += w * (e[1] * x + e[5] * y + e[9] * z + e[13]);
        c += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
      }
      result.set([a, b, c], 3 * k);
    }
    states[`${mode}-${f}`] = Buffer.from(result.buffer).toString("base64");
  }
}
fs.writeFileSync(dest, JSON.stringify({ count, base, groups, states }));
console.log(file, "selected vertices", selected.length, "sampled phases", 2 * count, "JSON bytes", fs.statSync(dest).size);
