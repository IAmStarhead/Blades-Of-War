import assert from 'node:assert/strict';
import {eyePatch} from '../src/iris-depth-trial/iris-depth.js';
for(const [w,h] of [[.0055,.0026],[.0028,.0023]]){const mesh=eyePatch(w,h,.0108,.0001,0x33444e),p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;for(let i=0;i<p.count;i++)for(let k=0;k<3;k++){assert(Number.isFinite(p.getComponent(i,k)));assert(Number.isFinite(n.getComponent(i,k)))}assert(mesh.geometry.index.count>0)}
console.log('Iris and pupil geometry have finite coordinates and normals.');
