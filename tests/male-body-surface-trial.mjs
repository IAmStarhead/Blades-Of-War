import assert from 'node:assert/strict';
import {createHumanoidSkeleton as oldSkeleton,buildBaseBodyGeometry as oldBody} from '../src/body-anatomy-first-trial/body-character.js';
import {createHumanoidSkeleton as newSkeleton,buildBaseBodyGeometry as newBody} from '../src/male-body-surface-trial/body-character.js';
for(const kingdom of ['north','eden'])for(const female of [false,true]){
 const a=oldSkeleton(female,kingdom),b=newSkeleton(female,kingdom),x=oldBody(female,a.metrics),y=newBody(female,b.metrics);
 assert.deepEqual(a.metrics,b.metrics);assert.deepEqual(Array.from(x.index.array),Array.from(y.index.array));
 for(const name of ['skinIndex','skinWeight','uv'])assert.deepEqual(Array.from(x.attributes[name].array),Array.from(y.attributes[name].array));
 const p=x.attributes.position.array,q=y.attributes.position.array;
 if(female)assert.deepEqual(Array.from(p),Array.from(q));else{
  const r=x.userData.limbRanges;for(let i=0;i<p.length;i++)if(p[i]!==q[i]){const v=Math.floor(i/3);assert(v>=r.legR[0]&&v<r.armR[1]);}
  for(const name of ['armL','armR','legL','legR']){const [start,end]=r[name];let changed=0;for(let i=start*3;i<end*3;i++)if(p[i]!==q[i])changed++;assert(changed>10,name)}
 }
 for(const v of q)assert(Number.isFinite(v));
}
console.log('Female positions unchanged; male changes confined to limbs; skeleton, topology, UV and weights retained for both kingdoms.');
