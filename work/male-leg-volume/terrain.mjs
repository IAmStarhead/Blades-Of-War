// A simple, smooth, straight uphill test course, not arbitrary mesh collision.
// It is flat before START, rises to the selected grade, then flattens at END.
export const START = -1.5, END = 5, SHOULDER = .8;
export const SPAWN = -2.7, FINISH = 6.6;
const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = x => { const t = clamp01(x); return t * t * (3 - 2 * t); };
function integratedSmooth(x) {
  if (x <= 0) return 0;
  if (x >= 1) return x - .5;
  return x * x * x - .5 * x * x * x * x;
}
export class RampTerrain {
  constructor(degrees = 15) { this.setAngle(degrees); }
  setAngle(degrees) {
    if (!(Number.isFinite(degrees) && degrees >= 0 && degrees <= 20)) throw Error('Test slope must be 0–20°');
    this.degrees = degrees; this.grade = Math.tan(degrees * Math.PI / 180);
  }
  height(_x, z) {
    return this.grade * SHOULDER * (integratedSmooth((z - START) / SHOULDER) - integratedSmooth((z - END) / SHOULDER));
  }
  gradient(_x, z) {
    return {x: 0, z: this.grade * (smooth((z - START) / SHOULDER) - smooth((z - END) / SHOULDER))};
  }
}
