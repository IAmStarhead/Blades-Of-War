// Trial only: reduce contrast on the cloned top-of-neck texture; this cannot
// weld the meshes or alter the head-neck silhouette.
export function softenNeckColour(rig){
 const old=rig.bodyMesh.material.map,im=old.image,canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;const ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
 const image=ctx.getImageData(0,0,canvas.width,canvas.height),d=image.data;
 for(let y=0;y<36;y++)for(let x=0;x<canvas.width;x++){
  let t=1-Math.min(1,y/36);t=t*t*(3-2*t);let i=(y*canvas.width+x)*4;
  for(let k=0;k<3;k++)d[i+k]*=1-.12*t;
 }
 ctx.putImageData(image,0,0);rig.bodyMesh.material=rig.bodyMesh.material.clone();const map=old.clone();map.image=canvas;map.needsUpdate=true;rig.bodyMesh.material.map=map;
}
// Prune small residual scalp-margin faces from copied, unindexed ear geometry.
// Ear details above the side surface stay in place.
export function trimEarMargins(ears,female){
 for(const ear of ears){
  const p=ear.geometry.attributes.position,index=ear.geometry.index,keep=[];
  for(let i=0;i<index.count;i+=3){
   const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
   const maxX=Math.max(Math.abs(p.getX(a)),Math.abs(p.getX(b)),Math.abs(p.getX(c)));
   const maxY=Math.max(p.getY(a),p.getY(b),p.getY(c));
   // Crop only the upper scalp flap, not the raised helix.
   if(maxX<(female?.077:.083)&&maxY>(female?.104:.112))continue;
   keep.push(a,b,c);
  }
  ear.geometry.setIndex(keep);
 }
}
