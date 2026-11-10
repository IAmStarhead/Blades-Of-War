import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeSkinnedBridge} from '../src/face-alignment-neck-trial/skin-bridge.js';
for(const female of [false,true]){
 const group=new THREE.Group(),bones=Array.from({length:6},()=>new THREE.Bone());
 for(let i=0;i<5;i++)bones[i].add(bones[i+1]);group.add(bones[0]);group.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);
 const body=new THREE.BufferGeometry(),p=new Float32Array(421*3),indices=new Uint16Array(421*4),weights=new Float32Array(421*4);
 for(let i=0;i<421;i++){p[3*i]=Math.cos(i)*.05;p[3*i+1]=1.5;p[3*i+2]=Math.sin(i)*.05;indices[4*i]=5;weights[4*i]=.85;indices[4*i+1]=4;weights[4*i+1]=.15}
 body.setAttribute('position',new THREE.BufferAttribute(p,3));body.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));body.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));body.setIndex([273,274,294,378,379,399]);body.computeVertexNormals();
 const head=new THREE.SphereGeometry(.1,64,40),headMesh=new THREE.Mesh(head,new THREE.MeshBasicMaterial());bones[5].add(headMesh);
 const rig={group,skeleton,bones,metrics:{headY:1.5},headMesh,bodyMesh:{geometry:body}};makeSkinnedBridge(rig,female);
 assert.equal(rig.bodyMesh.geometry,body);assert.equal(headMesh.geometry,head);const mesh=rig.bridgeTrial.mesh,g=mesh.geometry,w=g.attributes.skinWeight;assert.equal(w.count,head.attributes.position.count+65);
 for(let i=0;i<w.count;i++){let sum=0;for(let k=0;k<4;k++)sum+=w.getComponent(i,k);assert(Math.abs(sum-1)<1e-6)}
 group.updateMatrixWorld(true);skeleton.update();let before=mesh.getVertexPosition(1000,new THREE.Vector3());bones[5].rotation.y=.45;group.updateMatrixWorld(true);skeleton.update();let after=mesh.getVertexPosition(1000,new THREE.Vector3());assert(before.distanceTo(after)>.001);
}
console.log('Both bridge copies have normalized weights and respond to head rotation.');
const {nasalWings}=await import('../src/face-alignment-neck-trial/align-details.js');
const g=new THREE.SphereGeometry(.1,64,40),pos=g.attributes.position,before=pos.array.slice();nasalWings(g);let max=0;for(let i=0;i<pos.count;i++){const dx=pos.getX(i)-before[i*3],dy=pos.getY(i)-before[i*3+1],dz=pos.getZ(i)-before[i*3+2];assert.equal(dx,0);assert.equal(dy,0);assert(Number.isFinite(dz));max=Math.max(max,dz)}assert(max>0&&max<=.00121);console.log('Nasal adjustment is finite, localized, and limited in amplitude.');
