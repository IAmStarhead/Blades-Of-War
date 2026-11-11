import * as THREE from 'three';
// Trial: sample skin beside the ear from the cloned head texture; no source
// texture or head vertices are changed. Geometry and ear shape stay intact.
export function harmonizeEarSkin(rig,ears,female){
 const map=rig.headMesh.material.map,img=map.image,canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
 const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
 const p=rig.headMesh.geometry.attributes.position,uv=rig.headMesh.geometry.attributes.uv;
 for(const ear of ears){
  const side=ear.name.endsWith('left')?-1:1;let best=Infinity,near=0;
  for(let i=0;i<p.count;i++){
   const d=(p.getX(i)-side*(female?.07:.08))**2+(p.getY(i)-.084)**2+(p.getZ(i)+.008)**2;
   if(d<best){best=d;near=i}
  }
  const u=uv.getX(near),v=uv.getY(near),x=Math.max(0,Math.min(canvas.width-1,Math.floor(u*canvas.width))),y=Math.max(0,Math.min(canvas.height-1,Math.floor((map.flipY?1-v:v)*canvas.height)));
  const rgba=ctx.getImageData(x,y,1,1).data;
  ear.material=ear.material.clone();ear.material.color.setRGB(rgba[0]/255,rgba[1]/255,rgba[2]/255,THREE.SRGBColorSpace);
  ear.userData.sampledSkin=[...rgba];

 }
}
