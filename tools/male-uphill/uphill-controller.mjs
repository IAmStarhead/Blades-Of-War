// Terrain adaptation for the pinned walk/run trial. This is a bounded
// straight-ahead heightfield demonstration, not a navmesh or physics system.
// An unmodified LocomotionTransition supplies phase-locked blend and speed.
import {Matrix4, Quaternion, Vector3} from 'three';
import {LocomotionTransition} from './locomotion-three.mjs';
import {floorEnvelope} from './floor-envelope.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
const position = b => b.getWorldPosition(new Vector3());
const rotation = b => b.getWorldQuaternion(new Quaternion());
const UP = new Vector3(0, 1, 0), FORWARD = new Vector3(0, 0, 1);

function makeSoleSampler(model, mesh, terrain) {
  const p = mesh.geometry.getAttribute('position'), joints = mesh.geometry.getAttribute('skinIndex');
  const weights = mesh.geometry.getAttribute('skinWeight'), points = {L: [], R: []}, used = new Set();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y >= .16 || Math.abs(x) <= .035 || Math.abs(x) >= .25) continue;
    const influences = [];
    for (let k = 0; k < 4; k++) {
      const w = weights.getComponent(i, k), j = joints.getComponent(i, k);
      if (w > 1e-8) { influences.push([j, w]); used.add(j); }
    }
    if (influences.length) points[x > 0 ? 'L' : 'R'].push({x, y, z, influences});
  }
  if (points.L.length < 100 || points.R.length < 100) throw Error('Missing selected sole vertices');
  const mats = mesh.skeleton.bones.map(() => new Matrix4()), prefix = new Matrix4();
  return function measure(anchorHeight) {
    model.updateWorldMatrix(true, true);
    // SkinnedMesh refreshes bindMatrixInverse in updateMatrixWorld(), not in
    // Object3D.updateWorldMatrix(). This matters as the actor translates.
    mesh.updateMatrixWorld(true);
    prefix.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse);
    for (const j of used) mats[j].copy(prefix).multiply(mesh.skeleton.bones[j].matrixWorld)
      .multiply(mesh.skeleton.boneInverses[j]).multiply(mesh.bindMatrix);
    const result = {L: {flat: Infinity, gap: Infinity}, R: {flat: Infinity, gap: Infinity}, terrainVariation: 0};
    for (const side of ['L', 'R']) for (const point of points[side]) {
      let x = 0, y = 0, z = 0;
      for (const [j, w] of point.influences) {
        const e = mats[j].elements;
        x += w * (e[0] * point.x + e[4] * point.y + e[8] * point.z + e[12]);
        y += w * (e[1] * point.x + e[5] * point.y + e[9] * point.z + e[13]);
        z += w * (e[2] * point.x + e[6] * point.y + e[10] * point.z + e[14]);
      }
      const ground = terrain.height(x, z);
      result[side].flat = Math.min(result[side].flat, y - anchorHeight);
      result[side].gap = Math.min(result[side].gap, y - ground);
      result.terrainVariation = Math.max(result.terrainVariation, Math.abs(ground - anchorHeight));
    }
    return result;
  };
}

// Solve the two-bone leg towards an ankle target (vertical terrain correction
// and, when needed, a shortened stride). Preserve the target foot rotation.
// A small ramp-in avoids a discrete IK switch for millimetre-scale requests.
function fitLeg(model, bones, goal, footWorld) {
  const [thigh, shin, foot] = bones;
  model.updateWorldMatrix(true, true);
  const hip = position(thigh); let knee = position(shin), ankle = position(foot);
  const displacement = goal.distanceTo(ankle);
  const upper = hip.distanceTo(knee), lower = knee.distanceTo(ankle), direction = goal.clone().sub(hip);
  const requested = direction.length();
  if (requested < 1e-8) return {miss: 0, error: 0};
  const minLength = Math.abs(upper - lower) + .001, maxLength = upper + lower - .00001;
  const distance = clamp(requested, minLength, maxLength), miss = Math.abs(requested - distance);
  direction.normalize(); const target = hip.clone().addScaledVector(direction, distance);
  const along = (upper * upper + distance * distance - lower * lower) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const rel = knee.clone().sub(hip), rawPlane = rel.clone().addScaledVector(direction, -rel.dot(direction));
  const forward = FORWARD.clone().addScaledVector(direction, -direction.dot(FORWARD));
  if (forward.lengthSq() < 1e-10) return {miss, error: requested};
  forward.normalize();
  // Prefer the existing knee plane when well defined. As it approaches full
  // extension, smoothly bias to the forward branch to avoid a 180° flip.
  // Limit lateral deviation, but preserve enough of the original direction
  // that a near-zero ankle correction does not snap the knee sideways.
  const lateral = direction.clone().cross(forward).normalize();
  const fwd = rawPlane.dot(forward), across = rawPlane.dot(lateral);
  const side = clamp(across / Math.max(1e-6, Math.hypot(fwd, across)), -.65, .65) * smooth(0, .04, fwd);
  const plane = forward.clone().multiplyScalar(Math.sqrt(1 - side * side)).addScaledVector(lateral, side);
  const desired = hip.clone().addScaledVector(direction, along).addScaledVector(plane, height);
  const original = bones.map(b => b.quaternion.clone());
  let turn = new Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(), desired.clone().sub(hip).normalize());
  let world = turn.multiply(rotation(thigh)); thigh.quaternion.copy(rotation(thigh.parent).invert().multiply(world)).normalize();
  model.updateWorldMatrix(true, true); knee = position(shin); ankle = position(foot);
  turn = new Quaternion().setFromUnitVectors(ankle.clone().sub(knee).normalize(), target.clone().sub(knee).normalize());
  world = turn.multiply(rotation(shin)); shin.quaternion.copy(rotation(shin.parent).invert().multiply(world)).normalize();
  model.updateWorldMatrix(true, true);
  foot.quaternion.copy(rotation(foot.parent).invert().multiply(footWorld)).normalize();
  const amount = smooth(.0002, .006, displacement);
  if (amount < 1) for (let i = 0; i < bones.length; i++) {
    const solved = bones[i].quaternion.clone(); bones[i].quaternion.copy(original[i]).slerp(solved, amount).normalize();
  }
  model.updateWorldMatrix(true, true);
  return {miss, error: position(foot).distanceTo(goal)};
}

export class UphillController {
  constructor(actor, model, animations, terrain) {
    if (!actor || model.parent !== actor || !terrain?.height || !terrain?.gradient) throw Error('Expected a model in its motion group and a heightfield');
    this.actor = actor; this.model = model; this.terrain = terrain;
    this.root = model.getObjectByName('Rig_Root'); this.spine = model.getObjectByName('Rig_Spine');
    this.mesh = model.getObjectByName('NewBody');
    this.legs = Object.fromEntries(['L', 'R'].map(side => [side, ['Thigh', 'Shin', 'Foot'].map(part => model.getObjectByName(`Rig_${part}_${side}`))]));
    if (!this.root || !this.spine || !this.mesh?.isSkinnedMesh || Object.values(this.legs).flat().some(x => !x)) throw Error('Expected the pinned character rig');
    this.mixed = new LocomotionTransition(model, animations, {guardFloor: false}); this.clock = this.mixed.clock;
    this.bones = [this.spine, ...this.legs.L, ...this.legs.R]; this.rawQuaternions = null;
    this.measure = makeSoleSampler(model, this.mesh, terrain); this.stats = {};
    this.captureRaw(); this.adapt();
  }
  captureRaw() { this.rawQuaternions = this.bones.map(b => b.quaternion.clone()); }
  restoreRaw() { if (this.rawQuaternions) this.bones.forEach((b, i) => b.quaternion.copy(this.rawQuaternions[i])); }
  setTarget(mode) { this.mixed.setTarget(mode); }
  reset(mode = 'walk', phase = 0, z = -2.7) {
    if (!Number.isFinite(z)) throw Error('Position must be finite');
    this.restoreRaw(); this.actor.position.set(0, this.terrain.height(0, z), z);
    this.mixed.reset(mode, phase); this.captureRaw(); this.adapt();
  }
  setPhase(phase) { this.restoreRaw(); this.mixed.setPhase(phase); this.captureRaw(); this.adapt(); }
  step(dt) {
    this.restoreRaw(); const before = this.clock.distance; this.mixed.step(dt);
    this.actor.position.z += this.clock.distance - before;
    this.actor.position.y = this.terrain.height(this.actor.position.x, this.actor.position.z);
    this.captureRaw(); this.adapt();
  }
  adapt() {
    const baseY = this.terrain.height(this.actor.position.x, this.actor.position.z);
    const raw = this.measure(baseY), gradient = this.terrain.gradient(this.actor.position.x, this.actor.position.z);
    const inclination = Math.atan(gradient.z);
    let pelvisDrop = 0, maxMiss = 0, maxError = 0, maxReachShift = 0;
    const active = raw.terrainVariation > 1e-8;
    if (active) {
      // A restrained forward lean of the torso only; leg/foot adaptation is
      // handled separately. It fades as the terrain levels out.
      const lean = clamp(inclination * .18, -.08, .08);
      if (Math.abs(lean) > 1e-8) {
        const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), lean).multiply(rotation(this.spine));
        this.spine.quaternion.copy(rotation(this.spine.parent).invert().multiply(q)).normalize();
        this.model.updateWorldMatrix(true, true);
      }
      const worldRotations = {};
      for (const side of ['L', 'R']) {
        const foot = this.legs[side][2], ankle = position(foot), g = this.terrain.gradient(ankle.x, ankle.z);
        const near = 1 - smooth(.015, .20, raw[side].flat);
        const normal = new Vector3(-g.x, 1, -g.z).normalize();
        const turn = new Quaternion().setFromUnitVectors(UP, normal);
        const tilted = new Quaternion().identity().slerp(turn, near).multiply(rotation(foot));
        foot.quaternion.copy(rotation(foot.parent).invert().multiply(tilted)).normalize();
        this.model.updateWorldMatrix(true, true);
        worldRotations[side] = rotation(foot);
      }
      const tilted = this.measure(baseY), goals = {};
      for (const side of ['L', 'R']) {
        const foot = this.legs[side][2], ankle = position(foot);
        // Follow the local surface throughout the stride, retaining the
        // original vertical clearance, including airborne phases. Fading this
        // height correction sharply at toe-off can snap an almost-straight knee.
        const desiredGap = Math.max(.001, raw[side].flat), gap = tilted[side].gap;
        const dy = clamp(desiredGap - gap, -.18, .25);
        goals[side] = ankle.clone().add(new Vector3(0, dy, 0));
      }
      // A small grade-dependent crouch supplies extra reach for the downhill
      // support leg without jumping the pelvis as individual feet plant/lift.
      pelvisDrop = Math.min(.08, Math.max(0, gradient.z) * .19);
      if (pelvisDrop > 0) { this.root.position.y -= pelvisDrop; this.model.updateWorldMatrix(true, true); }
      for (const side of ['L', 'R']) {
        const [thigh, shin, foot] = this.legs[side], hip = position(thigh), knee = position(shin), ankle = position(foot);
        // Keep a little bend on the slope; taper the margin to zero as the
        // foot leaves the ramp so the flat source animation is not popped.
        const maxLength = hip.distanceTo(knee) + knee.distanceTo(ankle) - .012 * smooth(0, .04, raw.terrainVariation);
        const original = goals[side], ground = this.terrain.height(original.x, original.z);
        const candidate = t => {
          const z = original.z + (hip.z - original.z) * t;
          return new Vector3(original.x, original.y + this.terrain.height(original.x, z) - ground, z);
        };
        // On a steep rise the old flat stride can extend beyond leg reach.
        // Shorten its horizontal target only as much as needed, following the
        // terrain height as it moves. This is not a planted-foot lock.
        if (hip.distanceTo(original) > maxLength && hip.distanceTo(candidate(1)) < maxLength) {
          let lo = 0, hi = 1;
          for (let i = 0; i < 24; i++) {
            const middle = (lo + hi) / 2;
            if (hip.distanceTo(candidate(middle)) > maxLength) lo = middle; else hi = middle;
          }
          goals[side] = candidate(hi); maxReachShift = Math.max(maxReachShift, Math.abs(goals[side].z - original.z));
        }
        const result = fitLeg(this.model, this.legs[side], goals[side], worldRotations[side]);
        maxMiss = Math.max(maxMiss, result.miss); maxError = Math.max(maxError, result.error);
      }
    }
    const fitted = this.measure(baseY), minimum = Math.min(fitted.L.gap, fitted.R.gap), x = .002 - minimum;
    const required = x <= 0 ? 0 : x < .002 ? x * x / .004 : x - .001;
    const lift = Math.max(required, floorEnvelope(this.clock.phase, this.clock.weight));
    if (lift > 0) { this.root.position.y += lift; this.model.updateWorldMatrix(true, true); }
    this.stats = {active, slopeDegrees: inclination * 180 / Math.PI, rawGap: Math.min(raw.L.gap, raw.R.gap),
      fittedGap: minimum, correctedGap: minimum + lift, pelvisDrop, lift, maxMiss, maxError, maxReachShift, raw, fitted};
  }
  dispose() { this.restoreRaw(); this.mixed.dispose(); }
}
