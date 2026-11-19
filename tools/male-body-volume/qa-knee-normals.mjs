// Regression for the posed-space knee-normal fit in the actual offline viewer.
// The target is the change in area-weighted triangle normals transported onto
// the original authored normal, not a universal anatomical quality metric.
// Only the chosen finite poses and changed knee-region vertices are measured.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(root,'work/male-body-volume'));
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:180000});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(output,'index.html')).href);await page.waitForFunction('window.ready===true',{timeout:120000});
 const result=await page.evaluate(()=>{
  const d=demo;d.setManual(true);const m=d.male.getObjectByName('head_2'),g=m.geometry,p=g.attributes.position,n=g.attributes.normal,idx=g.index,J=g.attributes.skinIndex,W=g.attributes.skinWeight,N=p.count;
  const V=d.camera.position.constructor,Mat=m.matrix.constructor,M3=m.normalMatrix.constructor;
  const base=Float32Array.from({length:N*3},(_,j)=>p.getComponent(Math.floor(j/3),j%3)),normal=Float32Array.from({length:N*3},(_,j)=>n.getComponent(Math.floor(j/3),j%3));
  const groups=new Map(),id=new Int32Array(N);
  for(let i=0;i<N;i++){const k=3*i,key=[...base.slice(k,k+3)].map(x=>Math.round(x*1e6)).concat([...normal.slice(k,k+3)].map(x=>Math.round(x*100))).join(',');if(!groups.has(key))groups.set(key,groups.size);id[i]=groups.get(key)}
  const results={steady:{poses:0,count:0,without:0,with:0,maxWith:0},transition:{poses:0,count:0,without:0,with:0,maxWith:0}};
  function sample(kind){
   d.scene.updateMatrixWorld(true);m.skeleton.update();const values=m.morphTargetInfluences.slice(24);
   m.morphTargetInfluences[24]=m.morphTargetInfluences[25]=0;const P0=Array.from({length:N},(_,i)=>m.getVertexPosition(i,new V()));
   m.morphTargetInfluences[24]=values[0];m.morphTargetInfluences[25]=values[1];const P1=Array.from({length:N},(_,i)=>m.getVertexPosition(i,new V()));
   const G0=Array.from({length:groups.size},()=>new V()),G1=Array.from({length:groups.size},()=>new V());
   for(let i=0;i<idx.count;i+=3){
    const tri=[0,1,2].map(j=>idx.getX(i+j)),u=P0[tri[1]].clone().sub(P0[tri[0]]).cross(P0[tri[2]].clone().sub(P0[tri[0]])),v=P1[tri[1]].clone().sub(P1[tri[0]]).cross(P1[tri[2]].clone().sub(P1[tri[0]]));
    for(const j of tri){G0[id[j]].add(u);G1[id[j]].add(v)}
   }
   const result=results[kind];result.poses++;
   for(let i=0;i<N;i++){
    const k=3*i,y=base[k+1];if(y<.16||y>.78)continue;
    const old=G0[id[i]].clone().normalize(),fresh=G1[id[i]].clone().normalize();if(old.distanceToSquared(fresh)<.0001)continue;
    const blend=new Mat();blend.elements.fill(0);for(let j=0;j<4;j++){const w=W.getComponent(i,j),bone=J.getComponent(i,j);if(w)for(let q=0;q<16;q++)blend.elements[q]+=w*m.skeleton.boneMatrices[16*bone+q]}
    blend.premultiply(m.bindMatrixInverse).multiply(m.bindMatrix);const M=new M3().setFromMatrix4(blend);if(Math.abs(M.determinant())<.06)throw Error('Degenerate skin blend');
    const rest=new V().fromArray(normal,k);for(let j=0;j<24;j++){const w=m.morphTargetInfluences[j]||0,a=g.morphAttributes.normal[j];if(w)rest.addScaledVector(new V(a.getX(i),a.getY(i),a.getZ(i)),w)}
    const uncorrected=rest.clone().applyMatrix3(M).normalize(),target=uncorrected.clone().add(fresh.sub(old)).normalize(),changed=rest.clone();
    for(let j=24;j<26;j++){const w=m.morphTargetInfluences[j]||0,a=g.morphAttributes.normal[j];if(w)changed.addScaledVector(new V(a.getX(i),a.getY(i),a.getZ(i)),w)}
    const corrected=changed.applyMatrix3(M).normalize();
    const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a.dot(b))));
    const no=angle(target,uncorrected),yes=angle(target,corrected);result.without+=no;result.with+=yes;result.maxWith=Math.max(result.maxWith,yes);result.count++;
   }
  }
  // Hold-out fractions, offset from the normal-fit frame samples.
  d.reset();d.state.breathTime=0;d.setVariant('after');d.setMode('walk');d.setCrouched(true);for(let i=0;i<24;i++)d.step(.05);
  for(let i=0;i<16;i++){d.setPhase((i+.37)/16);sample('steady')}
  d.reset();d.state.breathTime=0;d.setVariant('after');d.setMode('control');d.setCrouched(true);for(let i=0;i<24;i++)d.step(.05);
  for(let i=0;i<4;i++){d.state.breathTime=(i+.37)*.6;d.step(.001);sample('steady')}
  for(const mode of ['walk','run'])for(const direction of ['enter','exit']){
   d.reset();d.state.breathTime=0;d.setVariant('after');d.setMode(mode);d.setPhase(.37);
   if(direction==='exit'){d.setCrouched(true);for(let i=0;i<24;i++)d.step(.05)}d.setCrouched(direction==='enter');
   for(let i=0;i<12;i++){d.step(.05);if(i>=2&&i<=9)sample('transition')}
  }
  for(const r of Object.values(results)){r.without/=r.count;r.with/=r.count}
  return results;
 });
 assert.deepEqual(errors,[]);assert.equal(result.steady.poses,20);assert.ok(result.steady.count>1000);
 assert.ok(Number.isFinite(result.steady.with)&&result.steady.with<result.steady.without*.6,JSON.stringify(result));
 assert.ok(result.transition.count>1000&&Number.isFinite(result.transition.with)&&result.transition.with<result.transition.without*.8,JSON.stringify(result));
 const degrees=r=>(180*r/Math.PI).toFixed(3);
 for(const [name,r] of Object.entries(result))console.log(`${name}: ${r.poses} poses, ${r.count} changed-region vertex samples; mean normal-angle error without/with fit ${degrees(r.without)}/${degrees(r.with)} degrees; max with fit ${degrees(r.maxWith)} degrees`);
 console.log('PASS: fitted knee normals improve the mean posed-surface-change approximation on held-out steady phases');
 console.log('NOTE: selected poses and vertices only; the reference transports the old authored normals and is not a full anatomical or visual-quality proof.');
}finally{await browser.close()}
