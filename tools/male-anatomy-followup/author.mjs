// Reversible anatomical follow-up to the last delivered torso trial.
// No clip, rig, skin, topology, texture, face or existing morph target is edited.
import {Accessor,NodeIO,VertexLayout} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const OWN=path.join(ROOT,'work/male-anatomy-followup');
const SOURCE_SHA='79feb676a09aa801a557ee4a63b3887b7e627b79db3f899535e7fe864b09d81f';
const hash=b=>createHash('sha256').update(b).digest('hex');
if(process.argv.length!==4)throw Error('Usage: node author.mjs previous.glb trial.glb');
const input=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
if(input===output||(output.startsWith(ROOT+path.sep)&&!output.startsWith(OWN+path.sep)))throw Error('Refusing to overwrite a previous artifact');
const bytes=fs.readFileSync(input);if(hash(bytes)!==SOURCE_SHA)throw Error('Unexpected previous model');
const doc=await new NodeIO().readBinary(bytes),root=doc.getRoot(),buffer=root.listBuffers()[0];
const node=name=>{let a=root.listNodes().filter(n=>n.getName()===name);if(a.length!==1)throw Error('Expected one node '+name);return a[0]};
const body=node('head_2').getMesh().listPrimitives()[0],lastPosition=body.getAttribute('POSITION'),lastNormal=body.getAttribute('NORMAL'),oldPosition=body.getAttribute('_TORSO_OLD_POSITION'),oldNormal=body.getAttribute('_TORSO_OLD_NORMAL'),index=body.getIndices(),count=lastPosition.getCount();
if(root.listAnimations().length!==49||body.listTargets().length!==24||!oldPosition||!oldNormal||oldPosition.getCount()!==count)throw Error('Unexpected previous model structure');
if(body.getAttribute('_LAST_TORSO_POSITION')||body.getAttribute('_LAST_TORSO_NORMAL'))throw Error('Comparison attributes already exist');
// Keep the exact last-delivered surface, not the earlier gait-polish surface,
// for the HTML comparison toggle. The existing _TORSO_OLD_* attributes are kept.
body.setAttribute('_LAST_TORSO_POSITION',lastPosition);
body.setAttribute('_LAST_TORSO_NORMAL',lastNormal);
const packed=a=>{const out=new Float32Array(count*3);for(let i=0;i<count;i++)out.set(a.getElement(i,[]),3*i);return out};
const base=packed(oldPosition),normal=packed(oldNormal),previous=packed(lastPosition),previousNormal=packed(lastNormal),shaped=Float32Array.from(base);
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)},gauss=x=>Math.exp(-x*x);
for(let i=0;i<count;i++){
 const k=3*i,x=base[k],y=base[k+1],z=base[k+2],front=smooth(.035,.09,z)*(1-smooth(.15,.22,Math.abs(x)));
 // Starting from the prior, less projected chest avoids the added shelf. A
 // bounded few millimetres very gently softens the lower rib/chest transition.
 const chestGate=smooth(1.08,1.16,y)*(1-smooth(1.43,1.50,y));
 shaped[k+2]+=(-.004*gauss((y-1.31)/.075)+.002*gauss((y-1.40)/.09))*front*chestGate;
 // Small broad fill of the central rear transition, not an attempt to erase
 // the anatomical cleft; it falls to zero outside the upper pelvis.
 const rear=smooth(-.012,.04,-z),rearGate=smooth(.70,.76,y)*(1-smooth(.96,1.02,y));
 shaped[k+2]-=.010*gauss(x/.045)*gauss((y-.88)/.065)*rear*rearGate;
}
// Smooth only a central posterior patch, with welded coincident vertices. This
// is deliberately mild: four passes rather than the unselected stronger tests.
const welded=new Map(),vertices=[],ids=new Uint32Array(count);
for(let i=0;i<count;i++){
 const k=3*i,key=Array.from(base.subarray(k,k+3),v=>Math.round(v*1e6)).join(',');
 if(!welded.has(key)){welded.set(key,vertices.length);vertices.push({representative:i,neighbors:new Set()})}ids[i]=welded.get(key);
}
for(let i=0;i<index.getCount();i+=3){
 const tri=[0,1,2].map(k=>ids[index.getScalar(i+k)]);
 for(const [a,b] of [[0,1],[1,2],[2,0]])if(tri[a]!==tri[b]){vertices[tri[a]].neighbors.add(tri[b]);vertices[tri[b]].neighbors.add(tri[a])}
}
let verts=vertices.map(v=>new Vector3().fromArray(shaped,3*v.representative));
const mask=vertices.map(v=>{const [x,y,z]=Array.from(base.subarray(3*v.representative,3*v.representative+3));
 return smooth(.70,.765,y)*(1-smooth(.92,1.02,y))*smooth(-.025,.045,-z)*(1-smooth(.07,.135,Math.abs(x)))});
for(let pass=0;pass<4;pass++)verts=verts.map((point,i)=>{
 if(!vertices[i].neighbors.size||mask[i]<1e-9)return point.clone();
 const average=new Vector3();for(const neighbor of vertices[i].neighbors)average.add(verts[neighbor]);
 return point.clone().lerp(average.multiplyScalar(1/vertices[i].neighbors.size),.45*mask[i]);
});
for(let i=0;i<count;i++)if(mask[ids[i]]>0)verts[ids[i]].toArray(shaped,3*i);
// A full reversal of the previous rear sculpt made the existing centre fold
// darker and more pinched in several walking/running poses. Keep more of that
// previous surface near the centre, tapering it out toward the sides and waist.
// This is a visual compromise, not a claim that the fold has been repaired.
for(let i=0;i<count;i++){
 const k=3*i,x=base[k],y=base[k+1],z=base[k+2];
 const retain=(1-smooth(.97,1.07,y))*smooth(-.02,.04,-z)*(1-smooth(.045,.135,Math.abs(x)));
 for(let j=0;j<3;j++)shaped[k+j]+=(previous[k+j]-base[k+j])*retain;
}
// Restore unchanged outside this bounded region bit-for-bit. In particular no
// face, hands, calves or feet are sculpted; gait/polish correctives remain.
for(let i=0;i<count;i++)if(base[3*i+1]<=.70||base[3*i+1]>=1.50)shaped.set(previous.subarray(3*i,3*i+3),3*i);

// Transport the prior authored split normals by the area-weighted face-normal
// change. Weld only vertices whose authored normals match, preserving UV/hard
// normal splits rather than replacing the model's entire normal field.
const normalGroups=new Map(),normalIds=new Uint32Array(count);let groups=0;
for(let i=0;i<count;i++){
 const k=3*i,key=[...Array.from(base.subarray(k,k+3),v=>Math.round(v*1e6)),...Array.from(normal.subarray(k,k+3),v=>Math.round(v*100))].join(',');
 if(!normalGroups.has(key))normalGroups.set(key,groups++);normalIds[i]=normalGroups.get(key);
}
const oldFaces=new Float64Array(groups*3),newFaces=new Float64Array(groups*3);
for(let i=0;i<index.getCount();i+=3){
 const tri=[0,1,2].map(j=>index.getScalar(i+j)),a=tri.map(j=>new Vector3().fromArray(base,3*j)),b=tri.map(j=>new Vector3().fromArray(shaped,3*j));
 const u=a[1].clone().sub(a[0]).cross(a[2].clone().sub(a[0])),v=b[1].clone().sub(b[0]).cross(b[2].clone().sub(b[0]));
 for(const j of tri){const k=3*normalIds[j];oldFaces[k]+=u.x;oldFaces[k+1]+=u.y;oldFaces[k+2]+=u.z;newFaces[k]+=v.x;newFaces[k+1]+=v.y;newFaces[k+2]+=v.z}
}
const shapedNormal=new Float32Array(count*3);
for(let i=0;i<count;i++){
 const k=3*i,y=base[k+1];if(y<=.69||y>=1.50){shapedNormal.set(previousNormal.subarray(k,k+3),k);continue}
 const a=new Vector3().fromArray(oldFaces,3*normalIds[i]).normalize(),b=new Vector3().fromArray(newFaces,3*normalIds[i]).normalize();
 new Vector3().fromArray(normal,k).add(b.sub(a)).normalize().toArray(shapedNormal,k);
}
body.setAttribute('POSITION',doc.createAccessor('Anatomy_positions',buffer).setType(Accessor.Type.VEC3).setArray(shaped));
body.setAttribute('NORMAL',doc.createAccessor('Anatomy_normals',buffer).setType(Accessor.Type.VEC3).setArray(shapedNormal));
let moved=0,max=0,oldMax=0;
for(let i=0;i<count;i++){
 const k=3*i,d=Math.hypot(...[0,1,2].map(j=>shaped[k+j]-previous[k+j])),dOld=Math.hypot(...[0,1,2].map(j=>shaped[k+j]-base[k+j]));
 if(d>.001)moved++;max=Math.max(max,d);oldMax=Math.max(oldMax,dOld);
 if(![...shaped.subarray(k,k+3),...shapedNormal.subarray(k,k+3)].every(Number.isFinite))throw Error('Nonfinite geometry');
}
if(moved<400||max>.06||oldMax>.05)throw Error(`Unexpected sculpt ${moved}/${max}/${oldMax}`);
// Preserve intentionally empty existing glTF target names through NodeIO.
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
for(const n of json.nodes.filter(n=>n.mesh!==undefined)){
 const names=json.meshes[n.mesh].extras?.targetNames;if(!names)continue;
 const targets=node(n.name).getMesh().listPrimitives()[0].listTargets();if(targets.length!==names.length)throw Error('Morph target mismatch');names.forEach((name,i)=>targets[i].setName(name));
}
// The accumulated comparison attributes would yield a 268-byte interleaved
// stride, exceeding glTF's 252-byte limit. Separate buffer views are valid and
// preserve every attribute value without removing earlier comparison data.
const result=Buffer.from(await new NodeIO().setVertexLayout(VertexLayout.SEPARATE).writeBinary(doc));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result);
console.log(JSON.stringify({sourceSha256:SOURCE_SHA,outputSha256:hash(result),bytes:result.length,
 sculpt:{movedOver1mm:moved,maxFromLastMetres:max,maxFromGaitPolishMetres:oldMax,centralSmoothingPasses:4,centralRearPreviousRetention:1},
 animations:{total:root.listAnimations().length,changes:'none'},comparison:'exact latest positions and normals embedded; identical clips and skin'},null,2));
