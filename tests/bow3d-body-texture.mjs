import assert from 'node:assert/strict';
import {buildBaseBodyTextureCanvas} from '../src/engine3d/bow3d/bowTextures.js';
// Torso, arms and legs share this skin UV region. Radial shadows painted here
// appear as identical stains on the limbs, so they must not be reintroduced.
for (const kingdom of ['north', 'eden']) for (const female of [false, true]) {
  let radialGradients = 0, strokes = 0;
  const gradient = {addColorStop(){}};
  const ctx = new Proxy({}, {get:(o,k)=>{
    if(k==='createRadialGradient') return ()=>{radialGradients++;return gradient};
    if(k==='createLinearGradient') return ()=>gradient;
    if(k==='stroke') return ()=>{strokes++};
    return o[k] || (()=>{});
  },set:(o,k,v)=>(o[k]=v,true)});
  buildBaseBodyTextureCanvas({kingdom,female}, (width,height)=>({width,height,getContext:()=>ctx}));
  assert.equal(radialGradients,0,'shared skin zone must not contain baked torso shadows');
  assert.equal(strokes,4,'subtle toe crease strokes are present');
}
console.log('Body texture: no torso shadow stains in shared skin atlas');
