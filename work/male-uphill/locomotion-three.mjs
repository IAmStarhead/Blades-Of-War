// Runtime used by the trial viewer. The GLB itself is never rewritten.
// Requires Three.js and this rig's named clips/mesh. See README for integration
// limitations: in-place gait, a flat world-Y floor and no horizontal foot lock.
import {AnimationMixer, Matrix4, Vector3} from 'three';
import {PhaseClock} from './phase-clock.mjs';
import {floorEnvelope} from './floor-envelope.mjs';

// Select the same rest-space foot region as the source model's sampled QA.
// It is a practical floor guard for this particular body, not general IK.
function createSoleGuard(model, root, mesh, floorY) {
  const geometry = mesh.geometry, p = geometry.getAttribute('position');
  const joints = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
  if (!p || !joints || !weights || !mesh.skeleton || !root.parent) throw Error('Missing skinned sole data');
  const points = [], used = new Set();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y >= .16 || Math.abs(x) <= .035 || Math.abs(x) >= .25) continue;
    const influences = [];
    for (let k = 0; k < 4; k++) {
      const w = weights.getComponent(i, k), j = joints.getComponent(i, k);
      if (w > 1e-8) {
        if (!mesh.skeleton.bones[j]) throw Error('Invalid skin joint');
        influences.push([j, w]); used.add(j);
      }
    }
    if (influences.length) points.push({x, y, z, influences});
  }
  if (points.length < 100) throw Error('Expected this character’s sole vertices');
  const matrices = mesh.skeleton.bones.map(() => new Matrix4());
  const prefix = new Matrix4(), inverseParent = new Matrix4();
  const parentDelta = new Vector3();
  function apply(phase, weight) {
    model.updateWorldMatrix(true, true);
    // local skinned vertex -> world: meshWorld * bindInverse * boneWorld *
    // boneInverse * bind. Include the mesh transforms rather than assuming
    // the preview's identity matrices.
    prefix.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse);
    for (const j of used) matrices[j].copy(prefix).multiply(mesh.skeleton.bones[j].matrixWorld)
      .multiply(mesh.skeleton.boneInverses[j]).multiply(mesh.bindMatrix);
    let minimum = Infinity;
    for (const point of points) {
      let y = 0;
      for (const [j, w] of point.influences) {
        const e = matrices[j].elements;
        y += w * (e[1] * point.x + e[5] * point.y + e[9] * point.z + e[13]);
      }
      minimum = Math.min(minimum, y - floorY);
    }
    // C1-smoothed positive part: zero above 2 mm; rises smoothly to a full
    // correction below the floor. At/below the floor it targets 1 mm clearance.
    const x = .002 - minimum;
    const required = x <= 0 ? 0 : x < .002 ? x * x / .004 : x - .001;
    // Anticipate a nearby dip so that a small root lift is spread across the
    // gait rather than reacting in one frame. Retain the measured fallback
    // in case the sampled envelope underestimates an actual blended pose.
    const anticipated = floorEnvelope(phase, weight);
    const lift = Math.max(required, anticipated);
    if (lift > 0) {
      inverseParent.copy(root.parent.matrixWorld).invert();
      const e = inverseParent.elements;
      parentDelta.set(e[4] * lift, e[5] * lift, e[6] * lift);
      root.position.add(parentDelta);
      model.updateWorldMatrix(true, true);
    }
    return {minimumBefore: minimum, lift, required, anticipated, vertices: points.length};
  }
  return {apply, vertices: points.length};
}

export class LocomotionTransition {
  constructor(model, animations, {floorY = 0, guardFloor = true} = {}) {
    this.model = model;
    this.root = model.getObjectByName('Rig_Root');
    const mesh = model.getObjectByName('NewBody');
    const walk = animations.find(clip => clip.name === 'Walk_Game_Trial');
    const run = animations.find(clip => clip.name === 'Run_Game_Trial');
    if (!this.root || !mesh?.isSkinnedMesh || !walk || !run ||
        !walk.tracks.some(t => t.name === 'Rig_Root.position') || !run.tracks.some(t => t.name === 'Rig_Root.position'))
      throw Error('Expected the pinned character, root track and walk/run clips');
    if (!Number.isFinite(floorY)) throw Error('Floor height must be finite');
    this.clock = new PhaseClock(walk.duration, run.duration);
    this.mixer = new AnimationMixer(model);
    this.walk = this.mixer.clipAction(walk).reset().play();
    this.run = this.mixer.clipAction(run).reset().play();
    // Time is controlled explicitly; both actions remain enabled even at zero
    // weight so that the missing run finger tracks blend back to bind pose.
    this.walk.paused = this.run.paused = true;
    this.guard = guardFloor ? createSoleGuard(model, this.root, mesh, floorY) : null;
    this.baseRootPosition = null;
    this.floor = {minimumBefore: null, lift: 0, vertices: this.guard?.vertices || 0};
    this.apply();
  }
  setTarget(mode) { this.clock.setTarget(mode); }
  setPhase(phase) { this.clock.setPhase(phase); this.apply(); }
  reset(mode = 'walk', phase = 0) { this.clock.reset(mode, phase); this.apply(); }
  step(seconds) { this.clock.step(seconds); this.apply(); }
  apply() {
    // PropertyMixer caches its last output and can skip writing unchanged
    // values. Undo our previous lift first, otherwise a paused re-render
    // could accumulate it. Both pinned clips animate Rig_Root.position.
    if (this.baseRootPosition) this.root.position.copy(this.baseRootPosition);
    this.walk.time = this.clock.phase * this.clock.walkDuration;
    this.run.time = this.clock.runPhase * this.clock.runDuration;
    this.walk.setEffectiveWeight(1 - this.clock.weight);
    this.run.setEffectiveWeight(this.clock.weight);
    this.mixer.update(0);
    if (!this.baseRootPosition) this.baseRootPosition = this.root.position.clone();
    else this.baseRootPosition.copy(this.root.position);
    this.floor = this.guard ? this.guard.apply(this.clock.phase, this.clock.weight) : {minimumBefore: null, lift: 0, vertices: 0};
    if (!this.guard) this.model.updateWorldMatrix(true, true);
  }
  dispose() {
    if (this.baseRootPosition) this.root.position.copy(this.baseRootPosition);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
  }
}
