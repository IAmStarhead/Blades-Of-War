import assert from 'node:assert/strict';
import * as THREE from 'three';
import {addEyePatches} from '../src/eye-anatomy-patch-trial/eye-patch.js';
const headMesh=new THREE.Mesh();addEyePatches({headMesh});
assert.equal(headMesh.children.length,2);
const [a,b]=headMesh.children;assert.equal(a.position.x,-b.position.x);assert.equal(a.position.y,b.position.y);assert.equal(a.position.z,b.position.z);
for(const eye of [a,b]){assert.equal(eye.children.length,4);for(const mesh of eye.children){assert.equal(mesh.parent,eye);for(const n of mesh.geometry.attributes.position.array)assert(Number.isFinite(n));}}
console.log('Two fixed symmetric eye patches with finite geometry.');
