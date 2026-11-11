import * as THREE from 'three';
const bump=(x,c,r)=>{const t=Math.abs((x-c)/r);return t>=1?0:(1-t*t)**2};
// Restore most (but not all) of the last trial's retraction. The field fades
// out before the nose and also softens its transition into the upper lip.
export function restoreMouthProjection(g){const p=g.attributes.position,uv=g.attributes.uv,old=g.attributes.normal.clone();g.computeVertexNormals();const base=g.attributes.normal.clone();
 for(let i=0;i<p.count;i++){const a=Math.abs((uv.getX(i)-.5)*Math.PI*2),v=uv.getY(i);let dz=.0028*bump(a,0,.55)*bump(v,.333,.075)+.0025*bump(a,0,.30)*bump(v,.377,.042);if(dz)p.setZ(i,p.getZ(i)+dz)}
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;for(let i=0;i<p.count;i++){const v=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i)).add(new THREE.Vector3(n.getX(i)-base.getX(i),n.getY(i)-base.getY(i),n.getZ(i)-base.getZ(i))).normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;
}
// Attenuate painted dark haze directly beneath the nostrils, while leaving the
// nostril marks and lip intact. Clay view still reveals lighting/geometry.
export function softenNosePaint(rig){const old=rig.headMesh.material.map,im=old.image,c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const w=c.width,h=c.height,imdata=ctx.getImageData(0,0,w,h),d=imdata.data,src=d.slice();const smooth=(a,b,x)=>{let t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const X=x*512/w,Y=y*512/h,a=Math.abs(X-256),f=.75*(1-smooth(12,23,a))*smooth(306,314,Y)*(1-smooth(328,337,Y));if(!f)continue;let i=(y*w+x)*4,l=(y*w+Math.round(226*w/512))*4,r=(y*w+Math.round(286*w/512))*4,t=(X-226)/60;for(let k=0;k<3;k++)d[i+k]=src[i+k]*(1-f)+(src[l+k]*(1-t)+src[r+k]*t)*f}
 ctx.putImageData(imdata,0,0);const map=old.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material=rig.headMesh.material.clone();rig.headMesh.material.map=map;}
export function repairProfile(rig){restoreMouthProjection(rig.headMesh.geometry);softenNosePaint(rig)}
