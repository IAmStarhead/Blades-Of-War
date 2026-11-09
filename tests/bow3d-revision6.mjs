import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBowHorse3D, animateHorse3D, disposeBowHorse } from '../src/engine3d/bow3d/bowHorse.js';
import { createBowCharacter3D, poseBowCharacter, disposeBowCharacter, BONE_IDX } from '../src/engine3d/bow3d/bowCharacter.js';

const gradient = { addColorStop() {} };
const ctx = new Proxy({}, { get: (obj, key) => obj[key] || (key.startsWith('create') ? () => gradient : () => {}), set: (obj, key, val) => (obj[key] = val, true) });
const canvasFactory = (width, height) => ({ width, height, getContext: () => ctx });
const horse = createBowHorse3D({ canvasFactory });
for (const mode of ['idle', 'walk']) for (let t = 0; t < 6; t += 0.05) {
  animateHorse3D(horse, mode, t);
  horse.group.updateWorldMatrix(true, true);
  const heights = ['legFL', 'legFR', 'legHL', 'legHR'].map(key => {
    const leg = horse.parts[key];
    const positions = leg.hoof.geometry.attributes.position;
    return Math.min(...Array.from({ length: positions.count }, (_, i) => {
      const point = new THREE.Vector3().fromBufferAttribute(positions, i);
      return horse.group.worldToLocal(leg.hoof.localToWorld(point)).y;
    }));
  });
  assert.ok(heights.every(Number.isFinite));
  assert.ok(Math.abs(Math.min(...heights)) < 1e-6, `${mode} at ${t}: ${heights}`);
}
for (const female of [false, true]) for (const kingdom of ['north', 'eden']) for (const outfit of ['underwear', 'villager', 'warrior']) {
  const rig = createBowCharacter3D({ female, kingdom, outfit, canvasFactory });
  for (const mode of ['idle', 'walk', 'combat', 'ride']) {
    poseBowCharacter(rig, mode, 1, { swordArm: true });
    for (const bone of rig.bones) assert.ok(Number.isFinite(bone.rotation.x));
    rig.group.updateWorldMatrix(true, true);
    rig.skeleton.update();
    for (const mesh of [rig.bodyMesh, rig.garmentMesh].filter(Boolean)) {
      const geometry = mesh.geometry;
      const positions = geometry.attributes.position;
      const indices = geometry.attributes.skinIndex;
      const weights = geometry.attributes.skinWeight;
      for (let i = 0; i < positions.count; i++) {
        let total = 0;
        for (let j = 0; j < 4; j++) {
          const weight = weights.getComponent(i, j);
          assert.ok(Number.isFinite(weight) && weight >= 0);
          assert.ok(indices.getComponent(i, j) < rig.bones.length);
          total += weight;
        }
        assert.ok(Math.abs(total - 1) < 1e-5, `weights ${outfit} vertex ${i}: ${total}`);
        const point = mesh.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(positions, i));
        assert.ok([point.x, point.y, point.z].every(Number.isFinite));
      }
    }
  }
  assert.ok(Math.abs(rig.bones[BONE_IDX.UPPER_ARM_R].rotation.x) < 1, 'rider must not raise an unarmed arm');
  disposeBowCharacter(rig);
}
disposeBowHorse(horse);
// Diagnostic, not a claim of perfect ground contact: sample bare-sole vertices
// and bound the known penetration until a foot IK solution is implemented.
let worstSole = 0;
for (const female of [false, true]) {
  const rig = createBowCharacter3D({ female, outfit: 'underwear', canvasFactory });
  for (const mode of ['idle', 'walk', 'combat']) for (let t = 0; t < 3; t += 0.05) {
    poseBowCharacter(rig, mode, t);
    rig.group.updateWorldMatrix(true, true);
    rig.skeleton.update();
    const positions = rig.bodyMesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) >= 0.007 || Math.abs(positions.getX(i)) <= 0.025) continue;
      const v = rig.bodyMesh.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(positions, i));
      worstSole = Math.min(worstSole, v.y);
    }
  }
  disposeBowCharacter(rig);
}
assert.ok(worstSole > -0.03, `sole penetration regressed: ${worstSole}`);
console.log(`3D smoke: hoof vertices, skin weights, character poses OK; worst sampled sole y=${worstSole.toFixed(4)}m (known limitation)`);
