// Geometry diagnostics for the isolated procedural-head trials; these are not
// an artistic quality score or a substitute for inspecting all camera angles.
import {buildSculptedHeadGeometry} from '../src/engine3d/bow3d/bowCharacter.js';
import {makeHeadForm as jawTrial} from '../src/game-jaw-profile/head-form.js';
import {makeHeadForm as lastTrial} from '../src/game-anatomy-profile/head-form.js';

const segs=64,rows=41;
function audit(geometry){
 const p=geometry.getAttribute('position');
 // A row is a longitude loop in the original generator. Low rows form the
 // underside, not an anatomical edge loop along the mandible.
 const rowsOut=[];
 for(const r of [2,4,6,8,10,12,16,20,24,28,32,36,38]){
  const points=[];
  for(let s=0;s<=segs;s++){const i=r*(segs+1)+s;points.push([p.getX(i),p.getY(i),p.getZ(i)]);}
  rowsOut.push({v:+(r/40).toFixed(2), y:[Math.min(...points.map(a=>a[1])),Math.max(...points.map(a=>a[1]))].map(x=>+x.toFixed(4)), halfWidth:+Math.max(...points.map(a=>Math.abs(a[0]))).toFixed(4),front:+Math.max(...points.map(a=>a[2])).toFixed(4),back:+Math.min(...points.map(a=>a[2])).toFixed(4)});
 }
 const seam=[];for(let r=0;r<rows;r++){let i=r*(segs+1),j=i+segs;seam.push(Math.hypot(p.getX(i)-p.getX(j),p.getY(i)-p.getY(j),p.getZ(i)-p.getZ(j)));}
 return {seamMax:+Math.max(...seam).toFixed(7),rows:rowsOut};
}
for(const female of [false,true]){
 const original=buildSculptedHeadGeometry(female,false,'north');
 console.log('\n'+(female?'female':'male'));
 for(const [name,g] of [['original',original],['jaw-trial',jawTrial(original,female,'north')],['last-trial',lastTrial(original,female,'north')]]){
  console.log(name,JSON.stringify(audit(g)));if(g!==original)g.dispose();
 }
 original.dispose();
}
