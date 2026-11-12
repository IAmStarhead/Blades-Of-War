import * as THREE from 'three';
import {buildMaleBlockout as original, buildBlockoutShorts as buildBlockoutShortsSource} from '../male-body-rebuild-blockout/blockout.js';
export function buildBlockoutShorts(metrics) {
 const g=buildBlockoutShortsSource(metrics), p=g.attributes.position;
 for(let i=0;i<p.count;i++){p.setX(i,p.getX(i)*1.06);p.setZ(i,p.getZ(i)*1.12)}
 p.needsUpdate=true;g.computeVertexNormals();return g;
}

// Implicit surfaces are an isolated STATIC shape study. Legs are copied from
// the first blockout. This is not the game's body and has no skinning/cuts.
export function buildMaleBlockout(metrics){
 const h=metrics.hScale||1,w=metrics.wScale||1;
 const torso=[[.875,.128,.092,-.01],[.925,.158,.109,-.005],[1.015,.144,.098,-.003],[1.07,.137,.097,0],[1.13,.145,.101,0],[1.20,.161,.108,0],[1.27,.175,.113,0],[1.32,.177,.111,0],[1.36,.174,.102,-.003],[1.40,.154,.092,-.006],[1.43,.110,.075,-.007],[1.46,.069,.061,-.005],[1.50,.051,.053,-.003],[1.54,.049,.050,0],[1.585,.047,.047,0]];
 const arm=[[.80,.010,.019,.211,.01],[.82,.018,.026,.212,.01],[.85,.024,.030,.213,.01],[.89,.026,.026,.213,.004],[.95,.032,.034,.211,0],[1.0,.038,.040,.208,-.003],[1.07,.040,.043,.205,-.005],[1.115,.039,.041,.203,-.005],[1.16,.044,.045,.202,-.006],[1.21,.049,.050,.201,-.005],[1.26,.051,.055,.199,-.004],[1.30,.052,.059,.197,-.004],[1.34,.054,.061,.197,-.004],[1.37,.050,.058,.193,-.006],[1.395,.037,.049,.175,-.007],[1.41,.019,.029,.157,-.008],[1.415,.004,.007,.152,-.008]];
 function interp(rows,y){
  let i=0;while(i<rows.length-2&&y>rows[i+1][0])i++;
  const a=rows[i],b=rows[i+1],dt=b[0]-a[0],t=Math.max(0,Math.min(1,(y-a[0])/dt));
  return a.map((v,k)=>{
   if(!k)return y;
   const prev=rows[Math.max(0,i-1)],next=rows[Math.min(rows.length-1,i+2)];
   const m0=(b[k]-prev[k])/(b[0]-prev[0]),m1=(next[k]-a[k])/(next[0]-a[0]);
   const value=(2*t**3-3*t*t+1)*v+(t**3-2*t*t+t)*dt*m0+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*dt*m1;
   return Math.max(Math.min(a[k],b[k]),Math.min(Math.max(a[k],b[k]),value));
  });
 }
 function ellipse(x,z,rx,rz){return (Math.hypot(x/rx,z/rz)-1)*Math.min(rx,rz)}
 function smoothMin(a,b,k){let t=Math.max(0,Math.min(1,.5+.5*(b-a)/k));return b*(1-t)+a*t-k*t*(1-t)}
 function field(x,y,z){
   const t=interp(torso,y);
   let d=Math.max(ellipse(x,z-t[3],t[1],t[2]),.905-y,y-1.585);
   const a=interp(arm,y);
   for(const sign of [-1,1]){
    const da=Math.max(ellipse(x-sign*a[3],z-a[4],a[1],a[2]),.80-y,y-1.415);
    // Only shoulder/upper-arm zone merges with torso; the rest stays separate.
    const t=Math.max(0,Math.min(1,(y-1.08)/.18)); const blend=.005+.030*t*t*(3-2*t); d=smoothMin(d,da,blend);
   }
   return d;
 }
 const step=.008,lo=[-.32,.79,-.18],hi=[.32,1.60,.19];
 const nx=Math.ceil((hi[0]-lo[0])/step)+1,ny=Math.ceil((hi[1]-lo[1])/step)+1,nz=Math.ceil((hi[2]-lo[2])/step)+1,total=nx*ny*nz;
 const values=new Float32Array(total),index=(x,y,z)=>x+nx*(y+ny*z),coord=(x,y,z)=>[lo[0]+x*step,lo[1]+y*step,lo[2]+z*step];
 for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const p=coord(x,y,z);values[index(x,y,z)]=field(...p)}
 const positions=[],uvs=[],normals=[],indices=[],cache=new Map(),eps=.001;
 function vertex(id1,id2,p1,p2,v1,v2){const key=id1<id2?`${id1}:${id2}`:`${id2}:${id1}`;if(cache.has(key))return cache.get(key);const t=v1/(v1-v2),p=p1.map((v,k)=>v+(p2[k]-v)*t),x=p[0],y=p[1],z=p[2];
  let gx=(field(x+eps,y,z)-field(x-eps,y,z))/(2*eps*w),gy=(field(x,y+eps,z)-field(x,y-eps,z))/(2*eps*h),gz=(field(x,y,z+eps)-field(x,y,z-eps))/(2*eps*w),l=Math.hypot(gx,gy,gz)||1;
  const id=positions.length/3;positions.push(x*w,y*h,z*w);normals.push(gx/l,gy/l,gz/l);uvs.push(.5,1-200/512);cache.set(key,id);return id;
 }
 function triangle(a,b,c){const ax=positions[a*3],ay=positions[a*3+1],az=positions[a*3+2],ux=positions[b*3]-ax,uy=positions[b*3+1]-ay,uz=positions[b*3+2]-az,vx=positions[c*3]-ax,vy=positions[c*3+1]-ay,vz=positions[c*3+2]-az;
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;if(nx*normals[a*3]+ny*normals[a*3+1]+nz*normals[a*3+2]<0)indices.push(a,c,b);else indices.push(a,b,c);
 }
 const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],tetra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
 for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
  const ids=corners.map(([dx,dy,dz])=>index(x+dx,y+dy,z+dz)),vs=ids.map(i=>values[i]);if(vs.every(v=>v>=0)||vs.every(v=>v<0))continue;
  const ps=corners.map(([dx,dy,dz])=>coord(x+dx,y+dy,z+dz));
  for(const tet of tetra){const inside=tet.filter(i=>vs[i]<0),outside=tet.filter(i=>vs[i]>=0);if(!inside.length||!outside.length)continue;
   const v=(a,b)=>vertex(ids[a],ids[b],ps[a],ps[b],vs[a],vs[b]);
   if(inside.length===1){let a=inside[0];triangle(v(a,outside[0]),v(a,outside[1]),v(a,outside[2]))}
   else if(outside.length===1){let a=outside[0];triangle(v(a,inside[0]),v(a,inside[1]),v(a,inside[2]))}
   else {let [a,b]=inside,[c,d]=outside;const ac=v(a,c),ad=v(a,d),bc=v(b,c),bd=v(b,d);triangle(ac,ad,bd);triangle(ac,bd,bc)}
  }
 }
 const base=original(metrics),parts={};
 for(const name of ['legR','legL']){const part=base.userData.parts[name],start=positions.length/3,baseP=base.attributes.position,baseN=base.attributes.normal,baseUV=base.attributes.uv;
  for(let i=part.vertexStart;i<part.vertexStart+part.vertexCount;i++){positions.push(baseP.getX(i),baseP.getY(i),baseP.getZ(i));normals.push(baseN.getX(i),baseN.getY(i),baseN.getZ(i));uvs.push(baseUV.getX(i),baseUV.getY(i))}
  for(let i=part.indexStart;i<part.indexStart+part.indexCount;i++)indices.push(start+base.index.getX(i)-part.vertexStart);
  parts[name]={vertexStart:start,vertexCount:part.vertexCount};
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.userData={parts,cutNote:'No cutting implemented; this topology has no shoulder/neck cut loops yet.'};return g;
}
