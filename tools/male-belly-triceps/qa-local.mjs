// Sample actual deformed vertices, selected LBS blends and adjacent triangles.
// These are local/discrete proxies, not proof of anatomical beauty or watertightness.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const output=path.resolve(process.argv[2]||path.join(root,'work/male-belly-triceps'));
const errors=[];
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:900}});
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||(m.type()==='warn'&&m.text().startsWith('THREE.')))errors.push(m.text())});
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external '+r.url());r.abort()}});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load',timeout:120_000});
 await page.waitForFunction('window.ready===true',{timeout:120_000});
 const result=await page.evaluate(()=>{
  const d=demo;d.setManual(true);const mesh=d.male.getObjectByName('head_2'),g=mesh.geometry,p=g.attributes.position,
   joint=g.attributes.skinIndex,weight=g.attributes.skinWeight,names=mesh.skeleton.bones.map(b=>b.name),v=d.camera.position.clone(),q=d.camera.quaternion.clone();
  const sumWeight=(i,which)=>{let w=0;for(let k=0;k<4;k++)if(which.includes(names[joint.getComponent(i,k)]))w+=weight.getComponent(i,k);return w};
  const groups={front:[]};for(const y of [.98,1.02,1.06,1.10])for(const side of ['front','back'])groups[`${y}/${side}`]=[];
  for(const side of ['L','R'])for(const n of ['triceps','elbow','upper'])groups[n+'/'+side]=[];
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i),torso=sumWeight(i,['Rig_Hips','Rig_Spine']);
   if(y>.94&&y<1.10&&Math.abs(x)<.11&&z>.03)groups.front.push(i);
   for(const h of [.98,1.02,1.06,1.10])if(Math.abs(y-h)<.018&&torso>.95){if(z>.03)groups[`${h}/front`].push(i);if(z<-.03)groups[`${h}/back`].push(i)}
   for(const side of ['L','R']){
    const arm=sumWeight(i,['Rig_UpperArm_'+side,'Rig_Forearm_'+side,'Rig_Shoulder_'+side]);
    if(arm>.8&&y>1.21&&y<1.30&&z<-.035)groups['triceps/'+side].push(i);
    if(arm>.8&&Math.abs(y-1.18)<.015)groups['elbow/'+side].push(i);
    if(arm>.8&&Math.abs(y-1.26)<.015)groups['upper/'+side].push(i);
   }
  }
  const counts=Object.fromEntries(Object.entries(groups).map(([n,ids])=>[n,ids.length]));
  const stats=()=>({min:Infinity,max:-Infinity,sum:0,count:0});
  const add=(s,x)=>{s.min=Math.min(s.min,x);s.max=Math.max(s.max,x);s.sum+=x;s.count++};
  const finish=s=>({min:s.min,mean:s.sum/s.count,max:s.max,range:s.max-s.min,count:s.count});
  const det3=m=>m[0]*(m[4]*m[8]-m[5]*m[7])-m[3]*(m[1]*m[8]-m[2]*m[7])+m[6]*(m[1]*m[5]-m[2]*m[4]);
  function sample(){
   d.scene.updateMatrixWorld(true);mesh.skeleton.update();const points={};
   for(const [name,ids] of Object.entries(groups))points[name]=ids.map(i=>mesh.getVertexPosition(i,v).clone().applyMatrix4(mesh.matrixWorld).toArray());
   const bones=mesh.skeleton.bones.map(b=>{const t=b.getWorldPosition(v).toArray();b.getWorldQuaternion(q);return [...t,...q.toArray()]});
   const directions={};for(const side of ['L','R']){d.male.getObjectByName('Rig_UpperArm_'+side).getWorldQuaternion(q);directions[side]=v.set(0,0,-1).applyQuaternion(q).toArray()}
   const determinants={};for(const part of ['elbow','upper'])for(const side of ['L','R']){
    const a=groups[part+'/'+side].map(i=>{const m=Array(9).fill(0),mat=mesh.skeleton.boneMatrices;
     for(let k=0;k<4;k++){const j=joint.getComponent(i,k)*16,w=weight.getComponent(i,k);for(let c=0;c<3;c++)for(let r=0;r<3;r++)m[c*3+r]+=w*mat[j+c*4+r]}
     return det3(m)}).sort((x,y)=>x-y);determinants[part+'/'+side]=a[Math.floor(a.length*.1)];
   }
   return {points,bones,directions,determinants};
  }
  const movement={},runArm={L:stats(),R:stats()},projection={L:stats(),R:stats()},det={};let maxBone=0;
  for(const part of ['elbow','upper'])for(const side of ['L','R'])det[part+'/'+side]=stats();
  for(const mode of ['walk','run']){
   movement[mode]={before:{},after:{}};for(const variant of ['before','after'])for(const n of ['front',...Object.keys(groups).filter(n=>n.includes('/front')||n.includes('/back'))])movement[mode][variant][n]=stats();
   d.reset();d.setMode(mode);d.setPlaying(false);
   for(let f=0;f<240;f++){
    d.setVariant('before');d.setPhase(f/240);const old=sample();d.setVariant('after');d.setPhase(f/240);const now=sample();
    for(let i=0;i<old.bones.length;i++)for(let k=0;k<7;k++)maxBone=Math.max(maxBone,Math.abs(old.bones[i][k]-now.bones[i][k]));
    for(const [variant,snapshot] of [['before',old],['after',now]])for(const name of Object.keys(movement[mode][variant])){
     const a=snapshot.points[name];add(movement[mode][variant][name],a.reduce((s,x)=>s+x[0],0)/a.length);
    }
    if(mode==='run'){
     for(const key of Object.keys(det))add(det[key],old.determinants[key]);
     for(const side of ['L','R'])for(let i=0;i<groups['triceps/'+side].length;i++){
      const a=old.points['triceps/'+side][i],b=now.points['triceps/'+side][i],delta=b.map((x,k)=>x-a[k]);
      add(runArm[side],Math.hypot(...delta));add(projection[side],delta.reduce((s,x,k)=>s+x*old.directions[side][k],0));
     }
    }
   }
   for(const variant of ['before','after'])for(const name of Object.keys(movement[mode][variant]))movement[mode][variant][name]=finish(movement[mode][variant][name]);
  }
  // Check all body vertices at a smaller set of phases against the before
  // pose. New positional changes should not escape their intended regions.
  const localized={walk:0,run:0};
  for(const mode of ['walk','run']){
   d.reset();d.setMode(mode);d.setPlaying(false);
   for(let f=0;f<16;f++){
    d.setVariant('before');d.setPhase(f/16);d.scene.updateMatrixWorld(true);mesh.skeleton.update();const before=new Float64Array(p.count*3);
    for(let i=0;i<p.count;i++){mesh.getVertexPosition(i,v);v.toArray(before,3*i)}
    d.setVariant('after');d.setPhase(f/16);d.scene.updateMatrixWorld(true);mesh.skeleton.update();
    for(let i=0;i<p.count;i++){
     const y=p.getY(i),x=Math.abs(p.getX(i)),outside=mode==='walk'?(y<=.87||y>=1.22):(y<=1.02||y>=1.49||x<=.13);
     if(outside){mesh.getVertexPosition(i,v);localized[mode]=Math.max(localized[mode],Math.hypot(v.x-before[3*i],v.y-before[3*i+1],v.z-before[3*i+2]))}
    }
   }
  }
  // Compare normals of triangles incident to a changed vertex in old/new poses.
  // Ignore already-degenerate old triangles; count any newly reversed ones.
  const triangleStats={};
  for(const mode of ['walk','run']){
   const targets=mode==='walk'?g.morphAttributes.position.slice(6,9):g.morphAttributes.position.slice(9,10),indices=g.index,
    triangles=[],ids=new Set();
   for(let t=0;t<indices.count;t+=3){const tri=[indices.getX(t),indices.getX(t+1),indices.getX(t+2)];
    if(tri.some(i=>targets.some(a=>Math.hypot(a.getX(i),a.getY(i),a.getZ(i))>1e-7))){triangles.push(tri);tri.forEach(i=>ids.add(i))}}
   const selected=[...ids],oldArray=new Float64Array(p.count*3),newArray=new Float64Array(p.count*3);let checked=0,ignored=0,reversed=0,minDot=1,minAreaRatio=Infinity,maxAreaRatio=0;
   function cross(a,b,c,arr){const x=arr[3*b]-arr[3*a],y=arr[3*b+1]-arr[3*a+1],z=arr[3*b+2]-arr[3*a+2],X=arr[3*c]-arr[3*a],Y=arr[3*c+1]-arr[3*a+1],Z=arr[3*c+2]-arr[3*a+2];return [y*Z-z*Y,z*X-x*Z,x*Y-y*X]}
   d.reset();d.setMode(mode);d.setPlaying(false);
   for(let f=0;f<48;f++){
    for(const [variant,arr] of [['before',oldArray],['after',newArray]]){d.setVariant(variant);d.setPhase(f/48);d.scene.updateMatrixWorld(true);mesh.skeleton.update();for(const i of selected){mesh.getVertexPosition(i,v);v.toArray(arr,3*i)}}
    for(const [a,b,c] of triangles){const A=cross(a,b,c,oldArray),B=cross(a,b,c,newArray),al=Math.hypot(...A),bl=Math.hypot(...B);if(al<1e-9){ignored++;continue}
     checked++;const cosine=(A[0]*B[0]+A[1]*B[1]+A[2]*B[2])/(al*bl);if(cosine<=0)reversed++;minDot=Math.min(minDot,cosine);minAreaRatio=Math.min(minAreaRatio,bl/al);maxAreaRatio=Math.max(maxAreaRatio,bl/al);
    }
   }
   triangleStats[mode]={triangles:triangles.length,vertices:selected.length,checked,ignored,reversed,minDot,minAreaRatio,maxAreaRatio};
  }
  return {counts,movement,runArm:Object.fromEntries(Object.entries(runArm).map(([k,s])=>[k,finish(s)])),
   projection:Object.fromEntries(Object.entries(projection).map(([k,s])=>[k,finish(s)])),
   determinants:Object.fromEntries(Object.entries(det).map(([k,s])=>[k,finish(s)])),maxBone,localized,triangleStats};
 });
 for(const [name,count] of Object.entries(result.counts))assert.ok(count>=10,`${name} has insufficient samples: ${count}`);
 const front=result.movement.walk;assert.ok(front.before.front.range>.02&&front.after.front.range<.005,'front abdomen did not stabilize');
 for(const h of [.98,1.02,1.06,1.10])for(const side of ['front','back']){
  const name=`${h}/${side}`,a=front.before[name].range,b=front.after[name].range;
  assert.ok(b<a*.4,`${name} still has high lateral centroid movement: ${a}/${b}`);
 }
 for(const side of ['L','R']){
  const arm=result.runArm[side],projection=result.projection[side];
  assert.ok(arm.mean>.003&&arm.mean<.008&&arm.max<.008,`${side} unexpected posterior correction`);
  assert.ok(projection.mean>.002,`${side} does not expand mostly to the rear`);
  assert.ok(result.determinants['elbow/'+side].mean<result.determinants['upper/'+side].mean-.15,`${side} diagnostic does not distinguish elbow and upper arm`);
 }
 assert.ok(result.maxBone<1e-7,`skeletal motion changed: ${result.maxBone}`);
 assert.ok(result.localized.walk<1e-6&&result.localized.run<1e-6,`positional changes escaped selected regions: ${JSON.stringify(result.localized)}`);
 for(const [mode,s] of Object.entries(result.triangleStats)){
  assert.ok(s.checked>1000&&s.reversed===0,`${mode} selected triangle orientation reversal: ${JSON.stringify(s)}`);
 }
 assert.deepEqual(errors,[],errors.join('\n'));
 console.log('PASS: sampled groups and 240-phase abdomen centroid ranges '+JSON.stringify({counts:result.counts,walk:result.movement.walk}));
 console.log('PASS: run posterior correction (metres) and projection onto upper-arm rear axis '+JSON.stringify({displacement:result.runArm,projection:result.projection}));
 console.log('PASS: 10th-percentile LBS determinant per sampled arm band '+JSON.stringify(result.determinants));
 console.log('PASS: before/after skeleton and position confinement '+JSON.stringify({maxBoneComponent:result.maxBone,localized:result.localized}));
 console.log('PASS: selected incident triangles at 48 phases (non-degenerate comparisons) '+JSON.stringify(result.triangleStats));
 console.log('NOTE: these vertex groups, determinants and discrete triangle checks do not establish whole-muscle volume or prove natural motion.');
}catch(error){console.error(error);process.exitCode=1}finally{await browser.close()}
