import assert from 'node:assert/strict';
import {createHumanoidSkeleton as oldSkeleton,buildBaseBodyGeometry as oldBody} from '../src/male-body-proportions-trial/body-character.js';
import {createHumanoidSkeleton as newSkeleton,buildBaseBodyGeometry as newBody} from '../src/male-torso-relief-trial/body-character.js';
for(const kingdom of ['north','eden'])for(const female of [false,true]){
 const a=oldSkeleton(female,kingdom),b=newSkeleton(female,kingdom),g=oldBody(female,a.metrics),h=newBody(female,b.metrics);assert.deepEqual(a.metrics,b.metrics);
 for(const name of ['position','normal','uv','skinWeight'])for(const x of h.attributes[name].array)assert(Number.isFinite(x));
 const w=h.attributes.skinWeight;for(let i=0;i<w.count;i++)assert(Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1)<1e-5);
 if(female){for(const name of ['position','normal','uv','skinWeight','skinIndex'])assert.deepEqual(Array.from(g.attributes[name].array),Array.from(h.attributes[name].array));assert.deepEqual(Array.from(g.index.array),Array.from(h.index.array));}
 else {
  assert.equal(h.userData.limbRanges.torso[1]-g.userData.limbRanges.torso[1],6*21);
  for(const limb of ['armL','armR','legL','legR']){const [a0,a1]=g.userData.limbRanges[limb],[b0,b1]=h.userData.limbRanges[limb];assert.equal(a1-a0,b1-b0);for(const n of ['position','uv','skinWeight','skinIndex']){const d=g.attributes[n].itemSize;assert.deepEqual(Array.from(g.attributes[n].array.slice(a0*d,a1*d)),Array.from(h.attributes[n].array.slice(b0*d,b1*d)),limb+' '+n)}}
 }
 for(const i of h.index.array)assert(i<h.attributes.position.count);
}
console.log('Six male torso rings added; female, skeleton and limb attributes preserved; finite normalized weights.');
