// Experimental reshaping of the original UV-mapped game head. Only the copy
// passed in is cloned; input geometry, textures, skeleton, and game stay intact.
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const gauss=(x,w)=>Math.exp(-((x/w)**2));
export function makeHeadForm(source,female,kingdom='north'){
 const g=source.clone(),p=g.getAttribute('position'),uv=g.getAttribute('uv');
 const segments=64,rows=41,main=rows*(segments+1),firstEar=main+2;
 // This study targets the current original generator's known layout; fail
 // instead of silently damaging a different geometry if it changes later.
 if(p.count!==firstEar+2*(3*17+1))throw new Error('Unexpected original game head geometry layout');
 const radius=(female?.074:.081)*(kingdom==='eden'?.96:1.02),cy=female?.092:.096,scale=female?.92:1;
 for(let i=0;i<main;i++){
  const u=uv.getX(i),v=uv.getY(i),phi=(u-.5)*Math.PI*2,sign=Math.sign(Math.sin(phi)),cos=Math.cos(phi);
  let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  // Remove the old spherical side bump beneath the separate ear surface.
  const oldEar=gauss((Math.abs(phi)-1.55),.13)*gauss(v-.50,.08);
  x-=sign*oldEar*.011;
  // Broaden temples and the upper cranium, flatten the egg-like lower cheek;
  // keep the eye-level width and vertical extent of the original head.
  const forehead=gauss(v-.72,.14),lower=gauss(v-.31,.11),jaw=gauss(v-.20,.06);
  x*=1+.09*forehead-.065*lower+.045*jaw;
  // A less bulbous back and a modest, smoother lower jaw silhouette.
  if(cos<0)z*=1-.14*gauss(v-.39,.23);
  p.setXYZ(i,x,y,z);
 }
 // Replace the old convex ear discs with much thinner tapered auricles,
 // oriented along the side/back of the skull. Nested rings give limited
 // relief; no dark holes or fake ear textures are added.
 for(let sideIndex=0;sideIndex<2;sideIndex++){
  const side=sideIndex===0?-1:1,offset=firstEar+sideIndex*52;
  for(let ring=0;ring<3;ring++){
   const radial=[.34,.68,1][ring];
   for(let j=0;j<=16;j++){
    const a=2*Math.PI*j/16,c=Math.cos(a),s=Math.sin(a);
    const y=cy+scale*.024*radial*c;
    const z=.009+scale*.015*radial*s*(c<0?.68:1)+scale*.004*radial*c;
    const x=side*(radius*.97+.009+.008*radial*s+.003*(1-radial*radial));
    p.setXYZ(offset+ring*17+j,x,y,z);
   }
  }
  p.setXYZ(offset+51,side*(radius*.97+.012),cy,.009);
 }
 p.needsUpdate=true;g.computeVertexNormals();return g;
}
