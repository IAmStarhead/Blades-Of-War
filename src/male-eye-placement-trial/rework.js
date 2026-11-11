import * as THREE from 'three';
const gauss=(x,c,w)=>Math.exp(-(((x-c)/w)**2));
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const band=(a,b,c,d,x)=>smooth(a,b,x)*(1-smooth(c,d,x));
const bump=(x,c,r)=>{const q=Math.abs(x-c)/r;return q>=1?0:(1-q*q)**2};
// Linearly refine existing indexed triangles without changing their position,
// UVs, or rest surface. New geometry is only used on this study copy.
export function splitTriangles(g){const idx=g.index,attrs=g.attributes,n=attrs.position.count;const keys=Object.keys(attrs).filter(k=>['position','normal','uv'].includes(k));let arrays=Object.fromEntries(keys.map(k=>[k,Array.from(attrs[k].array)])),cache=new Map(),ind=[];
 function mid(a,b){const key=a<b?`${a}:${b}`:`${b}:${a}`;if(cache.has(key))return cache.get(key);let i=arrays.position.length/3;for(const k of keys){const at=attrs[k],size=at.itemSize;for(let j=0;j<size;j++)arrays[k].push((at.getComponent(a,j)+at.getComponent(b,j))/2)}cache.set(key,i);return i}
 for(let i=0;i<idx.count;i+=3){let a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2),ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);ind.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca)}
 const result=new THREE.BufferGeometry();for(const k of keys)result.setAttribute(k,new THREE.Float32BufferAttribute(arrays[k],attrs[k].itemSize));result.setIndex(ind);result.userData={...g.userData};return result}
// Subtract the three known layered procedural cheek/brow shapes inherited by
// this copy, including the engine base shape, then build broad new planes.
export function reworkGeometry(g,female){const p=g.attributes.position,uv=g.attributes.uv,old=g.attributes.normal.clone();g.computeVertexNormals();const baseNormal=g.attributes.normal.clone();for(let i=0;i<p.count;i++){
 const phi=(uv.getX(i)-.5)*2*Math.PI,a=Math.abs(phi),v=uv.getY(i),cos=Math.cos(phi);
 const nose=(1-smooth(.26,.45,a))*band(.34,.39,.56,.63,v),mouth=(1-smooth(.30,.46,a))*band(.27,.30,.36,.42,v),guard=1-Math.max(nose,mouth),side=band(.32,.6,1,1.45,a);
 const origBrow=cos>.2?gauss(phi,0,.86)*gauss(v,.555,.046)*(female?.004:.010):0;
 const origCheek=cos>.1?gauss(a,.64,.28)*gauss(v,.435,.085)*(female?.004:.006):0;
 const protectN=(1-smooth(.26,.38,a))*smooth(.35,.40,v)*(1-smooth(.57,.62,v));const protectM=(1-smooth(.30,.40,a))*smooth(.28,.31,v)*(1-smooth(.36,.39,v));
 let refine=((female?.0021:.0025)*bump(a,.60,.40)*bump(v,.445,.15)-(female?.00065:.0009)*bump(a,.44+(female?0:-.055),.27)*bump(v,.525,.075)+(female?.00035:.0008)*bump(a,.45+(female?0:-.055),.27)*bump(v,.58,.065))*(1-Math.max(protectN,protectM));
 if((a<.26&&v>.37&&v<.57)||(a<.30&&v>.30&&v<.36))refine=0;
 const shift=female?0:-.055;
 const planes=guard*((female?.0030:.0040)*side*gauss(v,.455,.115)-(female?.0012:.0015)*gauss(a,.46+shift,.23)*gauss(v,.515,.035)+(female?.0013:.0020)*gauss(a,.46+shift,.25)*gauss(v,.565,.05));
 const d=(a-.405)/.22,prior=(female?.0022:.0031)*gauss(a,.405,.22)*gauss(v,.538+.007*Math.exp(-d*d)+.004*d,.035)-(female?.0010:.0014)*gauss(a,.405,.20)*gauss(v,.511,.03)+.0011*gauss(a,.65,.29)*gauss(v,.445,.08);
 // Eye art is centred near v=.515, eyebrow near v=.535. Place upper
 // recess immediately below the curved rim. Lighting can still shade the forehead.
 const browCenter=.539+.004*Math.exp(-d*d)+.003*d;
 const rim=gauss(a,.405,.24)*gauss(v,browCenter,.022);
 const under=gauss(a,.405,.22)*gauss(v,browCenter-.025,.020);
 // A wide, gently sloping cheek plane, blending into the temple and midface.
 const cheek=band(.30,.48,.90,1.22,a)*gauss(v,.444,.135);
 const newShape=(female?.0035:.0045)*rim-(female?.0015:.0020)*under+(female?.0025:.0032)*cheek;
 let change=-origBrow-origCheek-refine-planes-prior+newShape;
 // Do not affect the nose, lips, rear head, or very high forehead.
 const region=smooth(.04,.48,a)*(1-smooth(1.20,1.55,a))*smooth(.29,.35,v)*(1-smooth(.59,.72,v));change*=region;
 p.setZ(i,p.getZ(i)+change);
 }p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;for(let i=0;i<p.count;i++){const a=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i)),b=new THREE.Vector3(n.getX(i)-baseNormal.getX(i),n.getY(i)-baseNormal.getY(i),n.getZ(i)-baseNormal.getZ(i)),z=a.addScaledVector(b,.75).normalize();n.setXYZ(i,z.x,z.y,z.z)}n.needsUpdate=true;}
// Reduce lip width without reducing height; sample the same existing mouth.
export function narrowMouth(rig){const map0=rig.headMesh.material.map,im=map0.image,c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const img=ctx.getImageData(0,0,c.width,c.height),src=img.data.slice(),out=img.data,w=c.width,h=c.height;
 const sample=(x,y,k)=>{x=Math.max(0,Math.min(w-1,x));const x0=Math.floor(x),x1=Math.min(w-1,x0+1),f=x-x0;return src[(y*w+x0)*4+k]*(1-f)+src[(y*w+x1)*4+k]*f};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const X=x*512/w,Y=y*512/h,dx=X-256,weight=(1-smooth(29,42,Math.abs(dx)))*smooth(327,337,Y)*(1-smooth(360,371,Y)),sx=(X+dx*(1/.88-1)*weight)*w/512,i=(y*w+x)*4;for(let k=0;k<3;k++)out[i+k]=sample(sx,y,k)}ctx.putImageData(img,0,0);const map=map0.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material=rig.headMesh.material.clone();rig.headMesh.material.map=map;}
export function reworkFace(rig,female){const original=rig.headMesh.geometry;rig.headMesh.geometry=splitTriangles(original);original.dispose();reworkGeometry(rig.headMesh.geometry,female);if(female)narrowMouth(rig)}
