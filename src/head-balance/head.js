import * as THREE from 'three';
import data from './heads.json';
// Same CC0 MakeHuman source, simplified independently to three mesh densities.
export const STUDIES = [
  {name:'А — упрощённый',level:'1600',width:1,jaw:1,depth:1},
  {name:'Б — средний',level:'2200',width:1,jaw:1,depth:1},
  {name:'В — подробнее',level:'3800',width:1,jaw:1,depth:1}
];
export function createHead(female, style) {
  const raw=data[style.level][female?'female':'male'];
  const scale=female ? 2.31 / (7.8665-5.72) : 1;
  const centerY=female ? (7.8665+5.72)/2 : (9.303+7)/2;
  const values=Float32Array.from(raw.positions);
  for(let i=0;i<values.length;i+=3) {
    const y=(values[i+1]-centerY)*scale;
    const jaw=Math.exp(-(((y+.52)/.39)**2));
    values[i]*=scale*style.width*(1+(style.jaw-1)*jaw);
    values[i+1]=y;
    values[i+2]=(values[i+2]-.45)*scale*style.depth;
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(values,3));geometry.setIndex(raw.indices);geometry.computeVertexNormals();
  const group=new THREE.Group(); const skin=new THREE.MeshStandardMaterial({color:0xbda79a,roughness:1});
  group.add(new THREE.Mesh(geometry,skin));
  // The small globes are embedded inside the socket; the lids are on the head mesh.
  const white=new THREE.MeshStandardMaterial({color:0xc9c4bb,roughness:1});
  const iris=new THREE.MeshStandardMaterial({color:0x434946,roughness:1});
  const pupil=new THREE.MeshStandardMaterial({color:0x202322,roughness:1});
  const eyey=female?6.7949:8.2164, eyex=female?.2885:.2931, front=female?1.28:1.48;
  for(const side of [-1,1]) {
    const x=side*eyex*scale*style.width,y=(eyey-centerY)*scale,z=(front-.45)*scale*style.depth;
    const globe=new THREE.Mesh(new THREE.SphereGeometry(.13*scale,20,12),white);globe.position.set(x,y,z-.17*scale);group.add(globe);
    const disk=new THREE.Mesh(new THREE.SphereGeometry(.045*scale,16,10),iris);disk.position.set(x,y,z-.061*scale);group.add(disk);
    const p=new THREE.Mesh(new THREE.SphereGeometry(.020*scale,12,8),pupil);p.position.set(x,y,z-.023*scale);group.add(p);
  }
  // Temporary flat eyebrow guides help evaluate expressions without skin textures.
  const eyebrow=new THREE.MeshBasicMaterial({color:0x695a53,side:THREE.DoubleSide});
  const ray=new THREE.Raycaster(); group.updateMatrixWorld(true);
  const face=group.children[0], eyeHeight=(eyey-centerY)*scale;
  for(const side of [-1,1]) {
    const verts=[],inds=[],steps=16;
    for(let i=0;i<=steps;i++) {
      const u=i/steps, x=side*(.16+.30*u)*scale;
      const y=eyeHeight+(.15+.025*Math.sin(Math.PI*u))*scale;
      const half=(.006+.012*Math.sin(Math.PI*u))*scale;
      for(const edge of [-1,1]) {
        ray.set(new THREE.Vector3(x,y+edge*half,4),new THREE.Vector3(0,0,-1));
        const hit=ray.intersectObject(face,false)[0];
        verts.push(x,y+edge*half,hit?hit.point.z+.008:1.0);
      }
      if(i<steps){const k=i*2;inds.push(k,k+1,k+2,k+1,k+3,k+2);}
    }
    const browGeometry=new THREE.BufferGeometry();browGeometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));browGeometry.setIndex(inds);
    group.add(new THREE.Mesh(browGeometry,eyebrow));
  }
  return group;
}
