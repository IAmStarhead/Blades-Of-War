// Soften sharp vertical root changes introduced by matching a lowest vertex.
// The smoothed curve is raised by a local upper envelope, so at every root
// key it is never below the original. Both curves are LINEAR with identical
// times; between keys this also prevents the smoothing itself from lowering
// the character. No horizontal foot lock is introduced.
import assert from 'node:assert/strict';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';

if (process.argv.length !== 4) throw Error('Usage: node smooth-root.mjs input.glb output.glb');
const [input, output] = process.argv.slice(2);
assert.notEqual(input, output, 'Do not overwrite input');
const io = new NodeIO(), doc = await io.read(input), root = doc.getRoot(), report = {};
const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)];
};
for (const [name, sigmaSeconds, maximumLift] of [['Walk_C', .008, .0015], ['Run_C', .006, .0045]]) {
  const ev = makeEvaluator(root, 'NewBody', name), anim = root.listAnimations().find(a => a.getName() === name);
  const channel = anim.listChannels().find(c => c.getTargetNode().getName() === 'Rig_Root' && c.getTargetPath() === 'translation');
  const sampler = channel.getSampler(), times = sampler.getInput().getArray(), values = sampler.getOutput().getArray().slice();
  assert.equal(sampler.getInterpolation(), 'LINEAR'); assert.equal(values.length, times.length * 3);
  const n = times.length - 1, dt = ev.duration / n;
  assert.ok(n > 100 && Math.abs(times[0]) < 1e-8);
  for (let i = 0; i <= n; i++) assert.ok(Math.abs(times[i] - i * dt) < 2e-6, `${name} requires uniform root samples`);
  for (let k = 0; k < 3; k++) assert.equal(values[k], values[3 * n + k], `${name} root must already loop`);
  const wrap = i => ((i % n) + n) % n, sigma = sigmaSeconds / dt, radius = Math.ceil(3 * sigma);
  const kernel = Array.from({length: 2 * radius + 1}, (_, i) => Math.exp(-.5 * ((i - radius) / sigma) ** 2));
  const sum = kernel.reduce((a, b) => a + b, 0); for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const oldY = Float64Array.from({length: n}, (_, i) => values[3 * i + 1]);
  const blur = (a, i) => kernel.reduce((s, weight, j) => s + weight * a[wrap(i + j - radius)], 0);
  const smooth = Float64Array.from(oldY, (_, i) => blur(oldY, i));
  const error = Float64Array.from(oldY, (v, i) => Math.max(0, v - smooth[i]));
  const envelope = Float64Array.from(error, (_, i) => {
    let maximum = 0;
    for (let j = -radius; j <= radius; j++) maximum = Math.max(maximum, error[wrap(i + j)]);
    return maximum;
  });
  const newY = Float64Array.from(smooth, (v, i) => v + blur(envelope, i));
  const lift = Array.from(newY, (v, i) => v - oldY[i]);
  assert.ok(Math.min(...lift) > -1e-8 && Math.max(...lift) < maximumLift, `${name}: unexpected root lift`);
  const acceleration = a => Array.from(a, (_, i) => Math.abs(a[wrap(i + 1)] - 2 * a[i] + a[wrap(i - 1)]) / (dt * dt));
  const before = acceleration(oldY), after = acceleration(newY);
  for (let i = 0; i < n; i++) values[3 * i + 1] = newY[i];
  values[3 * n + 1] = values[1]; sampler.getOutput().setArray(values);
  report[name] = {sigmaSeconds, samples: n + 1, minimumLiftMeters: Math.min(...lift),
    maximumLiftMeters: Math.max(...lift), p95LiftMeters: quantile(lift, .95),
    maximumSampledAccelerationBeforeMps2: Math.max(...before), maximumSampledAccelerationAfterMps2: Math.max(...after),
    method: 'Cyclic Gaussian with a smoothed upper envelope; changes root Y only and never intentionally lowers it.'};
}
await io.write(output, doc);
console.log(JSON.stringify(report, null, 2));
