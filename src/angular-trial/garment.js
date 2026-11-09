import * as THREE from 'three';

// A thin shell built from the body surface, clipped in model
// space. It is a separate mesh with thickness, not a colour mask on skin.
export function makeGarment(body, female, part) {
 const geo=body.geometry, pos=geo.attributes.position, normal=geo.attributes.normal,idx=geo.index;
 const floor=body.position.y;
 const planes=part==='briefs'
   ? [[1,-7.72],[-1,9.8],[2,2.16],[-2,2.16]]
   : part==='strapL' ? [[1,-13.32],[-1,14.75],[2,-.69],[-2,1.09]]
   : part==='strapR' ? [[1,-13.32],[-1,14.75],[2,1.09],[-2,-.69]]
   : [[1,-12.0],[-1,13.38],[2,1.52],[-2,1.52]];
 // Plane equation encoded for x/y; polygon clipping preserves interpolated normals.
 const distance=(v,p)=>p[0]===1?v.y+floor+p[1]:p[0]===-1?-v.y-floor+p[1]:p[0]===2?v.x+p[1]:-v.x+p[1];
 const interp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,nx:a.nx+(b.nx-a.nx)*t,ny:a.ny+(b.ny-a.ny)*t,nz:a.nz+(b.nz-a.nz)*t});
 const verts=[],norms=[],triangles=[];
 for(let i=0;i<(idx?idx.count:pos.count);i+=3){
  let poly=[];for(let k=0;k<3;k++){const j=idx?idx.getX(i+k):i+k;poly.push({x:pos.getX(j),y:pos.getY(j),z:pos.getZ(j),nx:normal.getX(j),ny:normal.getY(j),nz:normal.getZ(j)})}
  for(const plane of planes){
   const out=[];for(let j=0;j<poly.length;j++){
    const a=poly[j],b=poly[(j+1)%poly.length],da=distance(a,plane),db=distance(b,plane);
    if(da>=0)out.push(a);if((da>=0)!==(db>=0))out.push(interp(a,b,da/(da-db)));
   }poly=out;if(!poly.length)break;
  }
  if(poly.length<3)continue;
  const start=verts.length/3;
  for(const v of poly){const n=new THREE.Vector3(v.nx,v.ny,v.nz).normalize();verts.push(v.x+n.x*.075,v.y+n.y*.075,v.z+n.z*.075);norms.push(n.x,n.y,n.z)}
  for(let j=1;j<poly.length-1;j++)triangles.push(start,start+j,start+j+1);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(norms,3));g.setIndex(triangles);
 const fabric=new THREE.MeshStandardMaterial({color:0x746e5e,roughness:1,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 const garment=new THREE.Mesh(g,fabric);garment.position.y=floor;garment.castShadow=true;garment.receiveShadow=false;garment.name=part;
 return garment;
}
