// A small painted suggestion of the canal entrance, not a physical hole.
// Coordinates are in the existing local ear geometry and cloned head UVs.
export function shadeCanal(rig, female) {
 if (female) {
  for (const ear of rig.trialEars) {
   const p=ear.geometry.attributes.position,c=ear.geometry.attributes.color;
   for(let i=0;i<p.count;i++) {
    const y=(p.getY(i)-.0715)/.0032,z=(p.getZ(i)-.003)/.0038;
    const w=.58*Math.exp(-1.3*(y*y+z*z));
    c.setXYZ(i,c.getX(i)*(1-w),c.getY(i)*(1-w),c.getZ(i)*(1-w));
   }
   c.needsUpdate=true;
  }
 } else {
  // The male head surface covers the ear at the entrance; shade that surface
  // on a private map, rather than darkening an occluded ear vertex.
  const old=rig.headMesh.material.map,img=old.image,canvas=document.createElement('canvas');
  canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
  for(const u of [.2515, .7485]) {
   const x=u*canvas.width,y=(old.flipY?1-.458:.458)*canvas.height;
   ctx.save();ctx.translate(x,y);ctx.scale(1,1.4);
   const grad=ctx.createRadialGradient(0,0,0,0,0,2.5);
   grad.addColorStop(0,'rgba(55,38,34,0.55)');grad.addColorStop(.45,'rgba(75,53,48,0.35)');grad.addColorStop(1,'rgba(75,53,48,0)');
   ctx.fillStyle=grad;ctx.beginPath();ctx.arc(0,0,2.5,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  const map=old.clone();map.image=canvas;map.needsUpdate=true;rig.headMesh.material.map=map;
 }
}
