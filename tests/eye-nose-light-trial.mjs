import assert from 'node:assert/strict';
import * as THREE from 'three';
import {softenUnderNoseNormals} from '../src/eye-nose-light-trial/nose-light.js';
import {eyePatch} from '../src/eye-nose-light-trial/iris-adjusted.js';
const g=new THREE.SphereGeometry(.1,64,40),p=g.attributes.position,uv=g.attributes.uv,n=g.attributes.normal,before=n.array.slice(),positions=p.array.slice();
softenUnderNoseNormals(g);assert.deepEqual(p.array,positions);let changed=0;for(let i=0;i<n.count;i++){for(let k=0;k<3;k++)assert(Number.isFinite(n.getComponent(i,k)));if(n.getX(i)!==before[3*i]||n.getY(i)!==before[3*i+1]||n.getZ(i)!==before[3*i+2]){changed++;const x=uv.getX(i)*512,y=(1-uv.getY(i))*512;assert(Math.abs(x-256)<23&&y>307&&y<341)}}assert(changed>0);
for(const [w,h] of [[.0055,.0026],[.0028,.0023],[.00065,.00065]]){const e=eyePatch(w,h,.0065,.0001,0x33444e),v=e.geometry.attributes.position;for(let i=0;i<v.count;i++)for(let j=0;j<3;j++)assert(Number.isFinite(v.getComponent(i,j)))}
console.log('Nose normal change is bounded; iris and glint geometry finite.');
