import assert from 'node:assert/strict';
import * as THREE from 'three';
import {addTrialEars} from '../src/ear-anatomy-trial/ears.js';
for(const female of [false,true]){
 const head=new THREE.Group(),headMesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());head.add(headMesh);
 const ears=addTrialEars({headMesh},female);assert.equal(ears.length,2);
 for(const ear of ears){assert.equal(ear.parent,head);assert([...ear.geometry.attributes.position.array,...ear.geometry.attributes.normal.array].every(Number.isFinite));assert([...ear.geometry.index.array].every(i=>i<ear.geometry.attributes.position.count))}
 let a=ears[0].geometry.attributes.position,b=ears[1].geometry.attributes.position;assert.equal(a.count,b.count);
 for(let i=0;i<a.count;i++){assert(Math.abs(a.getX(i)+b.getX(i))<1e-7);assert.equal(a.getY(i),b.getY(i));assert.equal(a.getZ(i),b.getZ(i))}
 head.updateMatrixWorld(true);let start=new THREE.Vector3();ears[1].getWorldPosition(start);head.position.set(.1,.2,.3);head.rotation.y=.3;head.updateMatrixWorld(true);let end=new THREE.Vector3();ears[1].getWorldPosition(end);assert(start.distanceTo(end)>.1);
 for(const e of ears)e.geometry.dispose();ears[0].material.dispose();headMesh.geometry.dispose();headMesh.material.dispose();
}
console.log('Ears are mirrored, finite, attached to head parent, and follow its transform');
