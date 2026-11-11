import * as THREE from 'three';
// Local vertex tint on the exposed underlying head patch, not a physical shadow.
// Applied on the private head only; does not weld the ear to the scalp.
export function shadeBowlBacking(g,female){
 const p=g.attributes.position,colors=new Float32Array(p.count*3);
 for(let i=0;i<p.count;i++){
  const x=Math.abs(p.getX(i)),y=p.getY(i),z=p.getZ(i);
  const dy=(y-(female?.083:.088))/.011,dz=(z-(female?-.008:-.014))/.010;
  const w=(x>(female?.054:.061)?1:0)*.36*Math.exp(-1.35*(dy*dy+dz*dz));
  for(let c=0;c<3;c++)colors[i*3+c]=1-w;
 }g.setAttribute('color',new THREE.BufferAttribute(colors,3));
}
