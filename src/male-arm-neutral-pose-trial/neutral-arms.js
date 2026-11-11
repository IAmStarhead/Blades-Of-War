// Pose-only study: symmetrical shoulder angles and elbow flexion.
// Angles are not intended to measure the anatomical carrying angle.
export function setNeutralMaleArms(bones, ids){
 for(const [upper,fore,sign] of [[ids.UPPER_ARM_L,ids.FOREARM_L,1],[ids.UPPER_ARM_R,ids.FOREARM_R,-1]]){
  bones[upper].rotation.set(.01,0,sign*.07);
  bones[fore].rotation.set(-.10,0,0);
 }
}
