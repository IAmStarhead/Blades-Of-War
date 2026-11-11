import assert from 'node:assert/strict';
import * as THREE from 'three';
import {addFacialPlanes} from '../src/facial-planes-neck-trial/planes.js';
for(const female of [true,false]){
 const g=new THREE.SphereGeometry(.1,128,64),p=g.attributes.position,uv=g.attributes.uv,before=p.array.slice();addFacialPlanes(g,female);let changed=0,max=0;
 for(let i=0;i<p.count;i++){
  let dx=p.getX(i)-before[3*i],dy=p.getY(i)-before[3*i+1],dz=p.getZ(i)-before[3*i+2],a=Math.abs((uv.getX(i)-.5)*Math.PI*2),v=uv.getY(i);max=Math.max(max,Math.hypot(dx,dz));assert.equal(dy,0);if(dx||dz)changed++;
  if(a<.16 || v<.30 || v>.78){assert.equal(dx,0);assert.equal(dz,0)}
  for(let k=0;k<3;k++)assert(Number.isFinite(g.attributes.normal.getComponent(i,k)));
 }assert(changed);assert(max<.006);console.log(female?'female':'male',changed,max);
}
