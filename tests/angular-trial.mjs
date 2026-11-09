import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeGarment} from '../src/angular-trial/garment.js';
const g=new THREE.BoxGeometry(2,2,1,3,3,3);g.translate(0,8.75,0);g.computeVertexNormals();
const body=new THREE.Mesh(g,new THREE.MeshBasicMaterial());
const garment=makeGarment(body,false,'briefs');
assert.notEqual(garment.geometry,body.geometry,'garment is a separate mesh');
const p=garment.geometry.attributes.position;
assert.ok(p.count>0 && garment.geometry.index.count>0,'shell has visible geometry');
for(let i=0;i<p.count;i++) {
 assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));
 assert.ok(p.getY(i)>7.6 && p.getY(i)<9.95,'shell stays near the pelvis');
}
console.log('Angular trial: separate finite clipped garment shell');
