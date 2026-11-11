// Remove the low, rear source-scalp flap on the private male ear only.
// This is face deletion, not a topological weld; may create an open boundary.
export function trimRearFlap(ears,extra=false,more=false){
 for(const ear of ears){const g=ear.geometry,p=g.attributes.position,idx=g.index,side=ear.name.endsWith('left')?-1:1,keep=[];let removed=0;
  for(let i=0;i<idx.count;i+=3){const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2),avg=f=>(f(a)+f(b)+f(c))/3;
   const x=avg(j=>side*p.getX(j)),y=avg(j=>p.getY(j)),z=avg(j=>p.getZ(j));
   if(x<(more?.086:(extra?.082:.078))&&y<(more?.081:(extra?.079:.077))&&z<(more?-.017:(extra?-.019:-.021))){removed++;continue}keep.push(a,b,c);
  }g.setIndex(keep);ear.userData.rearFlapRemoved=removed;
 }
}
