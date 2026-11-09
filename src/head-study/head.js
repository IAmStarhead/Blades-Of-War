import * as THREE from 'three';

// Three original procedural studies. A continuous ring surface carries the
// forehead, nose, cheekbones and jaw; there are no attached facial primitives.
export const STUDIES = [
  { name: 'А — мягкий', cheek: .025, jaw: .00, nose: .18, brow: .025, chin: .02, back: 1.00 },
  { name: 'Б — выразительный', cheek: .055, jaw: .07, nose: .23, brow: .055, chin: .035, back: .98 },
  { name: 'В — угловатый', cheek: .075, jaw: .13, nose: .20, brow: .075, chin: .055, back: .94 }
];
const mix = (a,b,t) => a+(b-a)*t;
const gauss = (x, c, w) => Math.exp(-(((x-c)/w)**2));
function profile(y, female, style) {
  // y, half-width, frontal depth, rear depth. Silhouette is shared by all
  // facial features, rather than a sphere with parts stuck onto it.
  const p = [
    [-1.00,.10,.32,.15],[-.94,.27,.48,.21],[-.82,female?.40:.47,.66,.30],
    [-.68,female?.59:.67,.79,.42],[-.50,female?.72:.78,.78,.49],
    [-.28,.84,.84,.67],[0,.94,.86,.82],[.25,1,.83,.94],
    [.50,.98,.80,.98],[.72,.86,.72,.91],[.88,.65,.55,.71],[.97,.36,.31,.40],[1,.02,.02,.02]
  ];
  let i=0; while (i<p.length-2 && y>p[i+1][0]) i++;
  const t=Math.max(0,Math.min(1,(y-p[i][0])/(p[i+1][0]-p[i][0])));
  const a=p[i],b=p[i+1],prev=p[Math.max(0,i-1)],next=p[Math.min(p.length-1,i+2)];
  const interp = k => {const span=b[0]-a[0], t2=t*t,t3=t2*t;
    const m0=(b[k]-prev[k])/(b[0]-prev[0]),m1=(next[k]-a[k])/(next[0]-a[0]);
    return (2*t3-3*t2+1)*a[k]+(t3-2*t2+t)*span*m0+(-2*t3+3*t2)*b[k]+(t3-t2)*span*m1;};
  return [interp(1)+style.jaw*gauss(y,-.60,.25),interp(2),interp(3)*style.back];
}
function point(y, phi, female, style) {
  const [w,front,back]=profile(y,female,style), c=Math.cos(phi), s=Math.sin(phi);
  let x=s*w*(female?.77:.82), z=(c>=0?front:back)*c*.91;
  if(c>0) {
    const central=gauss(phi,0,.18);
    // Broad planes and a restrained sculpted nose are all in the same surface.
    z += style.nose*central*gauss(y,-.11,.24) + style.nose*.45*gauss(phi,0,.13)*gauss(y,-.25,.09);
    z += style.brow*(gauss(phi,.40,.22)+gauss(phi,-.40,.22))*gauss(y,.18,.11);
    z -= .045*(gauss(phi,.40,.16)+gauss(phi,-.40,.16))*gauss(y,.06,.09);
    z += style.cheek*(gauss(phi,.57,.23)+gauss(phi,-.57,.23))*gauss(y,-.22,.18);
    z += .035*gauss(phi,0,.30)*gauss(y,-.49,.13) + style.chin*gauss(phi,0,.34)*gauss(y,-.78,.12);
  }
  // Ear silhouette grows out of the side of the same mesh.
  const ear=gauss(Math.abs(phi),1.55,.14)*gauss(y,.00,.21);
  x += Math.sign(s)*ear*.12;
  return [x,y*1.18,z];
}
export function createHead(female, style) {
  const columns=64, rows=52, vertices=[], indices=[];
  for(let r=0;r<=rows;r++) for(let s=0;s<=columns;s++) vertices.push(...point(-1+2*r/rows,-Math.PI+2*Math.PI*s/columns,female,style));
  for(let r=0;r<rows;r++) for(let s=0;s<columns;s++) {
    const a=r*(columns+1)+s,b=a+columns+1; indices.push(a,a+1,b,b,a+1,b+1);
  }
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); geo.setIndex(indices); geo.computeVertexNormals();
  const group=new THREE.Group();
  const clay=new THREE.MeshStandardMaterial({color:0xc0a697,roughness:0.94});
  const mesh=new THREE.Mesh(geo,clay); group.add(mesh);
  // Thin curved graphic marks follow the face surface: no protruding eyeballs.
  function patch(y, phi, width, height, material, offset=.009) {
    const v=[],ix=[], n=16;
    for(let i=0;i<=n;i++) {
      const u=-1+2*i/n, h=Math.sqrt(Math.max(0,1-u*u))*height;
      for(const dy of [-h,h]) {const p=point(y+dy,phi+width*u,female,style);p[2]+=offset;v.push(...p);}
      if(i<n){const k=i*2;ix.push(k,k+1,k+2,k+1,k+3,k+2);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(ix);g.computeVertexNormals();group.add(new THREE.Mesh(g,material));
  }
  const dark=new THREE.MeshBasicMaterial({color:0x413632,side:THREE.DoubleSide});
  const eye=new THREE.MeshBasicMaterial({color:0xbab4a6,side:THREE.DoubleSide});
  const iris=new THREE.MeshBasicMaterial({color:0x474845,side:THREE.DoubleSide});
  for(const side of [-1,1]) {
    patch(.052,side*.40,.115,.035,dark,.013);
    patch(.053,side*.40,.100,.024,eye,.017);
    patch(.052,side*.40,.027,.023,iris,.021);
    patch(.16,side*.40,.125,.014,dark,.014);
  }
  patch(-.56,0,.16,.012,dark,.015);
  return group;
}
