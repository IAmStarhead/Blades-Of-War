// Phase-locked, reversible walk/run timing; independent of Three.js.
// phase is the WALK clip's normalized cycle; run is sampled with RUN_PHASE_OFFSET.
export const RUN_PHASE_OFFSET = -3 / 32;
export const RESPONSE = 18; // critically damped response to the measured speed blend
export const WALK_SPEED = 1.44; // approximate visual grid speed, metres/second
export const RUN_SPEED = 4.37;
export const wrapPhase = phase => ((phase % 1) + 1) % 1;

export class PhaseClock {
  constructor(walkDuration, runDuration) {
    if (!(Number.isFinite(walkDuration) && walkDuration > 0 && Number.isFinite(runDuration) && runDuration > 0))
      throw Error('Both locomotion durations must be positive and finite');
    this.walkDuration = walkDuration;
    this.runDuration = runDuration;
    this.reset('walk', 0);
  }
  reset(mode = 'walk', phase = 0) {
    if (!['walk', 'run'].includes(mode) || !Number.isFinite(phase)) throw Error('Invalid reset');
    this.phase = wrapPhase(phase);
    this.weight = mode === 'run' ? 1 : 0;
    this.velocity = 0;
    this.target = this.weight;
    this.distance = 0;
  }
  setTarget(mode) {
    if (!['walk', 'run'].includes(mode)) throw Error('Unknown locomotion target');
    this.setTargetWeight(mode === 'run' ? 1 : 0);
  }
  setTargetWeight(weight) {
    if (!Number.isFinite(weight)) throw Error('Locomotion weight must be finite');
    // The target follows actual travel speed. Keep phase and spring velocity
    // on changes/reversals so a quick toggle cannot snap the blend.
    this.target = Math.max(0, Math.min(1, weight));
  }
  setPhase(phase) {
    if (!Number.isFinite(phase)) throw Error('Phase must be finite');
    this.phase = Math.max(0, Math.min(1, phase));
  }
  get runPhase() { return wrapPhase(this.phase + RUN_PHASE_OFFSET); }
  get speed() { return WALK_SPEED + (RUN_SPEED - WALK_SPEED) * this.weight; }
  step(dt) {
    if (!(Number.isFinite(dt) && dt >= 0)) throw Error('Elapsed seconds must be finite and non-negative');
    if (dt === 0) return;
    const omega = RESPONSE, x = omega * dt, e = Math.exp(-x);
    const w = this.weight, v = this.velocity, d = w - this.target, b = v + omega * d;
    // Exact integral of the critically damped weight over the frame. This
    // makes gait phase and grid distance independent of frame subdivision.
    // A Taylor series avoids cancellation for very small time increments.
    let integral;
    if (x < 1e-3) {
      const a = omega * omega * (this.target - w) - 2 * omega * v;
      const j = -omega * omega * v - 2 * omega * a;
      integral = w * dt + v * dt ** 2 / 2 + a * dt ** 3 / 6 + j * dt ** 4 / 24;
    } else {
      const oneMinusE = -Math.expm1(-x);
      const oneMinusOnePlusXE = oneMinusE - x * e;
      integral = this.target * dt + d * oneMinusE / omega + b * oneMinusOnePlusXE / (omega * omega);
    }
    this.weight = this.target + (d + b * dt) * e;
    this.velocity = (v - omega * b * dt) * e;
    // Roundoff may place the endpoints a few ulps outside the legal range.
    this.weight = Math.max(0, Math.min(1, this.weight));
    this.phase = wrapPhase(this.phase + dt / this.walkDuration +
      (1 / this.runDuration - 1 / this.walkDuration) * integral);
    this.distance += WALK_SPEED * dt + (RUN_SPEED - WALK_SPEED) * integral;
    // Stop infinitesimal tails so the settled pose is exactly the source clip.
    if (Math.abs(this.weight - this.target) < 1e-7 && Math.abs(this.velocity) < 1e-6) {
      this.weight = this.target;
      this.velocity = 0;
    }
  }
}
