// Trial only: tint a tiny part of the private head texture visible through
// the open inner-ear boundary. This masks a bright gap, not topology repair.
export function maskMaleEarGap(rig) {
 const old=rig.headMesh.material.map,img=old.image,canvas=document.createElement('canvas');
 canvas.width=img.width;canvas.height=img.height;
 const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
 for(const u of [.230, .770]) {
  const x=u*canvas.width,y=(old.flipY?1-.469:.469)*canvas.height;
  ctx.save();ctx.translate(x,y);ctx.scale(.8,1.5);
  const gradient=ctx.createRadialGradient(0,0,0,0,0,3);
  gradient.addColorStop(0,'rgba(66,50,46,.62)');gradient.addColorStop(.5,'rgba(80,62,56,.38)');gradient.addColorStop(1,'rgba(80,62,56,0)');
  ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(0,0,3,0,2*Math.PI);ctx.fill();ctx.restore();
 }
 const map=old.clone();map.image=canvas;map.needsUpdate=true;rig.headMesh.material.map=map;
}
