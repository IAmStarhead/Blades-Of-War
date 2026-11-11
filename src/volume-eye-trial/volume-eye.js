import * as THREE from 'three';
// Clear the drawn eyeball while retaining the dark upper lid and the eyebrow.
function eraseEyeballs(rig){const old=rig.headMesh.material.map,im=old.image,c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const w=c.width,h=c.height,img=ctx.getImageData(0,0,w,h),d=img.data,src=d.slice();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const X=x*512/w,Y=y*512/h,ex=X<256?222.7:289.3,dx=(X-ex)/16,dy=(Y-252)/6;
  if(dx*dx+dy*dy>=1)continue;const f=Math.min(1,(1-dx*dx-dy*dy)*4),i=(y*w+x)*4;
  // Preserve upper lash strokes, not iris pixels.
  if(Y<249 && (src[i]+src[i+1]+src[i+2])<220)continue;
  let ref=(Math.round(264*h/512)*w+x)*4;for(let k=0;k<3;k++)d[i+k]=src[i+k]*(1-f)+src[ref+k]*f;
 }
 ctx.putImageData(img,0,0);let map=old.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material=rig.headMesh.material.clone();rig.headMesh.material.map=map;
}
// The iris is a fixed forward-facing spherical cap, partly occluded by the
// actual head. Not a camera-facing billboard; parented to the head mesh.
export function eyePatch(width,height,sphereRadius,offset,color,lit=false){const nx=48,ny=12,pos=[],ind=[];
 for(let i=0;i<=nx;i++){let x=width*(2*i/nx-1),yMax=height*Math.sqrt(Math.max(0,1-(x/width)**2));for(let j=0;j<=ny;j++){let y=yMax*(2*j/ny-1);let z=Math.sqrt(Math.max(0,sphereRadius*sphereRadius-x*x-y*y))+offset;pos.push(x,y,z);if(i<nx&&j<ny){let k=i*(ny+1)+j;ind.push(k,k+ny+1,k+1,k+1,k+ny+1,k+ny+2)}}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ind);g.computeVertexNormals();return new THREE.Mesh(g,lit?new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide}):new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));}
export function addVolumeEyes(rig){eraseEyeballs(rig);const radius=.0108;for(const side of [-1,1]){const group=new THREE.Group();group.name='trial-forward-eye';group.position.set(side*.0328,.1005,.0875);group.add(eyePatch(.0105,.0032,radius,0,0xc9c6ba,true));group.add(eyePatch(.005,.0030,radius,.00008,0x384f5e));group.add(eyePatch(.0025,.0023,radius,.00016,0x1d1c1b));rig.headMesh.add(group);}}
