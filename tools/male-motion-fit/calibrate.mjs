// Bake the vertical root trajectory after the swing-foot correction. A small
// near-ground tolerance makes the source's point markers useful for this mesh;
// flight is retained. No horizontal locking or ground physics is implied.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Accessor, NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {makeEvaluator} from './pose.mjs';
if (process.argv.length !== 6) throw Error('Usage: node calibrate.mjs adjusted.glb intermediate.json final.glb report.json');
const [input, infoPath, output, reportPath] = process.argv.slice(2);
assert.notEqual(input, output, 'Do not overwrite input');
const io = new NodeIO(), doc = await io.read(input), root = doc.getRoot(), buffer = root.listBuffers()[0];
const info = JSON.parse(fs.readFileSync(infoPath, 'utf8')), report = {};
export function desiredClearance(clear, threshold) {
  const width = .015, x = Math.max(0, clear - threshold), u = x / width;
  return x < width ? width * (2 * u * u - u * u * u) : x;
}
for (const [name, count, threshold] of [['Walk_C', 1024, .022], ['Run_C', 768, .012]]) {
  const evaluator = makeEvaluator(root, 'NewBody', name), c = info.clips[name];
  assert.ok(Math.abs(evaluator.duration - c.duration) < 2e-6);
  const times = new Float32Array(count + 1), translations = new Float32Array((count + 1) * 3), changes = [], desired = [];
  for (let i = 0; i <= count; i++) {
    const u = i / count, t = evaluator.duration * u, low = Math.min(...evaluator.lows(t)), tr = evaluator.rootTranslation(t);
    const frame = u * c.frames, j = Math.min(c.frames - 1, Math.floor(frame)), f = frame - j;
    const source = c.sourceClear[j] * (1 - f) + c.sourceClear[j + 1] * f;
    const height = desiredClearance(source, threshold), change = height - low;
    times[i] = t; translations.set([tr[0], tr[1] + change, tr[2]], i * 3); changes.push(change); desired.push(height);
  }
  for (let j = 0; j < 3; j++) translations[count * 3 + j] = translations[j];
  const animation = root.listAnimations().find(a => a.getName() === name);
  const channel = animation.listChannels().find(c => c.getTargetNode().getName() === 'Rig_Root' && c.getTargetPath() === 'translation');
  const sampler = channel.getSampler(), oldInput = sampler.getInput(), oldOutput = sampler.getOutput();
  sampler.setInput(doc.createAccessor(`${name}_sole_times`, buffer).setType(Accessor.Type.SCALAR).setArray(times));
  sampler.setOutput(doc.createAccessor(`${name}_sole_root`, buffer).setType(Accessor.Type.VEC3).setArray(translations));
  oldInput.dispose(); oldOutput.dispose();
  report[name] = {samples: count + 1, soleVerticesPerSide: evaluator.selected, nearGroundToleranceMeters: threshold, easingWidthMeters: .015,
    minimumRootAdjustmentMeters: Math.min(...changes), maximumRootAdjustmentMeters: Math.max(...changes),
    minimumDesiredClearanceMeters: Math.min(...desired), maximumDesiredClearanceMeters: Math.max(...desired),
    method: 'Match the lowest sampled skinned foot to the adjusted source-marker height; no horizontal lock.'};
  console.log(name, report[name]);
}
await io.write(output, doc);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
