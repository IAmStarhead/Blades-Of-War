import assert from 'node:assert/strict';
import { createBowCharacter3D, disposeBowCharacter, poseBowCharacter } from '../src/engine3d/bow3d/bowCharacter.js';
import * as THREE from 'three';
import { createBowPrototype3D } from '../src/engine3d/bow3d/bowPrototype.js';
const gradient = { addColorStop() {} };
const ctx = new Proxy({}, { get: (o, k) => o[k] || (k.startsWith('create') ? () => gradient : () => {}), set: (o, k, v) => (o[k] = v, true) });
const canvasFactory = (width, height) => ({ width, height, getContext: () => ctx });
for (const female of [false, true]) {
  const old = createBowCharacter3D({ female, kingdom: 'north', outfit: 'underwear', canvasFactory });
  const before = old.bodyMesh.geometry.attributes.position.array.slice();
  const oldHead = old.headMesh.geometry.attributes.position.array.slice();
  const prototype = createBowPrototype3D({ female, kingdom: 'north', canvasFactory });
  assert.deepEqual(old.bodyMesh.geometry.attributes.position.array, before, 'prototype must not mutate old model');
  assert.deepEqual(old.headMesh.geometry.attributes.position.array, oldHead, 'prototype must not mutate old head');
  assert.notDeepEqual(prototype.headMesh.geometry.attributes.position.array, oldHead, 'prototype face must differ');
  assert.notDeepEqual(prototype.bodyMesh.geometry.attributes.position.array, before, 'prototype must differ from old model');
  assert.ok(prototype.prototypeBeard ? !female : female, 'only male prototype has separate beard');
  if (prototype.prototypeBeard) assert.ok(prototype.prototypeBeard.geometry.attributes.position.count > 0);
  for (const mode of ['idle', 'walk', 'combat']) {
    poseBowCharacter(prototype, mode, 1);
    prototype.group.updateWorldMatrix(true, true);
    prototype.skeleton.update();
    const positions = prototype.bodyMesh.geometry.attributes.position;
    for (const v of positions.array) assert.ok(Number.isFinite(v));
    const normals = prototype.bodyMesh.geometry.attributes.normal;
    for (const v of normals.array) assert.ok(Number.isFinite(v));
    const weights = prototype.bodyMesh.geometry.attributes.skinWeight;
    const indices = prototype.bodyMesh.geometry.attributes.skinIndex;
    for (let i = 0; i < positions.count; i++) {
      let weight = 0;
      for (let j = 0; j < 4; j++) {
        weight += weights.getComponent(i, j);
        assert.ok(indices.getComponent(i, j) < prototype.bones.length);
      }
      assert.ok(Math.abs(weight - 1) < 1e-5);
      const v = prototype.bodyMesh.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(positions, i));
      assert.ok([v.x, v.y, v.z].every(Number.isFinite));
    }
  }
  for (const style of ['short', 'long', 'classic', 'headwear']) prototype.setHairStyle(style, canvasFactory);
  disposeBowCharacter(prototype);
  disposeBowCharacter(old);
}
console.log('Prototype: independent old/new geometry, beard, poses and hair changes OK');
