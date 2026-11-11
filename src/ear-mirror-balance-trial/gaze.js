import {eraseIris} from './iris-depth.js';
// A study-only view-dependent iris parallax approximation on an otherwise
// unchanged painted eye. It does not rotate the head or track the camera.
// Cached maps cover the continuous viewer angle in 1/8th increments.
export function makeGazeMaps(rig){
 eraseIris(rig);const material=rig.headMesh.material,source=material.map,im=source.image,w=im.width,h=im.height;
 rig.gazeMaps=[];
 for(let step=-8;step<=8;step++){
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);ctx.save();ctx.scale(w/512,h/512);
  for(const ex of [222.7,289.3]){
   const shift=(ex<256?1:-1)*Math.abs(step)/8*7,cx=ex+shift,cy=251.4;
   // Constrain colour to the existing relaxed eye opening, not over the lid.
   ctx.save();ctx.beginPath();ctx.moveTo(ex-14,251.0);ctx.quadraticCurveTo(ex,247.7,ex+14,251.0);ctx.quadraticCurveTo(ex,258.0,ex-14,251.0);ctx.clip();
   ctx.fillStyle='#384b59';ctx.beginPath();ctx.ellipse(cx,cy,5.8,4.5,0,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='#1c2021';ctx.beginPath();ctx.ellipse(cx,cy,2.7,2.8,0,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='#fff9ee';ctx.beginPath();ctx.arc(cx-1,cy-1.05,.8,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  ctx.restore();const map=source.clone();map.image=c;map.needsUpdate=true;rig.gazeMaps.push(map);
 }
 rig.headMesh.material.map=rig.gazeMaps[8];
}
export function updateGazeMap(rig,viewAngle){const shift=Math.max(-1,Math.min(1,Math.sin(viewAngle))),i=Math.round(shift*8)+8,map=rig.gazeMaps[i];if(rig.headMesh.material.map!==map){rig.headMesh.material.map=map;rig.headMesh.material.needsUpdate=true}}
