import assert from 'node:assert/strict';
import {createHumanoidSkeleton as oldSkel,buildBaseBodyGeometry as oldBody} from '../src/male-deltoid-anatomy-trial/body-character.js';
import {createHumanoidSkeleton as newSkel,buildBaseBodyGeometry as newBody} from '../src/male-shoulder-rebuild-trial/body-character.js';
for(const female of [false,true])for(const kingdom of ['north','eden']){
 const a=oldSkel(female,kingdom),b=newSkel(female,kingdom),x=oldBody(female,a.metrics),y=newBody(female,b.metrics);assert.deepEqual(a.metrics,b.metrics);
 for(const n of ['position','normal','uv','skinWeight','skinIndex'])for(const v of y.attributes[n].array)assert(Number.isFinite(v));
 for(let i=0;i<y.attributes.skinWeight.count;i++){let w=y.attributes.skinWeight;assert(Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1)<1e-5)}
 for(const i of y.index.array)assert(i<y.attributes.position.count);
 if(female){for(const n of ['position','normal','uv','skinWeight','skinIndex'])assert.deepEqual(Array.from(x.attributes[n].array),Array.from(y.attributes[n].array));assert.deepEqual(Array.from(x.index.array),Array.from(y.index.array))}
 else {assert.equal(y.attributes.position.count,x.attributes.position.count+40);for(const name of ['torso','legL','legR']){const [start,end]=x.userData.limbRanges[name];assert.deepEqual(Array.from(x.attributes.position.array.slice(start*3,end*3)),Array.from(y.attributes.position.array.slice(start*3,end*3)))}
 const counts=new Map();for(let i=0;i<y.index.count;i+=3)for(let j=0;j<3;j++){let a=y.index.getX(i+j),b=y.index.getX(i+(j+1)%3),k=a<b?`${a}:${b}`:`${b}:${a}`;counts.set(k,(counts.get(k)||0)+1)}
 for(const c of [3,13]){let loop=[];for(let s=c+4;s>=c;s--)loop.push(13*21+s);for(let r=14;r<=16;r++)loop.push(r*21+c);for(let s=c+1;s<=c+4;s++)loop.push(16*21+s);for(let r=15;r>13;r--)loop.push(r*21+c+4);assert.equal(loop.length,14);for(let i=0;i<14;i++){let a=loop[i],b=loop[(i+1)%14],k=a<b?`${a}:${b}`:`${b}:${a}`;assert.equal(counts.get(k),2,`boundary ${k}`)}}}
}
console.log('Both 14-edge torso openings connected; female and male torso/leg positions unchanged; weights normalized. No full manifold claim.');
