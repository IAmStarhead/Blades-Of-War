import assert from 'node:assert/strict';
import * as THREE from 'three';
import {enlargeEars,softenFaceNormals} from '../src/feature-retouch-trial/retouch.js';
const g=new THREE.SphereGeometry(1,64,40);const before=g.attributes.position.array.slice();softenFaceNormals(g);assert.deepEqual(g.attributes.position.array,before);for(const n of g.attributes.normal.array)assert(Number.isFinite(n));
const e=new THREE.SphereGeometry(1,12,8);const ears=[{geometry:e}];e.computeBoundingBox();const h=e.boundingBox.max.y-e.boundingBox.min.y;enlargeEars(ears);assert(Math.abs((e.boundingBox.max.y-e.boundingBox.min.y)/h-1.14)<1e-5);for(const n of e.attributes.normal.array)assert(Number.isFinite(n));
console.log('Face normal-only retouch preserves positions; ear height increases 14%.');
