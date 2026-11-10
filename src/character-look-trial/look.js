import * as THREE from 'three';
// A separate, compact swept-back cap. Its UVs and texture are independent of
// skin; the underlying head and old hairstyles are not modified.
function makeSampler(rig){
 const g0=rig.headMesh.geometry,pos=g0.attributes.position,uv0=g0.attributes.uv,normal=g0.attributes.normal,index=g0.index;
 const tris=[];for(let j=0;j<index.count;j+=3){const ids=[index.getX(j),index.getX(j+1),index.getX(j+2)];let u=ids.map(i=>uv0.getX(i)),v=ids.map(i=>uv0.getY(i));let det=(v[1]-v[2])*(u[0]-u[2])+(u[2]-u[1])*(v[0]-v[2]);if(Math.abs(det)>1e-10)tris.push({ids,u,v,det})}
 function surface(u,v){for(const t of tris){const {ids,u:x,v:y,det}=t;if(u<Math.min(...x)-1e-6||u>Math.max(...x)+1e-6||v<Math.min(...y)-1e-6||v>Math.max(...y)+1e-6)continue;const a=((y[1]-y[2])*(u-x[2])+(x[2]-x[1])*(v-y[2]))/det,b=((y[2]-y[0])*(u-x[2])+(x[0]-x[2])*(v-y[2]))/det,c=1-a-b;if(Math.min(a,b,c)<-1e-5)continue;const point=new THREE.Vector3(),norm=new THREE.Vector3();for(let i=0;i<3;i++){point.addScaledVector(new THREE.Vector3(pos.getX(ids[i]),pos.getY(ids[i]),pos.getZ(ids[i])),[a,b,c][i]);norm.addScaledVector(new THREE.Vector3(normal.getX(ids[i]),normal.getY(ids[i]),normal.getZ(ids[i])),[a,b,c][i])}return {point,normal:norm.normalize()}}throw new Error(`no head UV at ${u}, ${v}`)}
 return surface;
}
function makeHair(rig,female){
 const surface=makeSampler(rig);
 const rows=22,cols=64,positions=[],uv=[],idx=[];
 for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
  const u=i/cols,phi=(u-.5)*2*Math.PI,front=Math.max(0,Math.cos(phi));
  const edge=.48+.26*Math.pow(front,1.6)+.10*Math.abs(Math.sin(phi))+.012*Math.sin(phi)*front;
  const v=.985+(edge-.985)*(j/rows);
  const sample=surface(u,v),pt=sample.point.addScaledVector(sample.normal,.006+.0015*Math.pow(Math.sin(phi*4+v*5),2));positions.push(...pt.toArray());uv.push(u,1-j/rows);
 }
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const a=j*(cols+1)+i,b=a+1,c=a+cols+1,d=c+1;idx.push(a,c,b,b,c,d)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function hairTexture(){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#70503a';ctx.fillRect(0,0,256,256);
 // Small directional locks, not identical stripes from hairline to crown.
 for(let i=0;i<175;i++){const x=(i*67+13)%256,y=(i*83+9)%256,len=10+(i*17%28),bend=3+(i%5);ctx.strokeStyle=i%4===0?'rgba(238,198,151,.11)':'rgba(35,21,16,.14)';ctx.lineWidth=i%3===0?1.2:.7;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+bend,y+len*.55,x+bend*.5,y+len);ctx.stroke()}
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
export function addHair(rig,female){const g=makeHair(rig,female),tex=hairTexture(),mat=new THREE.MeshLambertMaterial({map:tex,side:THREE.DoubleSide});const mesh=new THREE.Mesh(g,mat);mesh.name='trial-styled-hair';rig.headMesh.parent.add(mesh);
 if(female){const bun=new THREE.Mesh(new THREE.SphereGeometry(1,20,12),mat);bun.scale.set(.033,.035,.035);bun.position.set(0,.078,-.101);bun.name='trial-low-bun';rig.headMesh.parent.add(bun);mesh.userData.bun=bun;}
 return mesh;}


function patchGeometry(rig,rows,cols,point){
 const surface=makeSampler(rig),positions=[],uv=[],idx=[];
 for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
  const {u,v,offset}=point(i/cols,j/rows),s=surface(u,v);positions.push(...s.point.addScaledVector(s.normal,offset).toArray());uv.push(i/cols,j/rows);
 }
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){let a=j*(cols+1)+i,b=a+1,c=a+cols+1,d=c+1;idx.push(a,c,b,b,c,d)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
export function addBeard(rig){
 const parent=rig.headMesh.parent,tex=hairTexture(),mat=new THREE.MeshLambertMaterial({map:tex,side:THREE.DoubleSide});
 const beard=patchGeometry(rig,14,32,(x,y)=>{const u=.365+x*.27,a=Math.abs(x*2-1);return {u,v:(.305+.052*a)*(1-y)+(.12+.075*a)*y,offset:.0035+.003*Math.sin(Math.PI*y)} });
 const mesh=new THREE.Mesh(beard,mat);mesh.name='trial-beard';parent.add(mesh);
 const moustache=patchGeometry(rig,5,24,(x,y)=>{let a=Math.abs(x*2-1),u=.435+x*.13,top=.371-.014*a,bot=.332+.008*a;return {u,v:top*(1-y)+bot*y,offset:.0045+.001*Math.sin(Math.PI*y)} });
 const stache=new THREE.Mesh(moustache,mat);stache.name='trial-moustache';parent.add(stache);return {mesh,stache};
}
