import assert from 'node:assert/strict';
import {buildMaleBlockout as oldBody,buildBlockoutShorts as oldShorts} from '../src/male-body-rebuild-blockout/blockout.js';
import {buildMaleBlockout as newBody,buildBlockoutShorts as newShorts} from '../src/male-body-connected-blockout/blockout.js';
import {createHumanoidSkeleton} from '../src/male-shoulder-sculpt-trial/body-character.js';
for(const kingdom of ['north','eden']){
 const {metrics}=createHumanoidSkeleton(false,kingdom),a=oldBody(metrics),b=newBody(metrics),p=b.attributes.position;
 for(const attr of ['position','normal','uv'])for(const v of b.attributes[attr].array)assert(Number.isFinite(v));
 for(const i of b.index.array)assert(i<p.count);
 assert.equal(b.attributes.skinWeight,undefined);
 for(const side of ['L','R']){
  const name='leg'+side, old=a.userData.parts[name],next=b.userData.parts[name];
  assert.equal(old.vertexCount,next.vertexCount);
  assert.deepEqual(Array.from(a.attributes.position.array.slice(old.vertexStart*3,(old.vertexStart+old.vertexCount)*3)),Array.from(b.attributes.position.array.slice(next.vertexStart*3,(next.vertexStart+next.vertexCount)*3)));
 }
 assert.deepEqual(Array.from(oldShorts(metrics).attributes.position.array),Array.from(newShorts(metrics).attributes.position.array));
 const edgeCount=new Map();for(let i=0;i<b.index.count;i+=3)for(let j=0;j<3;j++){const a=b.index.getX(i+j),c=b.index.getX(i+(j+1)%3),key=a<c?`${a}:${c}`:`${c}:${a}`;edgeCount.set(key,(edgeCount.get(key)||0)+1)}
 for(const side of ['L','R']){const boundary=b.userData.shoulderBoundaries[side];assert.equal(boundary.length,16);for(let i=0;i<boundary.length;i++){let a=boundary[i],c=boundary[(i+1)%boundary.length],key=a<c?`${a}:${c}`:`${c}:${a}`;assert.equal(edgeCount.get(key),2,`shoulder edge ${key}`)}}
 for(const name of Object.keys(a.userData.cuts)){const cut=b.userData.cuts[name];assert(cut,name);assert.equal(cut.ring.length,32);for(const i of cut.ring)assert(i<p.count)}
}
console.log('Both shoulder opening boundaries connected, legs and shorts positions unchanged, cutting landmarks retained. Visual quality and complete manifold not tested.');
