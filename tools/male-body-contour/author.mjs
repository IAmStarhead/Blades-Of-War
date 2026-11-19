// Reversible, local surface-only follow-up to the delivered body-volume trial.
// Every animation, morph target, skin weight, bone and index is retained.
// The posterior relaxation is deliberately modest: the fold is not solved.
import {Accessor,NodeIO,VertexLayout} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const OWN=path.join(ROOT,'work/male-body-contour');
const SOURCE_SHA='1c94cb1c5fbecc5a1aa4f00683c90bb34ce2eb502ef504781d6faa00fd95c8c3';
const hash=b=>createHash('sha256').update(b).digest('hex');
if(process.argv.length!==4)throw Error('Usage: node author.mjs previous.glb trial.glb');
const input=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
if(input===output||(output.startsWith(ROOT+path.sep)&&!output.startsWith(OWN+path.sep)))throw Error('Refusing to overwrite another artifact');
const bytes=fs.readFileSync(input);if(hash(bytes)!==SOURCE_SHA)throw Error('Unexpected last delivered model');
const doc=await new NodeIO().readBinary(bytes),root=doc.getRoot(),buffer=root.listBuffers()[0];
const node=name=>{const xs=root.listNodes().filter(n=>n.getName()===name);if(xs.length!==1)throw Error('Expected one node '+name);return xs[0]};
const body=node('head_2').getMesh().listPrimitives()[0],p=body.getAttribute('POSITION'),n=body.getAttribute('NORMAL');
const previous=body.getAttribute('_VOLUME_LAST_POSITION'),indices=body.getIndices(),joints=body.getAttribute('JOINTS_0'),weights=body.getAttribute('WEIGHTS_0');
const skin=root.listSkins()[0],names=skin.listJoints().map(j=>j.getName()),count=p.getCount();
if(root.listSkins().length!==1||names.length!==22||root.listAnimations().length!==51||body.listTargets().length!==26||!previous||previous.getCount()!==count)throw Error('Unexpected model structure');
if(body.getAttribute('_CONTOUR_LAST_POSITION')||body.getAttribute('_CONTOUR_LAST_NORMAL'))throw Error('Comparison attributes already exist');
// The actual immediately preceding surface is embedded for exact comparison.
body.setAttribute('_CONTOUR_LAST_POSITION',p);body.setAttribute('_CONTOUR_LAST_NORMAL',n);
const packed=a=>{const result=new Float32Array(count*3);for(let i=0;i<count;i++)result.set(a.getElement(i,[]),3*i);return result};
const base=packed(p),normal=packed(n),beforeVolume=packed(previous),shaped=Float32Array.from(base);
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};

// Remove the previous trial's forward fill and half of its sideways waist
// widening. Then pull the front gently inward over a broad rib-to-pelvis band.
// The amplitude is a control parameter; actual vertex movement is measured.
// The torso-weight gate avoids changing arms and independently skinned legs.
const abdomenAmplitude=.020,waistRollback=.5;
for(let i=0;i<count;i++){
 const k=3*i,x=base[k],y=base[k+1],z=base[k+2],ax=Math.abs(x),js=joints.getElement(i,[]),ws=weights.getElement(i,[]);
 const torso=js.reduce((sum,j,q)=>sum+(/^Rig_(Hips|Spine|Chest)$/.test(names[j])?ws[q]:0),0);
 shaped[k]+=waistRollback*(beforeVolume[k]-base[k]);
 shaped[k+1]+=beforeVolume[k+1]-base[k+1];
 shaped[k+2]+=beforeVolume[k+2]-base[k+2];
 const vertical=smooth(.94,1.08,y)*(1-smooth(1.30,1.43,y));
 const front=vertical*smooth(.55,.90,torso)*smooth(.025,.085,z)*(1-smooth(.12,.21,ax));
 shaped[k+2]-=abdomenAmplitude*front;
}

// Relax only a small central posterior pelvic transition, on welded positions.
// This softens the abrupt notch in some views but is NOT a gluteal fold repair.
// The mask is measured in the original bind surface; no topology is added.
const welded=new Map(),vertices=[],ids=new Uint32Array(count);
for(let i=0;i<count;i++){
 const k=3*i,key=Array.from(base.subarray(k,k+3),v=>Math.round(v*1e6)).join(',');
 if(!welded.has(key)){welded.set(key,vertices.length);vertices.push({representative:i,neighbors:new Set()})}
 ids[i]=welded.get(key);
}
for(let i=0;i<indices.getCount();i+=3){
 const tri=[0,1,2].map(j=>ids[indices.getScalar(i+j)]);
 for(const [a,b] of [[0,1],[1,2],[2,0]])if(tri[a]!==tri[b]){vertices[tri[a]].neighbors.add(tri[b]);vertices[tri[b]].neighbors.add(tri[a])}
}
const masks=vertices.map(({representative:i})=>{
 const k=3*i,x=base[k],y=base[k+1],z=base[k+2];
 return smooth(.84,.89,y)*(1-smooth(1,1.06,y))*smooth(-.03,.04,-z)*(1-smooth(.055,.13,Math.abs(x)));
});
let points=vertices.map(({representative:i})=>new Vector3().fromArray(shaped,3*i));
const relaxationPasses=6;
for(let pass=0;pass<relaxationPasses;pass++)points=points.map((point,i)=>{
 if(!vertices[i].neighbors.size||masks[i]<1e-8)return point.clone();
 const mean=new Vector3();for(const neighbor of vertices[i].neighbors)mean.add(points[neighbor]);
 return point.clone().lerp(mean.multiplyScalar(1/vertices[i].neighbors.size),.45*masks[i]);
});
for(let i=0;i<count;i++)if(masks[ids[i]])points[ids[i]].toArray(shaped,3*i);

// Transport the existing smooth split normals using the change in the local
// area-weighted face normals. Keep original hard-normal/UV splits, and leave
// normals with unchanged neighborhoods bit-identical to the source.
const normalGroups=new Map(),normalIds=new Uint32Array(count);let groups=0;
for(let i=0;i<count;i++){
 const k=3*i,key=[...Array.from(base.subarray(k,k+3),v=>Math.round(v*1e6)),...Array.from(normal.subarray(k,k+3),v=>Math.round(v*100))].join(',');
 if(!normalGroups.has(key))normalGroups.set(key,groups++);normalIds[i]=normalGroups.get(key);
}
const oldFaces=new Float64Array(groups*3),newFaces=new Float64Array(groups*3);
for(let i=0;i<indices.getCount();i+=3){
 const tri=[0,1,2].map(j=>indices.getScalar(i+j));
 const a=tri.map(j=>new Vector3().fromArray(base,3*j)),b=tri.map(j=>new Vector3().fromArray(shaped,3*j));
 const u=a[1].clone().sub(a[0]).cross(a[2].clone().sub(a[0])),v=b[1].clone().sub(b[0]).cross(b[2].clone().sub(b[0]));
 for(const j of tri){const k=3*normalIds[j];oldFaces[k]+=u.x;oldFaces[k+1]+=u.y;oldFaces[k+2]+=u.z;newFaces[k]+=v.x;newFaces[k+1]+=v.y;newFaces[k+2]+=v.z}
}
const shapedNormal=Float32Array.from(normal);
for(let i=0;i<count;i++){
 const k=3*i,a=new Vector3().fromArray(oldFaces,3*normalIds[i]).normalize(),b=new Vector3().fromArray(newFaces,3*normalIds[i]).normalize();
 if(a.distanceToSquared(b)<1e-20)continue;
 new Vector3().fromArray(normal,k).add(b.sub(a)).normalize().toArray(shapedNormal,k);
}
let moved=0,max=0,abdomen=0,rear=0,minFrontZ=0,maxFrontZ=0;
for(let i=0;i<count;i++){
 const k=3*i,x=base[k],y=base[k+1],z=base[k+2],distance=Math.hypot(...[0,1,2].map(j=>shaped[k+j]-base[k+j]));
 if(distance>.001){moved++;if(y>=.94&&z>.03)abdomen++;if(y<1.06&&z<.02)rear++}
 max=Math.max(max,distance);
 if(y>1.08&&y<1.30&&z>.085&&Math.abs(x)<.10){const dz=shaped[k+2]-base[k+2];minFrontZ=Math.min(minFrontZ,dz);maxFrontZ=Math.max(maxFrontZ,dz)}
 if(![...shaped.subarray(k,k+3),...shapedNormal.subarray(k,k+3)].every(Number.isFinite))throw Error('Nonfinite geometry');
 if((y<=.84||y>=1.43)&&distance>1e-8)throw Error('Position changed outside bounded pelvis/abdomen '+i);
}
if(moved<400||moved>800||max>.035||abdomen<200||rear<70||minFrontZ>-.018||maxFrontZ>1e-7)throw Error(`Unexpected local shape ${moved}/${max}/${abdomen}/${rear}/${minFrontZ}/${maxFrontZ}`);
body.setAttribute('POSITION',doc.createAccessor('Contour_positions',buffer).setType(Accessor.Type.VEC3).setArray(shaped));
body.setAttribute('NORMAL',doc.createAccessor('Contour_normals',buffer).setType(Accessor.Type.VEC3).setArray(shapedNormal));

// Preserve intentionally blank inherited morph-target names through NodeIO.
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
for(const oldNode of json.nodes.filter(x=>x.mesh!==undefined)){
 const targetNames=json.meshes[oldNode.mesh].extras?.targetNames;if(!targetNames)continue;
 const targets=node(oldNode.name).getMesh().listPrimitives()[0].listTargets();if(targets.length!==targetNames.length)throw Error('Morph target count changed');
 targetNames.forEach((name,i)=>targets[i].setName(name));
}
// The inherited comparison attributes exceed the maximum interleaved stride.
const result=Buffer.from(await new NodeIO().setVertexLayout(VertexLayout.SEPARATE).writeBinary(doc));
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result);
console.log(JSON.stringify({sourceSha256:SOURCE_SHA,outputSha256:hash(result),bytes:result.length,
 sculpt:{movedOver1mm:moved,maxDisplacementMetres:max,abdomenVerticesOver1mm:abdomen,rearVerticesOver1mm:rear,
  abdomenAmplitudeMetres:abdomenAmplitude,previousWaistSideRollback:waistRollback,previousAbdomenForwardRollback:1,
  frontBandMinDeltaZMetres:minFrontZ,frontBandMaxDeltaZMetres:maxFrontZ,posteriorRelaxationPasses:relaxationPasses},
 animations:{count:root.listAnimations().length,changes:'none'},comparison:'exact last base positions and normals embedded; identical clips, targets and skin',
 limitation:'posterior fold remains; crouch and knees remain experimental'},null,2));
