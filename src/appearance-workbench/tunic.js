import * as THREE from 'three';
// Temporary loose fabric silhouette. Not a simulated or fitted garment.
export function createTunic(female){
 const rings=[[7.30,1.95,1.42],[8.75,1.90,1.38],[9.65,1.75,1.30],[10.8,1.62,1.25],[12.0,1.68,1.94],[12.55,1.72,1.94],[13.0,1.75,1.94],[13.7,1.78,1.25],[14.18,1.48,.90]];
 const n=24,v=[],ix=[];for(const [y,rx,rz] of rings)for(let i=0;i<n;i++){const a=i/n*Math.PI*2;v.push(Math.cos(a)*rx,y,Math.sin(a)*rz)}
 for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++){let a=j*n+i,b=j*n+(i+1)%n,c=a+n,d=b+n;ix.push(a,c,b,b,c,d)}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setIndex(ix);geo.computeVertexNormals();
 let mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x626b61,roughness:1,side:THREE.DoubleSide}));mesh.name='temporary-tunic';return mesh;
}
