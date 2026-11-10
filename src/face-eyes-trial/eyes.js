// Comparison-only eye redraw on a cloned head texture. No geometry, mouth,
// nose, brows or original texture is edited. Pixel centres are mirrored in UV.
export function redrawEyes(rig,female){
 const source=rig.headMesh.material.map,im=source.image,c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);
 const w=c.width,h=c.height,sx=w/512,sy=h/512,center=w/2,eyeY=h*.495,dx=(female?35:37)*sx;
 for(const side of [-1,1]){
  const ex=center+side*dx,x0=Math.round(ex-19*sx),x1=Math.round(ex+19*sx),y0=Math.round(eyeY-7*sy),y1=Math.round(eyeY+13*sy);
  const image=ctx.getImageData(0,0,w,h),d=image.data,src=d.slice();
  // Blend the original eyelid region to neighbouring skin; avoid brows/nose.
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   let t=(x-x0)/(x1-x0),edge=Math.min((x-x0)/3,(x1-x)/3,(y-y0)/3,(y1-y)/3,1);edge=Math.max(0,edge);
   let i=(y*w+x)*4,l=(y*w+x0)*4,r=(y*w+x1)*4;
   for(let k=0;k<3;k++)d[i+k]=src[i+k]*(1-edge)+(src[l+k]*(1-t)+src[r+k]*t)*edge;
  }
  ctx.putImageData(image,0,0);
  ctx.save();ctx.translate(ex,eyeY);ctx.scale(sx,sy);
  // Almond, upper lid and lower rim, symmetric about the face centre.
  ctx.fillStyle='#ded4ca';ctx.beginPath();ctx.moveTo(-14,2);ctx.quadraticCurveTo(0,-5.3,14,2);ctx.quadraticCurveTo(0,8,-14,2);ctx.fill();
  ctx.fillStyle=female?'#42525e':'#38454f';ctx.beginPath();ctx.ellipse(0,2,6.0,4.5,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#1d1a19';ctx.beginPath();ctx.arc(0,2,2.6,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(255,250,244,.7)';ctx.beginPath();ctx.arc(-1.2,.5,.8,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=female?'#352a27':'#3a302c';ctx.lineWidth=female?1.8:1.9;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-14,2);ctx.quadraticCurveTo(0,-5.4,14,2);ctx.stroke();
  ctx.strokeStyle='rgba(116,78,65,.48)';ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(-12,4);ctx.quadraticCurveTo(0,8,12,4);ctx.stroke();
  if(female){ctx.strokeStyle='#51413b';ctx.lineWidth=.8;for(let j=0;j<3;j++){const x=side*(10+j*1.4);ctx.beginPath();ctx.moveTo(x,.2+j*.35);ctx.lineTo(x+side*.8,-1+j*.25);ctx.stroke()}}
  ctx.restore();
 }
 rig.headMesh.material=rig.headMesh.material.clone();const map=source.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material.map=map;
}
