import assert from 'node:assert/strict';
import * as THREE from 'three';
import {centerGaze} from '../src/head-gaze/gaze.js';
const group=new THREE.Group();
// A remote face leaves two small spheres visible to the ray sampler.
const face=new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.MeshBasicMaterial());face.position.z=-1;group.add(face);
for(const x of [-.3,.3]) {
 const sphere=new THREE.Mesh(new THREE.SphereGeometry(.13,24,16),new THREE.MeshBasicMaterial());sphere.position.x=x;group.add(sphere);
 for(let i=0;i<2;i++){const part=new THREE.Mesh(new THREE.SphereGeometry(.02,8,8),new THREE.MeshBasicMaterial());part.position.set(x+.03,.03,.12);group.add(part);}
}
const measurements=centerGaze(group);
for(let i=0;i<2;i++) {
 assert.ok(measurements[i].samples>10);
 const iris=group.children[2+i*3],pupil=group.children[3+i*3];
 assert.ok(Math.abs(iris.position.x-(i? .3:-.3))<.005);
 assert.ok(Math.abs(iris.position.y)<.005);
 assert.equal(iris.position.x,pupil.position.x);assert.equal(iris.position.y,pupil.position.y);
}
console.log('Gaze: iris and pupil centred on visible openings');
