import assert from 'node:assert/strict';
import {buildSculptedHeadGeometry} from '../src/engine3d/bow3d/bowCharacter.js';
import {kingdomNose} from '../src/nose-kingdom-trial/nose-variants.js';
for(const female of [false,true]){
 const src=buildSculptedHeadGeometry(female,false,'north'),before=Float32Array.from(src.attributes.position.array),a=kingdomNose(src,female,false),b=kingdomNose(src,female,true);
 assert.deepEqual(src.attributes.position.array,before);assert.deepEqual(a.index.array,b.index.array);
 assert([...a.attributes.position.array,...a.attributes.normal.array,...b.attributes.position.array,...b.attributes.normal.array].every(Number.isFinite));
 let changed=0;for(let i=0;i<a.attributes.position.count;i++){
  const dx=a.attributes.position.getX(i)-b.attributes.position.getX(i),dz=a.attributes.position.getZ(i)-b.attributes.position.getZ(i);
  const v=a.attributes.uv.getY(i),phi=(a.attributes.uv.getX(i)-.5)*2*Math.PI;
  if(Math.abs(dx)+Math.abs(dz)>1e-5)changed++;
  if(v<.25||v>.68||Math.abs(phi)>.8)assert(Math.abs(dx)+Math.abs(dz)<1e-6);
 }
 assert(changed>0);for(const g of [src,a,b])g.dispose();
}
console.log('Nose variants: isolated, finite and localized');
