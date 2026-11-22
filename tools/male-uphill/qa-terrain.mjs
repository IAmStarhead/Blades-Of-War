import assert from 'node:assert/strict';
import {RampTerrain, START, END, SHOULDER, SPAWN, FINISH} from './terrain.mjs';
assert.ok(SPAWN < START && FINISH > END + SHOULDER);
let samples = 0, derivativeError = 0;
for (const degrees of [0, 5, 10, 12.5, 15, 17.5, 20]) {
  const surface = new RampTerrain(degrees), grade = Math.tan(degrees * Math.PI / 180);
  assert.equal(surface.height(0, SPAWN), 0);
  assert.ok(Math.abs(surface.height(0, FINISH) - grade * (END - START)) < 1e-12);
  let previous = surface.height(0, START - 1);
  for (let i = 0; i <= 10000; i++) {
    const z = START - 1 + i * (END - START + 3) / 10000, h = surface.height(0, z), g = surface.gradient(0, z);
    assert.ok(h >= previous - 1e-12 && g.z >= -1e-12 && g.z <= grade + 1e-12);
    assert.equal(g.x, 0); assert.equal(surface.height(2.3, z), h);
    const epsilon = 1e-5, numeric = (surface.height(0, z + epsilon) - surface.height(0, z - epsilon)) / (2 * epsilon);
    derivativeError = Math.max(derivativeError, Math.abs(g.z - numeric)); previous = h; samples++;
  }
  assert.ok(Math.abs(surface.gradient(0, START).z) < 1e-12);
  assert.ok(Math.abs(surface.gradient(0, START + SHOULDER).z - grade) < 1e-12);
  assert.ok(Math.abs(surface.gradient(0, END).z - grade) < 1e-12);
  assert.ok(Math.abs(surface.gradient(0, END + SHOULDER).z) < 1e-12);
}
assert.ok(derivativeError < 1e-8, `gradient mismatch ${derivativeError}`);
for (const value of [-1, 20.001, NaN, Infinity]) assert.throws(() => new RampTerrain(value));
console.log(`PASS ${samples} analytic height/gradient samples, bounds and smooth ramp shoulders; max derivative error ${derivativeError.toExponential(2)}.`);
