// Pose-space volume correction for this specific glTF rig. The two corrective
// POSITION/NORMAL morphs and their names are authored by author.mjs. Apply
// after animation mixing AND after any leg IK; otherwise baked clip weights do
// not reflect the actual mixed/IK knee pose. No bone or foot position is set.
export const KNEE_VOLUME_GAIN = 0.85;
const LOW = 110 * Math.PI / 180, HIGH = 130 * Math.PI / 180;

// Identity below 110°, smoothly approaches a 120° effective cap above 130°.
// This prevents unbounded secant growth for untested extreme joint bends.
function softCappedAngle(angle) {
  if (angle <= LOW) return angle;
  if (angle >= HIGH) return (LOW + HIGH) / 2;
  const u = (angle - LOW) / (HIGH - LOW);
  return LOW + (HIGH - LOW) * (u - u * u * u + .5 * u * u * u * u);
}

export function kneeVolumeWeight(quaternion) {
  const norm = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  if (!Number.isFinite(norm) || norm < 1e-10) throw Error('Invalid knee rotation');
  // Both knees have identity bind rotations and flex about local +X in this
  // rig. Use the signed X twist, not total rotation: pure sideways twisting
  // and reverse bending must not trigger an anterior knee bulge. q and -q
  // represent the same rotation, including at the 180° tie.
  const sign = quaternion.w < 0 || (quaternion.w === 0 && quaternion.x < 0) ? -1 : 1;
  const flex = Math.max(0, quaternion.x * sign);
  const angle = 2 * Math.atan2(flex, Math.abs(quaternion.w));
  return KNEE_VOLUME_GAIN * (1 / Math.cos(softCappedAngle(angle) / 2) - 1);
}

export class KneeVolumeCorrector {
  constructor(model) {
    this.mesh = model.getObjectByName('NewBody');
    this.bones = ['L', 'R'].map(side => model.getObjectByName(`Rig_Shin_${side}`));
    this.indices = ['L', 'R'].map(side => this.mesh?.morphTargetDictionary?.[`KneeVolume_${side}`]);
    if (!this.mesh?.isSkinnedMesh || !this.mesh.morphTargetInfluences || this.bones.some(b => !b) ||
        this.indices.some(i => !Number.isInteger(i)) || this.indices[0] === this.indices[1])
      throw Error('Expected the pinned leg-volume mesh, morphs and knee bones');
    this.enabled = true;
  }
  apply() {
    for (let i = 0; i < 2; i++)
      this.mesh.morphTargetInfluences[this.indices[i]] = this.enabled ? kneeVolumeWeight(this.bones[i].quaternion) : 0;
  }
  setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw Error('Expected a boolean');
    this.enabled = enabled; this.apply();
  }
}

// Wrap rather than modify the previous uphill controller. super() invokes
// adapt once before this.volume exists, hence the optional check there.
export function withKneeVolume(UphillController) {
  return class VolumeUphillController extends UphillController {
    constructor(...args) {
      super(...args);
      this.volume = new KneeVolumeCorrector(this.model);
      this.volume.apply();
    }
    adapt() { super.adapt(); this.volume?.apply(); }
    setVolumeEnabled(enabled) { this.volume.setEnabled(enabled); }
  };
}
