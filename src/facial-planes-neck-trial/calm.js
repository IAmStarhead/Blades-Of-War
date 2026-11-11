// Reduce only the painted brow-area haze above the eyebrows. Copy the texture;
// do not alter brows, eyelids, nose or lips, or touch the source game assets.
export function softenBrowShadow(rig){
 const old=rig.headMesh.material.map,img=old.image,c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
 const w=c.width,h=c.height,im=ctx.getImageData(0,0,w,h),d=im.data,src=d.slice(),sx=w/512,sy=h/512;
 const x0=Math.round(186*sx),x1=Math.round(326*sx),y0=Math.round(209*sy),y1=Math.round(237*sy);
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
  const t=(x-x0)/(x1-x0),fade=.65*Math.max(0,Math.min(1,(x-x0)/(12*sx),(x1-x)/(12*sx),(y-y0)/(7*sy),(y1-y)/(7*sy)));
  const i=(y*w+x)*4,l=(y*w+x0)*4,r=(y*w+x1)*4;
  for(let k=0;k<3;k++)d[i+k]=src[i+k]*(1-fade)+(src[l+k]*(1-t)+src[r+k]*t)*fade;
 }
 ctx.putImageData(im,0,0);rig.headMesh.material=rig.headMesh.material.clone();const map=old.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material.map=map;
}
