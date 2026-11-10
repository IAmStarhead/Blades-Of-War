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
  // Work from the reference landmarks: broad, rounded chin pad in front,
  // jaw angle below the ear, and an underside sloping up toward the neck.
  const forehead=gauss(v-.72,.14),lower=gauss(v-.31,.12);
  x*=female ? 1+.08*forehead-.05*lower : 1+.08*forehead+.04*lower;
  if(!female && cos>0)z+=.014*gauss(v-.72,.12)*Math.pow(cos,3);
  // The jaw's height is defined across its length rather than lifting the
  // sides into a V. Forward chin extends over the neck, with a rounded edge.
  const bottom=(1-smooth((v-.05)/.17))*smooth(v/.10);
  const chin=gauss(phi,.72);
  y+=bottom*(female?.010:.009);
  y+=bottom*(1-chin)*(female?.011:.013);
  z+=bottom*chin*(female?.016:.021);
  // Project the area beneath the lower lip gently, tying it to the chin.
  z+=(female?.005:.007)*gauss(v-.235,.095)*gauss(phi,.58);
  // Narrow the back/lower mass; the upper skull and head height are retained.
  if(cos<0)z*=1-.25*gauss(v-.32,.24);
  // Move the lower part of the side toward the jaw angle under the ear.
  if(cos<0.4) y+=(female?.004:.006)*gauss(v-.20,.10)*smooth((.4-cos)/.8);
  if(female)z+=.003*gauss(v-.325,.04)*gauss(phi,.28);
  p.setXYZ(i,x,y,z);
 }
 // The former ear discs are omitted entirely from the trial; do not leave
 // floating or reversed surfaces while the ear anatomy is being reworked.
 const index=g.getIndex(),keep=[];
 for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);if(a<firstEar&&b<firstEar&&c<firstEar)keep.push(a,b,c)}
 g.setIndex(keep);
 p.needsUpdate=true;g.computeVertexNormals();return g;
}
