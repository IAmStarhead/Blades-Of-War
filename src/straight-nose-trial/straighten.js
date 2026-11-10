// Straighten the centreline between the nose root and tip, in actual Y/Z
// coordinates. Endpoints come from the previous central candidate, so the
// forehead and tip stay put. Smooth falloff confines changes to the bridge.
export function straightenBridge(g){
 const p=g.attributes.position,uv=g.attributes.uv;
 function centre(v){
  let best=-1,error=Infinity;
  for(let i=0;i<p.count;i++){
   const d=Math.abs(uv.getX(i)-.5)+Math.abs(uv.getY(i)-v);
   if(d<error){best=i;error=d;}
  }
  if(error>1e-5)throw Error('Nose bridge control point not found');
  return {y:p.getY(best),z:p.getZ(best)};
 }
 const low=centre(.425),high=centre(.525);
 const gauss=(x,w)=>Math.exp(-((x/w)**2));
 // All vertex deltas are measured from the unmodified centreline at that
 // height before writing, ensuring left/right symmetry and a straight ridge.
 const centres=[];for(let v=.425;v<=.525001;v+=.0125)centres.push(centre(v));
 for(let i=0;i<p.count;i++){
  const phi=(uv.getX(i)-.5)*2*Math.PI,v=uv.getY(i);
  if(v<.425-1e-6||v>.525+1e-6||Math.abs(phi)>.65)continue;
  const t=Math.max(0,Math.min(8,(v-.425)/.0125)),j=Math.min(7,Math.floor(t)),f=t-j;
  const y=centres[j].y*(1-f)+centres[j+1].y*f,z=centres[j].z*(1-f)+centres[j+1].z*f;
  const line=low.z+(high.z-low.z)*(y-low.y)/(high.y-low.y);
  p.setZ(i,p.getZ(i)+(line-z)*gauss(phi,.17));
 }
 p.needsUpdate=true;const old=g.attributes.normal.clone();g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){
  const phi=(uv.getX(i)-.5)*2*Math.PI,v=uv.getY(i),w=gauss(phi,.27)*gauss(v-.475,.09);
  let x=old.getX(i)*(1-w)+n.getX(i)*w,y=old.getY(i)*(1-w)+n.getY(i)*w,z=old.getZ(i)*(1-w)+n.getZ(i)*w;
  const len=Math.hypot(x,y,z)||1;n.setXYZ(i,x/len,y/len,z/len);
 }
 n.needsUpdate=true;return g;
}
