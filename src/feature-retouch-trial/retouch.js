import * as THREE from 'three';
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
// Move the existing eye-and-brow artwork, not redraw or resize the eye. A
// smooth inverse UV warp avoids hard pasted rectangles and leaves lips alone.
function moveFeatures(rig){const old=rig.headMesh.material.map,im=old.image,w=im.width,h=im.height,c=document.createElement('canvas');c.width=w;c.height=h;let ctx=c.getContext('2d');ctx.drawImage(im,0,0);const img=ctx.getImageData(0,0,w,h),src=img.data.slice(),out=img.data;
 function sample(x,y,k){x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));let x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,w-1),y1=Math.min(y0+1,h-1),u=x-x0,v=y-y0;return (src[(y0*w+x0)*4+k]*(1-u)+src[(y0*w+x1)*4+k]*u)*(1-v)+(src[(y1*w+x0)*4+k]*(1-u)+src[(y1*w+x1)*4+k]*u)*v}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let X=x*512/w,Y=y*512/h,dx=X-256,ad=Math.abs(dx);let weight=smooth(8,16,ad)*(1-smooth(62,75,ad))*smooth(208,219,Y)*(1-smooth(277,290,Y));let shiftX=Math.sign(dx)*1.5*weight*w/512,shiftY=3.5*weight*h/512;let i=(y*w+x)*4;for(let k=0;k<3;k++)out[i+k]=sample(x-shiftX,y-shiftY,k)}
 ctx.putImageData(img,0,0);let map=old.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material=rig.headMesh.material.clone();rig.headMesh.material.map=map;
}
export function enlargeEars(ears){for(const ear of ears){let g=ear.geometry,p=g.attributes.position;g.computeBoundingBox();const box=g.boundingBox,cy=(box.min.y+box.max.y)/2,cz=(box.min.z+box.max.z)/2;for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i),cy+(p.getY(i)-cy)*1.14,cz+(p.getZ(i)-cz)*1.035);p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingBox()}}
// Normals-only relaxation on the lower side/back of the head and upper neck.
// It cannot weld two distinct meshes or alter their silhouette/volume.
export function softenFaceNormals(g){
 const n=g.attributes.normal,original=n.array.slice(),next=original.slice();
 for(let r=5;r<31;r++)for(let t=0;t<64;t++){let angle=Math.abs((t/64-.5)*2*Math.PI);if(angle>1.35)continue;let i=r*65+t,neighbors=[r*65+(t+63)%64,r*65+(t+1)%64,i-65,i+65];let v=new THREE.Vector3(original[3*i]*6,original[3*i+1]*6,original[3*i+2]*6);for(const k of neighbors)v.add(new THREE.Vector3(original[3*k],original[3*k+1],original[3*k+2]));v.normalize();next[3*i]=v.x;next[3*i+1]=v.y;next[3*i+2]=v.z}
 n.array.set(next);n.needsUpdate=true;
}
function smoothJunction(rig,female){const hg=rig.headMesh.geometry,p=hg.attributes.position,n=hg.attributes.normal,uv=hg.attributes.uv;
 for(let i=0;i<Math.min(41*65,p.count);i++){let v=uv.getY(i),angle=Math.abs((uv.getX(i)-.5)*Math.PI*2);let w=(1-smooth(.09,.23,v))*smooth(.7,1.6,angle)*.5;let radial=new THREE.Vector3(p.getX(i),0,p.getZ(i)+.005).normalize(),current=new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i));if(radial.lengthSq()>0){current.lerp(radial,w).normalize();n.setXYZ(i,current.x,current.y,current.z)}}n.needsUpdate=true;
 const body=rig.bodyMesh.geometry,bp=body.attributes.position,bn=body.attributes.normal,h=rig.metrics.hScale||.995,lo=(female?1.44:1.52)*h,hi=(female?1.51:1.59)*h;
 for(let i=0;i<Math.min(500,bp.count);i++){let x=bp.getX(i),y=bp.getY(i),z=bp.getZ(i);if(y<lo||Math.abs(x)>.085||Math.abs(z)>.085)continue;let side=smooth(.15,.65,Math.abs(x)/(Math.hypot(x,z)+1e-9)),back=smooth(0,.025,-z),w=.4*smooth(lo,hi,y)*Math.max(side,back);let radial=new THREE.Vector3(x,0,z).normalize(),cur=new THREE.Vector3(bn.getX(i),bn.getY(i),bn.getZ(i));cur.lerp(radial,w).normalize();bn.setXYZ(i,cur.x,cur.y,cur.z)}bn.needsUpdate=true;
}
export function retouch(rig,female){enlargeEars(rig.trialEars);moveFeatures(rig);softenFaceNormals(rig.headMesh.geometry);smoothJunction(rig,female)}
