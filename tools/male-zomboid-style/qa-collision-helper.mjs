// Browser-only helper, bundled temporarily by qa-collision.mjs. It deliberately
// selects hand/low-arm and lower-body surfaces, not all possible body regions.
import {BufferGeometry,BufferAttribute,Matrix4,Vector3,Box3} from 'three';
import {MeshBVH} from 'three-mesh-bvh';

window.initCollision=()=>{
  const d=window.demo,mesh=d.male.getObjectByName('head_2'),g=mesh.geometry,
        position=g.attributes.position,index=g.index;
  // Weld identical rest positions for connectivity so UV/normal splits do
  // not make a hand appear as many disconnected components.
  const byPosition=new Map(),vertices=[],originalToUnique=new Uint32Array(position.count);
  for(let i=0;i<position.count;i++){
    const key=[position.getX(i),position.getY(i),position.getZ(i)].join(',');
    let unique=byPosition.get(key);
    if(unique===undefined){
      unique=vertices.length;byPosition.set(key,unique);
      vertices.push({x:position.getX(i),y:position.getY(i),edges:[]});
    }
    originalToUnique[i]=unique;
  }
  for(let i=0;i<index.count;i+=3){
    const ids=[0,1,2].map(k=>originalToUnique[index.getX(i+k)]);
    for(const [a,b] of [[0,1],[1,2],[2,0]]){vertices[ids[a]].edges.push(ids[b]);vertices[ids[b]].edges.push(ids[a])}
  }
  // Cutting connectivity at y=1.30 in the bind pose separates both arms
  // from the trunk. Select only lower triangles (max rest y <= 1.10).
  const component=new Int32Array(vertices.length).fill(-1),components=[];
  for(let i=0;i<vertices.length;i++){
    if(vertices[i].y>1.30||component[i]>=0)continue;
    const id=components.length,stack=[i];component[i]=id;let sum=0;
    for(let j=0;j<stack.length;j++){
      const k=stack[j];sum+=vertices[k].x;
      for(const next of vertices[k].edges)if(vertices[next].y<=1.30&&component[next]<0){component[next]=id;stack.push(next)}
    }
    components.push({id,n:stack.length,x:sum/stack.length});
  }
  const major=components.filter(c=>c.n>500),left=major.find(c=>c.x>.2)?.id,
        right=major.find(c=>c.x<-.2)?.id,body=major.find(c=>Math.abs(c.x)<.2)?.id;
  if([left,right,body].some(x=>x===undefined))throw Error('Missing anatomical components '+JSON.stringify(major));
  const triangles={L:[],R:[],body:[]};
  for(let i=0;i<index.count;i+=3){
    const ids=[0,1,2].map(k=>index.getX(i+k)),groups=ids.map(j=>component[originalToUnique[j]]);
    if(Math.max(...ids.map(j=>position.getY(j)))>1.1)continue;
    if(groups.every(c=>c===body))triangles.body.push(...ids);
    else if(groups.every(c=>c===left))triangles.L.push(...ids);
    else if(groups.every(c=>c===right))triangles.R.push(...ids);
  }
  const selected=new Set(Object.values(triangles).flat()),array=new Float32Array(position.count*3),
        attribute=new BufferAttribute(array,3),geometries={};
  for(const [name,indices] of Object.entries(triangles)){
    const geo=new BufferGeometry();geo.setAttribute('position',attribute);geo.setIndex(indices);
    for(const i of selected){array[3*i]=position.getX(i);array[3*i+1]=position.getY(i);array[3*i+2]=position.getZ(i)}
    geo.boundsTree=new MeshBVH(geo,{maxLeafTris:8});geometries[name]=geo;
  }
  const identity=new Matrix4(),v=new Vector3();
  window.collisionStats={major,triangles:Object.fromEntries(Object.entries(triangles).map(([k,ids])=>[k,ids.length/3])),vertices:selected.size};
  window.testCollision=()=>{
    d.scene.updateMatrixWorld(true);mesh.skeleton.update();
    for(const i of selected){mesh.getVertexPosition(i,v);array[3*i]=v.x;array[3*i+1]=v.y;array[3*i+2]=v.z}
    // Refitting changes the BVH's bounds. Refresh the geometry bounding box
    // too: otherwise intersectsGeometry can incorrectly reject a whole pair.
    for(const geo of Object.values(geometries)){
      geo.boundsTree.refit();geo.boundingBox=geo.boundsTree.getBoundingBox(geo.boundingBox||new Box3());
    }
    const result={};
    for(const side of ['L','R']){
      const hit=geometries.body.boundsTree.intersectsGeometry(geometries[side],identity),a={},b={},
            closest=geometries.body.boundsTree.closestPointToGeometry(geometries[side],identity,a,b,0,.05);
      result[side]={hit,dist:closest?.distance??null,body:closest?.point?.toArray(),hand:b?.point?.toArray()};
    }
    return result;
  };
  return window.collisionStats;
};
