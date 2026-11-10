import * as THREE from 'three';
// Trial-only fine grain on a cloned face map, with ear skin textures derived
// from the same sampled skin palette and grain function. Not a seam weld.
const grain=(x,y)=>{let n=Math.imul(x+11,374761393)^Math.imul(y+29,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295-.5};
export function textureSkin(rig){
 const original=rig.headMesh.material.map,img=original.image,c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,c.width,c.height);
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4,n=grain(x,y)*2.5;for(let k=0;k<3;k++)data.data[i+k]+=n}
 ctx.putImageData(data,0,0);const map=original.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material=rig.headMesh.material.clone();rig.headMesh.material.map=map;
 for(const ear of rig.trialEars){
  const [r,g,b]=ear.userData.sampledSkin,ec=document.createElement('canvas');ec.width=ec.height=128;const ectx=ec.getContext('2d'),im=ectx.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){let i=(y*128+x)*4,n=grain(x,y)*2.5;im.data[i]=r+n;im.data[i+1]=g+n;im.data[i+2]=b+n;im.data[i+3]=255}ectx.putImageData(im,0,0);
  const ep=ear.geometry.attributes.position,coords=[];for(let i=0;i<ep.count;i++)coords.push(THREE.MathUtils.clamp((ep.getZ(i)+.05)/.10,0,1),THREE.MathUtils.clamp((ep.getY(i)-.04)/.10,0,1));ear.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(coords,2));
  const tex=new THREE.CanvasTexture(ec);tex.colorSpace=THREE.SRGBColorSpace;ear.material=ear.material.clone();ear.material.color.set(0xffffff);ear.material.map=tex;ear.material.needsUpdate=true;
 }
}
