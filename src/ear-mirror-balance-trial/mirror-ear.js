// Mirror the left ear's already-adjusted geometry before the root strips are
// constructed. Keep each target mesh attached to its existing head bone.
export function mirrorLeftEar(ears){
 const left=ears.find(e=>e.name.endsWith('left')),right=ears.find(e=>e.name.endsWith('right'));
 if(!left||!right)throw new Error('Expected left and right ears');
 const g=left.geometry.clone(),p=g.attributes.position,n=g.attributes.normal,idx=g.index;
 for(let i=0;i<p.count;i++){p.setX(i,-p.getX(i));n.setX(i,-n.getX(i))}
 for(let i=0;i<idx.count;i+=3){const a=idx.getX(i+1);idx.setX(i+1,idx.getX(i+2));idx.setX(i+2,a)}
 p.needsUpdate=true;n.needsUpdate=true;idx.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere();right.geometry.dispose();right.geometry=g;
 right.position.set(-left.position.x,left.position.y,left.position.z);
}
