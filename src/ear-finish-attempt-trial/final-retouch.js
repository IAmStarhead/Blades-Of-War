import * as THREE from 'three';
const gauss=(x,c,w)=>Math.exp(-(((x-c)/w)**2));
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
// Narrow the woman's eye+brow spacing and modestly expand the original lip drawing.
function warpFemale(rig){const old=rig.headMesh.material.map,im=old.image,c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const img=ctx.getImageData(0,0,c.width,c.height),src=img.data.slice(),out=img.data,w=c.width,h=c.height;
 const sample=(x,y,k)=>{x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),u=x-x0,v=y-y0;return ((1-u)*src[(y0*w+x0)*4+k]+u*src[(y0*w+x1)*4+k])*(1-v)+((1-u)*src[(y1*w+x0)*4+k]+u*src[(y1*w+x1)*4+k])*v};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const X=x*512/w,Y=y*512/h,dx=X-256,ad=Math.abs(dx),eye=smooth(8,16,ad)*(1-smooth(58,72,ad))*smooth(210,219,Y)*(1-smooth(275,287,Y)),lip=(1-smooth(25,38,ad))*smooth(329,336,Y)*(1-smooth(358,370,Y));let sx=(X+Math.sign(dx)*4*eye)*w/512,sy=(Y-(Y-348)*(1-1/1.22)*lip)*h/512;const i=(y*w+x)*4;for(let k=0;k<3;k++)out[i+k]=sample(sx,sy,k)}
 ctx.putImageData(img,0,0);const map=old.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material=rig.headMesh.material.clone();rig.headMesh.material.map=map;
}
// Broad, shallow relief follows the eye and the curved brow instead of a
// horizontal ridge. UV positions are approximations to the painted features.
export function addFaceRelief(g,female){const p=g.attributes.position,uv=g.attributes.uv,old=g.attributes.normal.clone(),influence=new Float32Array(p.count);for(let i=0;i<p.count;i++){let a=Math.abs((uv.getX(i)-.5)*2*Math.PI),v=uv.getY(i),d=(a-.405)/.22;
 const curvedBrow=.538+.007*Math.exp(-d*d)+.004*d;
 const ridge=gauss(a,.405,.22)*gauss(v,curvedBrow,.035);
 const socket=gauss(a,.405,.20)*gauss(v,.511,.03);
 const cheek=gauss(a,.65,.29)*gauss(v,.445,.08);
 const lip=female?gauss(a,0,.22)*gauss(v,.32,.025):0;
 const dz=(female?.0022:.0031)*ridge-(female?.0010:.0014)*socket+.0011*cheek+.0010*lip;
 p.setZ(i,p.getZ(i)+dz);influence[i]=Math.min(1,Math.abs(dz)/.001);
 }p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;for(let i=0;i<p.count;i++){let q=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i)).lerp(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)),.8*influence[i]).normalize();n.setXYZ(i,q.x,q.y,q.z)}n.needsUpdate=true;}
export function finalFace(rig,female){if(female)warpFemale(rig);addFaceRelief(rig.headMesh.geometry,female)}
// Rest-pose normal averaging near intersecting surfaces; no geometry/volume
// changes and no weld. It cannot fix holes, silhouette or moving seams.
export function matchNeckNormals(rig){const h=rig.headMesh.geometry,b=rig.bodyMesh.geometry,hp=h.attributes.position,bp=b.attributes.position,hn=h.attributes.normal,bn=b.attributes.normal,uv=h.attributes.uv,ho=hn.array.slice(),bo=bn.array.slice(),hy=rig.metrics.headY;
 const head=[],body=[];for(let i=0;i<hp.count;i++)if(uv.getY(i)<.30)head.push(i);for(let j=0;j<Math.min(bp.count,500);j++)if(bp.getY(j)>hy-.06&&Math.abs(bp.getX(j))<.085&&Math.abs(bp.getZ(j))<.09)body.push(j);
 for(const i of head){let best=-1,d=.012**2;for(const j of body){let q=(hp.getX(i)-bp.getX(j))**2+(hp.getY(i)+hy-bp.getY(j))**2+(hp.getZ(i)-bp.getZ(j))**2;if(q<d){best=j;d=q}}if(best>=0){const w=.25*(1-Math.sqrt(d)/.012),n=new THREE.Vector3(ho[3*i],ho[3*i+1],ho[3*i+2]).lerp(new THREE.Vector3(bo[3*best],bo[3*best+1],bo[3*best+2]),w).normalize();hn.setXYZ(i,n.x,n.y,n.z)}}
 for(const j of body){let best=-1,d=.012**2;for(const i of head){let q=(hp.getX(i)-bp.getX(j))**2+(hp.getY(i)+hy-bp.getY(j))**2+(hp.getZ(i)-bp.getZ(j))**2;if(q<d){best=i;d=q}}if(best>=0){const w=.25*(1-Math.sqrt(d)/.012),n=new THREE.Vector3(bo[3*j],bo[3*j+1],bo[3*j+2]).lerp(new THREE.Vector3(ho[3*best],ho[3*best+1],ho[3*best+2]),w).normalize();bn.setXYZ(j,n.x,n.y,n.z)}}hn.needsUpdate=true;bn.needsUpdate=true;
}
