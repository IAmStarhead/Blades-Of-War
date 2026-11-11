import assert from 'node:assert/strict';
import {createHumanoidSkeleton as oldSkel,buildBaseBodyGeometry as oldBody} from '../src/male-shoulder-chest-form-trial/body-character.js';
import {createHumanoidSkeleton as newSkel,buildBaseBodyGeometry as newBody} from '../src/male-shoulder-topology-trial/body-character.js';
for(const female of [false,true])for(const kingdom of ['north','eden']){
 const a=oldSkel(female,kingdom),b=newSkel(female,kingdom),g=oldBody(female,a.metrics),h=newBody(female,b.metrics);assert.deepEqual(a.metrics,b.metrics);
 for(const n of ['position','uv','skinIndex','skinWeight'])assert.deepEqual(Array.from(g.attributes[n].array),Array.from(h.attributes[n].array));
 if(female)assert.deepEqual(Array.from(g.index.array),Array.from(h.index.array));
 else {
  assert.notDeepEqual(Array.from(g.index.array),Array.from(h.index.array));
  const counts=new Map();for(let i=0;i<h.index.count;i+=3)for(let j=0;j<3;j++){let x=h.index.getX(i+j),y=h.index.getX(i+(j+1)%3),k=x<y?`${x}:${y}`:`${y}:${x}`;counts.set(k,(counts.get(k)||0)+1)}
  for(const c of [2,12]){let loop=[];for(let x=c+6;x>=c;x--)loop.push(12*21+x);for(let y=13;y<=16;y++)loop.push(y*21+c);for(let x=c+1;x<=c+6;x++)loop.push(16*21+x);for(let y=15;y>12;y--)loop.push(y*21+c+6);assert.equal(loop.length,20);for(let j=0;j<20;j++){let x=loop[j],y=loop[(j+1)%20],k=x<y?`${x}:${y}`:`${y}:${x}`;assert.equal(counts.get(k),2,`boundary ${k}`)}}
 }
 for(const i of h.index.array)assert(i<h.attributes.position.count);
}
console.log('Male torso hole boundaries have two incident faces; female geometry unchanged; no claim of manifold UV seams or visual quality.');
