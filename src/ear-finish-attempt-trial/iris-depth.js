import * as THREE from 'three';
// Replace only the drawn iris with the surrounding sclera colour. The almond
// and eyelid strokes remain in the original head texture.
export function eraseIris(rig){const old=rig.headMesh.material.map,im=old.image,c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const w=c.width,h=c.height,img=ctx.getImageData(0,0,w,h),d=img.data,src=d.slice();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const X=x*512/w,Y=y*512/h,ex=X<256?222.7:289.3,dx=(X-ex)/10,dy=(Y-252)/4.7,q=dx*dx+dy*dy;if(q>=1||Y<249.3)continue;const f=Math.min(1,(1-q)*5),i=(y*w+x)*4;for(let k=0;k<3;k++){const c=[210,204,196][k];d[i+k]=src[i+k]*(1-f)+c*f}}
 ctx.putImageData(img,0,0);const map=old.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material=rig.headMesh.material.clone();rig.headMesh.material.map=map;}
// The iris is a fixed forward-facing spherical cap, partly occluded by the
// actual head. Not a camera-facing billboard; parented to the head mesh.
export function eyePatch(width,height,sphereRadius,offset,color,lit=false){const nx=48,ny=12,pos=[],ind=[];
 for(let i=0;i<=nx;i++){let x=width*(2*i/nx-1),yMax=height*Math.sqrt(Math.max(0,1-(x/width)**2));for(let j=0;j<=ny;j++){let y=yMax*(2*j/ny-1);let z=Math.sqrt(Math.max(0,sphereRadius*sphereRadius-x*x-y*y))+offset;pos.push(x,y,z);if(i<nx&&j<ny){let k=i*(ny+1)+j;ind.push(k,k+ny+1,k+1,k+1,k+ny+1,k+ny+2)}}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ind);g.computeVertexNormals();return new THREE.Mesh(g,lit?new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide}):new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));}
export function addIrisDepth(rig){eraseIris(rig);const radius=.0108;for(const side of [-1,1]){const group=new THREE.Group();group.name='trial-forward-iris';group.position.set(side*.0328,.1000,.0875);group.add(eyePatch(.0055,.0026,radius,.00008,0x34444e));group.add(eyePatch(.0028,.0023,radius,.00016,0x1d1c1b));rig.headMesh.add(group);}}
