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
  const edge=.44+.29*Math.pow(front,1.6)+.115*Math.abs(Math.sin(phi))+.008*Math.sin(phi)*front+.002*Math.sin(phi*13);
  const v=.985+(edge-.985)*(j/rows);
  const sample=surface(u,v),pt=sample.point.addScaledVector(sample.normal,.006+.0015*Math.pow(Math.sin(phi*4+v*5),2));positions.push(...pt.toArray());uv.push(u,1-j/rows);
 }
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const a=j*(cols+1)+i,b=a+1,c=a+cols+1,d=c+1;idx.push(a,c,b,b,c,d)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function hairTexture(){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#70503a';ctx.fillRect(0,0,256,256);
 // Small directional locks, not identical stripes from hairline to crown.
 for(let i=0;i<350;i++){const x=(i*67+13)%256,y=(i*83+9)%256,len=10+(i*17%28),bend=3+(i%5);ctx.strokeStyle=i%4===0?'rgba(238,198,151,.12)':'rgba(35,21,16,.16)';ctx.lineWidth=i%3===0?1.2:.7;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+bend,y+len*.55,x+bend*.5,y+len);ctx.stroke()}
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
export function addHair(rig,female){
 const g=makeHair(rig,female),tex=hairTexture(),mat=new THREE.MeshLambertMaterial({map:tex,side:THREE.DoubleSide});const parent=rig.headMesh.parent,mesh=new THREE.Mesh(g,mat);mesh.name='trial-styled-hair';parent.add(mesh);
 // Individually tapered, overlapping locks sweep away from an off-centre part.
 for(let n=0;n<8;n++){
  const center=.295+n*.052, length=n<4?-.034:.034;
  const lock=patchGeometry(rig,12,6,(x,y)=>{
   const spread=(.012+.012*Math.sin(Math.PI*y))*(1-.72*y), u=Math.max(.01,Math.min(.99,center+length*y+(x-.5)*spread));
   const front=Math.max(0,Math.cos((u-.5)*2*Math.PI)),edge=.44+.29*Math.pow(front,1.6)+.115*Math.abs(Math.sin((u-.5)*2*Math.PI));
   return {u,v:.93+(edge+.012-.93)*y,offset:.0075+.0012*Math.sin(Math.PI*x)*Math.sin(Math.PI*y)};
  });
  const strand=new THREE.Mesh(lock,mat);strand.name='trial-swept-lock';parent.add(strand);
 }
 if(female){
  // An elongated rolled knot, with several tapered ridges rather than a ball.
  const bun=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),mat);bun.scale.set(.036,.023,.024);bun.position.set(0,.075,-.094);bun.name='trial-low-knot';parent.add(bun);
  for(let n=-2;n<=2;n++){const ridge=new THREE.Mesh(new THREE.CapsuleGeometry(.006,.042,4,8),mat);ridge.rotation.z=Math.PI/2;ridge.rotation.x=n*.17;ridge.scale.set(1,1,.65);ridge.position.set(0,.075+n*.006,-.113+Math.abs(n)*.002);parent.add(ridge)}
 }
 return mesh;
}

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
 const beard=patchGeometry(rig,14,32,(x,y)=>{const u=.335+x*.33,a=Math.abs(x*2-1);return {u,v:(.315+.085*Math.pow(a,1.8))*(1-y)+(.13+.085*a*a)*y,offset:.0035+.003*Math.sin(Math.PI*y)} });
 const mesh=new THREE.Mesh(beard,mat);mesh.name='trial-beard';parent.add(mesh);
 const moustache=patchGeometry(rig,5,24,(x,y)=>{let a=Math.abs(x*2-1),u=.425+x*.15,top=.378-.032*a,bot=.335-.027*Math.pow(a,1.5);return {u,v:top*(1-y)+bot*y,offset:.0052+.001*Math.sin(Math.PI*y)} });
 const stache=new THREE.Mesh(moustache,mat);stache.name='trial-moustache';parent.add(stache);return {mesh,stache};
}
