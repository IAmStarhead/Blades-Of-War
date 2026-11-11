// A temporary painted lip study on a cloned map, with no displacement of the
// approved nose or mouth geometry. Edges taper and lower lip has a soft bow.
export function redrawLips(rig,female){
 const old=rig.headMesh.material.map,img=old.image,c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
 const sx=c.width/512,sy=c.height/512,im=ctx.getImageData(0,0,c.width,c.height),d=im.data,src=d.slice(),w=c.width;
 const x0=Math.round(210*sx),x1=Math.round(302*sx),y0=Math.round(326*sy),y1=Math.round(370*sy);
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
  const t=(x-x0)/(x1-x0),fade=Math.max(0,Math.min(1,(x-x0)/(6*sx),(x1-x)/(6*sx),(y-y0)/(5*sy),(y1-y)/(5*sy)));
  const i=(y*w+x)*4,l=(y*w+x0)*4,r=(y*w+x1)*4;
  for(let k=0;k<3;k++)d[i+k]=src[i+k]*(1-fade)+(src[l+k]*(1-t)+src[r+k]*t)*fade;
 }
 ctx.putImageData(im,0,0);ctx.save();ctx.scale(sx,sy);ctx.translate(256,346);
 const half=female?29:24;
 if(!female)ctx.scale(1,.65);
 ctx.fillStyle=female?'#ad7872':'#b89587';ctx.beginPath();ctx.moveTo(-half,1);
 ctx.bezierCurveTo(-20,-2,-12,-6,-7,-7);ctx.quadraticCurveTo(-3,-6,0,-4.8);ctx.quadraticCurveTo(3,-6,7,-7);ctx.bezierCurveTo(12,-6,20,-2,half,1);
 ctx.quadraticCurveTo(0,3,-half,1);ctx.fill();
 ctx.fillStyle=female?'#c3948b':'#c5a499';ctx.beginPath();ctx.moveTo(-half,1);ctx.quadraticCurveTo(0,3,half,1);
 ctx.bezierCurveTo(20,6,13,10,0,10);ctx.bezierCurveTo(-13,10,-20,6,-half,1);ctx.fill();
 ctx.strokeStyle=female?'rgba(112,68,65,.55)':'rgba(105,71,63,.48)';ctx.lineWidth=1;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-half,1);ctx.quadraticCurveTo(-13,2,0,2.4);ctx.quadraticCurveTo(13,2,half,1);ctx.stroke();
 ctx.restore();rig.headMesh.material=rig.headMesh.material.clone();const map=old.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material.map=map;
}
