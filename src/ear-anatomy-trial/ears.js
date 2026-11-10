import * as THREE from 'three';
// The ear is a compact shaped shell, attached to the head bone. Its front
// rim sinks into the side of the head; the outward/back portion remains
// visible from both front and side. No textures or original geometry edited.
export function addTrialEars(rig,female){
 const mat=new THREE.MeshLambertMaterial({color:0xe1c9ba,vertexColors:true,side:THREE.DoubleSide});
 const results=[];
 for(const side of [-1,1]){
  const n=32,positions=[],colors=[],indices=[],height=female?.0235:.0255,width=female?.0145:.016;
  const centerY=female?.085:.089,centerZ=-.012,base=female?.070:.076;
  // Outer skin, raised helix, shallow inner bowl and concha. Ring planes
  // follow the side of the head, with a recessed front attachment.
  const rings=[{r:1,x:0,c:1},{r:.86,x:.0022,c:1.0},{r:.72,x:.0015,c:.97},{r:.55,x:.0014,c:.94},{r:.38,x:.0012,c:.92},{r:.20,x:.0008,c:.93},{r:0,x:.001,c:.94}];
  for(const ring of rings)for(let j=0;j<n;j++){
   const t=2*Math.PI*j/n,sy=Math.sin(t),cz=Math.cos(t);
   const lobe=sy<0?1+.34*sy:1;
   const y=centerY+height*ring.r*sy;
   const z=centerZ+width*ring.r*cz*lobe-.003*ring.r*sy;
   const front=Math.max(0,cz),rear=Math.max(0,-cz);
   // A short inner fold runs through the back half and fades toward the
   // upper tip and lobe; the front lower bump suggests the tragus.
   const fold=.0025*Math.exp(-(((ring.r-.55)/.20)**2))*Math.exp(-(((cz+.45)/.7)**2))*(1-Math.pow(Math.abs(sy),3));
   const tragus=.0018*Math.exp(-(((ring.r-.55)/.24)**2))*Math.exp(-(((cz-.8)/.42)**2))*Math.exp(-(((sy+.35)/.48)**2));
   const x=base+ring.x+ring.r*(.008*rear-.004*front)+.004+fold+tragus;
   positions.push(side*x,y,z);colors.push(ring.c,ring.c*(.97),ring.c*.95);
  }
  for(let r=0;r<rings.length-1;r++)for(let j=0;j<n;j++){
   const a=r*n+j,b=r*n+(j+1)%n,c=(r+1)*n+j,d=(r+1)*n+(j+1)%n;
   indices.push(a,b,c,b,d,c);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
  const ear=new THREE.Mesh(g,mat);ear.name='trial-ear-'+(side<0?'left':'right');rig.headMesh.parent.add(ear);results.push(ear);
 }
 return results;
}
