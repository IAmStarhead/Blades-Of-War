import assert from 'node:assert/strict';
import {createHumanoidSkeleton as makeA,buildBaseBodyGeometry as makeOld} from '../src/male-torso-relief-trial/body-character.js';
import {createHumanoidSkeleton as makeB,buildBaseBodyGeometry as makeNew} from '../src/male-shoulder-chest-form-trial/body-character.js';
for(const female of [false,true])for(const kingdom of ['north','eden']){
 let a=makeA(female,kingdom),b=makeB(female,kingdom),g=makeOld(female,a.metrics),h=makeNew(female,b.metrics);assert.deepEqual(a.metrics,b.metrics);assert.deepEqual(Array.from(g.index.array),Array.from(h.index.array));
 for(const name of ['uv','skinIndex','skinWeight'])assert.deepEqual(Array.from(g.attributes[name].array),Array.from(h.attributes[name].array));
 let p=g.attributes.position.array,q=h.attributes.position.array;
 if(female)assert.deepEqual(Array.from(p),Array.from(q));else{
  for(const name of ['legL','legR']){let [start,end]=g.userData.limbRanges[name];assert.deepEqual(Array.from(p.slice(start*3,end*3)),Array.from(q.slice(start*3,end*3)));}
  for(const name of ['torso','armL','armR']){let [start,end]=g.userData.limbRanges[name],changes=0;for(let i=start*3;i<end*3;i++)if(p[i]!==q[i])changes++;assert(changes>5,name)}
 }
 for(let v of q)assert(Number.isFinite(v));
}
console.log('Male torso and shoulder surfaces changed; legs, female geometry, topology, UV and weights preserved.');
