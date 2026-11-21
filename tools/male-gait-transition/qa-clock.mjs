// Deterministic timing checks: reversals, frame subdivision and edge cases.
import assert from 'node:assert/strict';
import {PhaseClock, RUN_PHASE_OFFSET, RESPONSE, wrapPhase} from './phase-clock.mjs';
const walk = 1.0416666269302368, run = .7333333492279053;
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
assert.equal(RUN_PHASE_OFFSET, -.09375);
assert.equal(RESPONSE, 11);
assert.equal(wrapPhase(-.09375), .90625);
for (const input of [0, -1, NaN, Infinity]) assert.throws(() => new PhaseClock(input, run));
const clock = new PhaseClock(walk, run);
for (const input of [-1, NaN, Infinity]) assert.throws(() => clock.step(input));
assert.throws(() => clock.setTarget('stand'));
assert.throws(() => clock.setPhase(NaN));
clock.reset('walk', .371); clock.setTarget('run'); clock.step(.2);
const before = [clock.phase, clock.weight, clock.velocity, clock.distance, clock.speed];
clock.setTarget('walk');
assert.deepEqual([clock.phase, clock.weight, clock.velocity, clock.distance, clock.speed], before, 'reversal must not change the current state');
assert.ok(clock.velocity > 0, 'reversal retains the old velocity before deceleration');
clock.step(.4); assert.ok(clock.weight < before[1], 'reversal heads toward walking');
clock.setPhase(1); assert.equal(clock.phase, 1); near(clock.runPhase, .90625, 1e-14);
clock.setPhase(-2); assert.equal(clock.phase, 0); clock.setPhase(2); assert.equal(clock.phase, 1);
for (const mode of ['walk', 'run']) {
  clock.reset(mode, .123); clock.step(1.1);
  near(clock.phase, wrapPhase(.123 + 1.1 / (mode === 'walk' ? walk : run)), 1e-12);
  near(clock.speed, mode === 'walk' ? 1.44 : 4.37, 1e-12);
}
clock.reset('walk', 0); clock.setTarget('run'); clock.step(.5);
assert.ok(clock.weight > .97 && clock.weight < 1, 'most of transition takes about half a second');
clock.step(1.5); assert.equal(clock.weight, 1); assert.equal(clock.velocity, 0);

// Compare the analytic state/distance with many differently subdivided frames
// while switching direction at identical event times.
let seed = 0x8731ad2f;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
let maxDiff = 0;
for (let trial = 0; trial < 100; trial++) {
  const a = new PhaseClock(walk, run), b = new PhaseClock(walk, run);
  const mode = random() < .5 ? 'walk' : 'run', phase = random();
  a.reset(mode, phase); b.reset(mode, phase);
  for (let event = 0; event < 50; event++) {
    const target = random() < .5 ? 'walk' : 'run', dt = .001 + random() * .3;
    a.setTarget(target); b.setTarget(target); a.step(dt);
    const parts = 1 + Math.floor(random() * 30);
    for (let j = 0; j < parts; j++) b.step(dt / parts);
    assert.ok(a.weight >= 0 && a.weight <= 1 && b.weight >= 0 && b.weight <= 1);
    for (const key of ['phase', 'weight', 'velocity', 'distance']) {
      const diff = Math.abs(a[key] - b[key]); maxDiff = Math.max(maxDiff, diff);
      assert.ok(diff < 5e-6, `frame subdivision ${key}: ${diff}`);
    }
    near(a.runPhase, wrapPhase(a.phase + RUN_PHASE_OFFSET), 1e-14);
  }
}
console.log(`PASS timing: phase-locked endpoints, reversal continuity, settled source speeds, invalid input, 5,000 rapid-switch segments; max subdivision error ${maxDiff.toExponential(2)}.`);
