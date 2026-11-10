// Isolated geometry construction; the original head and game are untouched.
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const gauss=(x,w)=>Math.exp(-((x/w)**2));
export function makeHeadForm(source,female,kingdom='north'){
 const g=source.clone(),p=g.attributes.position,uv=g.attributes.uv;
 const segs=64, main=41*65,firstEar=main+2;
 if(p.count!==firstEar+104)throw Error('unexpected head layout');
 for(let i=0;i<main;i++){
  const v=uv.getY(i),phi=(uv.getX(i)-.5)*2*Math.PI,c=Math.cos(phi),sn=Math.sin(phi);
  let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  x-=Math.sign(sn)*.011*gauss(Math.abs(phi)-1.55,.13)*gauss(v-.5,.08);
  const forehead=gauss(v-.72,.14);x*=1+.09*forehead;
  if(!female && c>0)z+=.014*forehead*Math.pow(c,3);
  if(c<0)z*=1-.28*gauss(v-.37,.23);
  // The lower surface is rebuilt as a jaw rim and an underside flowing back
  // into a neck opening, instead of a pointed cap at the bottom of a sphere.
  if(v<.30){
    let blend=1-smooth((v-.20)/.10);
    const front=Math.max(0,c),back=Math.max(0,-c);
    const jawX=(female?.052:.060)*sn;
    const jawZ=(female?.096:.108)*Math.pow(front,.72)-(female?.037:.041)*back;
    const jawY=(female?-.010:-.012)+(female?.008:.010)*(1-Math.pow(front,2));
    let low=smooth(v/.26);
    const neckX=(female?.025:.029)*sn;
    const neckZ=(female?.020:.023)*c-.014;
    const neckY=female?-.045:-.045;
    const targetX=neckX+(jawX-neckX)*low;
    const targetY=neckY+(v/.26)*.052 + .012*(1-Math.pow(front,2))*low;
    const targetZ=neckZ+(jawZ-neckZ)*low;
    x=x*(1-blend)+targetX*blend;y=y*(1-blend)+targetY*blend;z=z*(1-blend)+targetZ*blend;
  }
  if(female && c>0)z+=.003*gauss(v-.325,.04)*gauss(phi,.28);
  p.setXYZ(i,x,y,z);
 }
 // Keep the neck opening, remove old bottom cap and ear disks. The mesh now
 // overlaps the existing body neck; it is not a welded animated connection.
 const index=g.getIndex(),keep=[];for(let i=0;i<index.count;i+=3){let a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);if(a<main&&b<main&&c<main)keep.push(a,b,c);else if(a===main+1||b===main+1||c===main+1)keep.push(a,b,c)}
 g.setIndex(keep);p.needsUpdate=true;g.computeVertexNormals();return g;
}
