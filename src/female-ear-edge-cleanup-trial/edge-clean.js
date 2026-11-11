// Trial-only removal of the shallow lower-front overlap, not a welded fix.
export function cleanLowerEdge(ears){
 for(const ear of ears){let g=ear.geometry,p=g.attributes.position,idx=g.index,side=ear.name.endsWith('left')?-1:1,keep=[],removed=0;
  for(let i=0;i<idx.count;i+=3){let a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2),avg=f=>(f(a)+f(b)+f(c))/3;
   let x=avg(j=>side*p.getX(j)),y=avg(j=>p.getY(j)),z=avg(j=>p.getZ(j));
   if(x<.0723&&y<.053&&z>.004){removed++;continue}keep.push(a,b,c);
  }g.setIndex(keep);ear.userData.lowerEdgeRemoved=removed;
 }
}
