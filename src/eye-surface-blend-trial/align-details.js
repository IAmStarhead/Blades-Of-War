import * as THREE from 'three';
const gauss=(x,c,w)=>Math.exp(-(((x-c)/w)**2));
// Subtle bilateral nasal wings around the existing tip; leave the bridge alone.
export function nasalWings(g){const p=g.attributes.position,uv=g.attributes.uv,old=g.attributes.normal.clone();for(let i=0;i<p.count;i++){const a=Math.abs((uv.getX(i)-.5)*2*Math.PI),v=uv.getY(i);const w=gauss(a,.16,.075)*gauss(v,.405,.025);p.setZ(i,p.getZ(i)+.0012*w)}p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;for(let i=0;i<p.count;i++){const a=Math.abs((uv.getX(i)-.5)*2*Math.PI),v=uv.getY(i),w=gauss(a,.16,.12)*gauss(v,.405,.045);let value=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i)).lerp(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)),w).normalize();n.setXYZ(i,value.x,value.y,value.z)}n.needsUpdate=true}
// Scale the original eye artwork locally, without redrawing iris or shape.
// An inverse warp is feathered before the eyebrows and beyond eye edges.
export function enlargeFemaleEyes(rig){const old=rig.headMesh.material.map,im=old.image,c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const img=ctx.getImageData(0,0,c.width,c.height),src=img.data.slice(),out=img.data,w=c.width,h=c.height;
 const smooth=(a,b,x)=>{let t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
 const sample=(x,y,k)=>{x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));let x0=Math.floor(x),y0=Math.floor(y),u=x-x0,v=y-y0,x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1);return ((1-u)*src[(y0*w+x0)*4+k]+u*src[(y0*w+x1)*4+k])*(1-v)+((1-u)*src[(y1*w+x0)*4+k]+u*src[(y1*w+x1)*4+k])*v};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let X=x*512/w,Y=y*512/h,dx=Math.abs(X-256)-36.5,dy=Y-250;let weight=(1-smooth(13,23,Math.abs(dx)))*smooth(238,244,Y)*(1-smooth(259,270,Y));let sx=(X-dx*(1-1/1.07)*weight)*w/512,sy=(Y-dy*(1-1/1.07)*weight)*h/512,i=(y*w+x)*4;for(let k=0;k<3;k++){const base=sample(sx,sy,k);const lash=sample(sx,sy-.7*h/512,k);const lashWeight=.32*weight*smooth(245,247,Y)*(1-smooth(253,255,Y));out[i+k]=base+(Math.min(base,lash)-base)*lashWeight}}
 ctx.putImageData(img,0,0);const map=old.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material=rig.headMesh.material.clone();rig.headMesh.material.map=map;
}
export function adjustDetails(rig,female){nasalWings(rig.headMesh.geometry);if(female)enlargeFemaleEyes(rig);for(const ear of rig.trialEars){let forward=female?.0015:.0025;ear.position.z+=forward;if(ear.userData.root)ear.userData.root.position.z+=forward}}
