// Produce a separate lightweight GLB with a localized back-of-head normal
// correction. No positions, triangles, UVs, textures or other meshes change.
import {NodeIO} from '@gltf-transform/core';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ORIGINAL_SHA='450d660b03b284fdb4e3c9363a6211c02525311096d2cd9da69449e9f84a85b3';
const OPTIMIZED_SHA='ee4fee7388eaf3e77ba01061e11d9a569e6e8684ce349ab86981a9408b33b5c3';
const args=process.argv.slice(2);
if(args.length!==3)throw new Error('Usage: node fix.mjs ORIGINAL.glb OPTIMIZED.glb NEW.glb');
const [originalPath,optimizedPath,outputPath]=args.map(p=>path.resolve(p));
if(outputPath===originalPath||outputPath===optimizedPath)throw new Error('Refusing to overwrite an input model');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(sha(await fs.readFile(originalPath))!==ORIGINAL_SHA||sha(await fs.readFile(optimizedPath))!==OPTIMIZED_SHA)
 throw new Error('Inputs do not match the confirmed, unchanged original and optimized models');
const io=new NodeIO();
const original=await io.read(originalPath),copy=await io.read(optimizedPath);
const head=doc=>{
 const node=doc.getRoot().listNodes().find(n=>n.getName()==='head_1');
 const primitives=node?.getMesh()?.listPrimitives();
 if(!primitives||primitives.length!==1)throw new Error('Unexpected head layout');
 return primitives[0];
};
const source=head(original),target=head(copy);
const sourcePositions=source.getAttribute('POSITION'),sourceNormals=source.getAttribute('NORMAL');
const positions=target.getAttribute('POSITION'),normalAttribute=target.getAttribute('NORMAL');
if(sourcePositions.getCount()!==132760||positions.getCount()!==4883||target.getIndices().getCount()!==7898*3)
 throw new Error('Unexpected head topology');

// Smooth the original high-resolution surface normals locally across the
// existing sagittal transition. A regular spatial index is used for a compact
// Gaussian kernel. UV seam duplicates are sampled once, not weighted twice.
const sigma=0.007,radius=3*sigma,cellSize=radius,radius2=radius*radius;
const cells=new Map(),seen=new Set();
const cellKey=(x,y,z)=>`${x},${y},${z}`;
for(let i=0;i<sourcePositions.getCount();i++){
 const p=sourcePositions.getElement(i,[]), key=p.join(',');
 if(seen.has(key))continue;seen.add(key);
 const n=sourceNormals.getElement(i,[]),cx=Math.floor(p[0]/cellSize),cy=Math.floor(p[1]/cellSize),cz=Math.floor(p[2]/cellSize);
 const cell=cellKey(cx,cy,cz);if(!cells.has(cell))cells.set(cell,[]);cells.get(cell).push({p,n});
}
const originalNormals=normalAttribute.getArray(), corrected=new Float32Array(originalNormals);
const clamp01=x=>Math.max(0,Math.min(1,x));
let selected=0,changed=0,maxAngle=0,sumAngle=0;
for(let i=0;i<positions.getCount();i++){
 const [x,y,z]=positions.getElement(i,[]),n=normalAttribute.getElement(i,[]);
 // Back of the head only; do not touch the face, ears or neckline.
 if(Math.abs(x-0.0042)>=0.025||y<=1.605||z>=-0.045||n[2]>=-0.15)continue;
 selected++;
 const cx=Math.floor(x/cellSize),cy=Math.floor(y/cellSize),cz=Math.floor(z/cellSize);
 const sum=[0,0,0];let weights=0;
 for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
  for(const sample of cells.get(cellKey(cx+dx,cy+dy,cz+dz))||[]){
   const d2=(sample.p[0]-x)**2+(sample.p[1]-y)**2+(sample.p[2]-z)**2;
   if(d2>radius2)continue;const w=Math.exp(-d2/(2*sigma*sigma));weights+=w;
   for(let j=0;j<3;j++)sum[j]+=w*sample.n[j];
  }
 }
 if(!weights)throw new Error(`No high-resolution samples around vertex ${i}`);
 const meanLength=Math.hypot(...sum);if(!meanLength)throw new Error(`Degenerate normal at ${i}`);
 const mean=sum.map(v=>v/meanLength);
 let blend=(1+Math.cos(Math.PI*Math.abs(x-0.0042)/0.025))/2;
 blend*=clamp01((y-1.605)/0.02)*clamp01((-z-0.045)/0.025);
 if(blend<1e-8)continue;
 const result=n.map((v,j)=>v*(1-blend)+mean[j]*blend),length=Math.hypot(...result);
 if(!length)throw new Error(`Invalid corrected normal at ${i}`);
 const normalized=result.map(v=>v/length);
 for(let j=0;j<3;j++)corrected[3*i+j]=normalized[j];
 const oldLength=Math.hypot(...n),dot=normalized.reduce((s,v,j)=>s+v*n[j]/oldLength,0);
 const angle=Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI;
 if(angle>0.01){changed++;sumAngle+=angle;maxAngle=Math.max(maxAngle,angle)}
}
if(selected!==437||changed<300||maxAngle>6)throw new Error(`Unexpected adjustment: ${selected} selected, ${changed} changed, ${maxAngle}°`);
normalAttribute.setArray(corrected);
await fs.mkdir(path.dirname(outputPath),{recursive:true});
await io.write(outputPath,copy);
const out=await fs.readFile(outputPath);
console.log(JSON.stringify({sigma,selectedVertices:selected,verticesChangedOverPointZeroOneDegrees:changed,
 maximumNormalChangeDegrees:maxAngle,meanNormalChangeDegrees:sumAngle/changed,triangles:32354,
 sourceOriginalSha256:ORIGINAL_SHA,sourceOptimizedSha256:OPTIMIZED_SHA,fixedSha256:sha(out),bytes:out.length},null,2));
