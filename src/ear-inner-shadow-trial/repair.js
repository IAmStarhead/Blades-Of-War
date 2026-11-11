import * as THREE from 'three';
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
// Adjust broad forehead/brow transition on this cloned, subdivided mesh only.
// Grid samples refer to the first 41*65 vertices of the old radial head.
export function smoothBrowSurface(g){const p=g.attributes.position,uv=g.attributes.uv,oldNormal=g.attributes.normal.clone(),prev=p.array.slice();g.computeVertexNormals();const baseNormal=g.attributes.normal.clone();
 function z(r,t){r=Math.max(0,Math.min(40,r));t=(t+64)%64;return prev[3*(r*65+t)+2]}
 function filtered(r,t){return (z(r-2,t)+4*z(r-1,t)+6*z(r,t)+4*z(r+1,t)+z(r+2,t))/16}
 for(let i=0;i<p.count;i++){const u=uv.getX(i),v=uv.getY(i),a=Math.abs((u-.5)*Math.PI*2);if(v<.525||v>.68||a>.95)continue;const rf=v*40,r=Math.min(39,Math.floor(rf)),rv=rf-r,tf=u*64,t=Math.floor(tf)%64,tv=tf-Math.floor(tf);const at=(q,j)=>filtered(q,j),sm=(1-rv)*((1-tv)*at(r,t)+tv*at(r,t+1))+rv*((1-tv)*at(r+1,t)+tv*at(r+1,t+1));const mask=.9*smooth(.525,.55,v)*(1-smooth(.61,.68,v))*smooth(.10,.30,a)*(1-smooth(.65,.95,a));p.setZ(i,p.getZ(i)+(sm-p.getZ(i))*mask)}
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;for(let i=0;i<p.count;i++){const a=new THREE.Vector3(oldNormal.getX(i),oldNormal.getY(i),oldNormal.getZ(i)),d=new THREE.Vector3(n.getX(i)-baseNormal.getX(i),n.getY(i)-baseNormal.getY(i),n.getZ(i)-baseNormal.getZ(i));a.addScaledVector(d,.8).normalize();n.setXYZ(i,a.x,a.y,a.z)}n.needsUpdate=true;
}
// Flatten only the painted upper-brow haze; protect the dark eyebrow strokes.
export function repairTexture(rig){const old=rig.headMesh.material.map,im=old.image,w=im.width,h=im.height,c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const img=ctx.getImageData(0,0,w,h),src=img.data.slice(),out=img.data;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const X=x*512/w,Y=y*512/h,ad=Math.abs(X-256);const spatial=smooth(9,19,ad)*(1-smooth(51,67,ad))*smooth(210,220,Y)*(1-smooth(235,242,Y));if(!spatial)continue;let i=(y*w+x)*4,ref=(Math.round(207*h/512)*w+x)*4;let intensity=(src[i]+src[i+1]+src[i+2])/(src[ref]+src[ref+1]+src[ref+2]+1),weight=.98*spatial*smooth(.48,.82,intensity);for(let k=0;k<3;k++)out[i+k]=src[i+k]*(1-weight)+src[ref+k]*weight}
 // Repair the entire mouth patch against its immediate side skin and redraw
 // closed lips, including a subtle under-lip separation. No smile arc.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const X=x*512/w,Y=y*512/h;if(X<218||X>294||Y<330||Y>366)continue;let fade=Math.max(0,Math.min(1,(X-218)/9,(294-X)/9,(Y-330)/6,(366-Y)/6)),l=(y*w+Math.round(218*w/512))*4,r=(y*w+Math.round(294*w/512))*4,i=(y*w+x)*4,t=(X-218)/76;for(let k=0;k<3;k++)out[i+k]=src[i+k]*(1-fade)+(src[l+k]*(1-t)+src[r+k]*t)*fade}
 ctx.putImageData(img,0,0);ctx.save();ctx.scale(w/512,h/512);
 // Low-contrast upper and lower lip planes; ends deliberately not lifted.
 ctx.fillStyle='rgba(154,107,92,.52)';ctx.beginPath();ctx.moveTo(238,344);ctx.quadraticCurveTo(248,340.8,256,342.0);ctx.quadraticCurveTo(264,340.8,274,344);ctx.quadraticCurveTo(256,344.0,238,344);ctx.fill();
 ctx.fillStyle='rgba(177,132,116,.52)';ctx.beginPath();ctx.moveTo(238,344);ctx.quadraticCurveTo(256,343.0,274,344);ctx.quadraticCurveTo(256,349.0,238,344);ctx.fill();
 ctx.strokeStyle='rgba(96,66,55,.78)';ctx.lineWidth=1.3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(238,344);ctx.quadraticCurveTo(256,344,274,344);ctx.stroke();
 ctx.strokeStyle='rgba(108,75,60,.36)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(246,351);ctx.quadraticCurveTo(256,352,266,351);ctx.stroke();ctx.restore();const map=old.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material=rig.headMesh.material.clone();rig.headMesh.material.map=map;}
export function fixMaleFace(rig){smoothBrowSurface(rig.headMesh.geometry);repairTexture(rig)}
