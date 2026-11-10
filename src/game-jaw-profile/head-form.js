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
  // Separate jaw silhouettes while keeping the skull's overall height.
  x*=female ? 1+.09*forehead-.12*lower-.10*jaw : 1+.09*forehead+.055*lower+.10*jaw;
  if(cos>0){
   // Raise the upper male forehead forward, without moving the brow/eyes.
   if(!female)z+=.014*gauss(v-.72,.12)*Math.pow(cos,3);
   // Reduce the female chin projection rather than scaling down the skull.
   if(female){
    z-=.009*gauss(v-.19,.075)*Math.pow(cos,2);
    y+=.006*gauss(v-.15,.09)*Math.pow(cos,2);
   }
  }
  // Carve an underside that rises toward the jaw angle instead of hanging
  // as a round mass into the neck. Keep the center-front chin lower.
  const underside=gauss(v-.12,.11);
  const sideAndBack=1-Math.pow(Math.max(0,cos),3);
  y+=(female?.008:.012)*underside*sideAndBack;
  // A modest forward chin gives the underside room to turn back to the neck.
  z+=(female?.005:.010)*gauss(v-.16,.075)*Math.pow(Math.max(0,cos),4);
  if(female)z+=.0025*gauss(v-.325,.036)*gauss(phi,.28);
  // A less bulbous back and a modest, smoother lower jaw silhouette.
  if(cos<0)z*=1-.14*gauss(v-.39,.23);
  p.setXYZ(i,x,y,z);
 }
 // The former ear discs are omitted entirely from the trial; do not leave
 // floating or reversed surfaces while the ear anatomy is being reworked.
 const index=g.getIndex(),keep=[];
 for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);if(a<firstEar&&b<firstEar&&c<firstEar)keep.push(a,b,c)}
 g.setIndex(keep);
 p.needsUpdate=true;g.computeVertexNormals();return g;
}
