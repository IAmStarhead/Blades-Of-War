// Measure deformed samples throughout the real viewer's clips, including
// interpolated times. These proxies do NOT establish muscle volume or style.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const output=path.resolve(process.argv[2]||path.join(root,'work/male-zomboid-style'));
const errors=[];
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:960,height:700}});
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||(m.type()==='warn'&&m.text().startsWith('THREE.')))errors.push(m.text())});
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external '+r.url());r.abort()}});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load',timeout:120_000});
 await page.waitForFunction('window.ready===true',{timeout:120_000});
 const result=await page.evaluate(()=>{
  const d=demo;d.setManual(true);const mesh=d.male.getObjectByName('head_2'),p=mesh.geometry.attributes.position,
   j=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight,bones=mesh.skeleton.bones.map(b=>b.name),v=d.camera.position.clone();
  const groups={front:[],L:[],R:[],soleL:[],soleR:[]};
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   if(y>.94&&y<1.10&&Math.abs(x)<.11&&z>.03)groups.front.push(i);
   if(y<.12&&Math.abs(x)>.03&&Math.abs(x)<.22)groups['sole'+(x>0?'L':'R')].push(i);
   for(const side of ['L','R']){
    let parent=0,child=0;for(let k=0;k<4;k++){const n=bones[j.getComponent(i,k)],weight=w.getComponent(i,k);
     if(n==='Rig_UpperArm_'+side)parent+=weight;if(n==='Rig_Forearm_'+side)child+=weight}
    if(parent>.15&&child>.15&&Math.abs(y-1.18)<.012)groups[side].push(i);
   }
  }
  const bpos=n=>d.male.getObjectByName(n).getWorldPosition(v).clone();
  function radius(side){
   const ids=groups[side],A=bpos('Rig_UpperArm_'+side),B=bpos('Rig_Forearm_'+side),C=bpos('Rig_Hand_'+side),
    axis=B.clone().sub(A).normalize().add(C.clone().sub(B).normalize()).normalize();
   const pts=ids.map(i=>mesh.getVertexPosition(i,v).clone().applyMatrix4(mesh.matrixWorld)),cen=pts[0].clone().set(0,0,0);
   pts.forEach(x=>cen.add(x));cen.divideScalar(pts.length);
   return Math.sqrt(pts.reduce((z,pt)=>{pt.sub(cen);return z+pt.lengthSq()-pt.dot(axis)**2},0)/pts.length);
  }
  function twist(side){
   const fore=d.male.getObjectByName('Rig_Forearm_'+side),q=fore.quaternion,axis=d.male.getObjectByName('Rig_Hand_'+side).position.clone().normalize();
   return Math.abs(2*Math.atan2(q.x*axis.x+q.y*axis.y+q.z*axis.z,q.w)*180/Math.PI);
  }
  function determinant(side){
   const out=[];for(const i of groups[side]){
    const m=Array(9).fill(0),mat=mesh.skeleton.boneMatrices;
    for(let k=0;k<4;k++){const o=j.getComponent(i,k)*16,x=w.getComponent(i,k);for(let c=0;c<3;c++)for(let r=0;r<3;r++)m[c*3+r]+=x*mat[o+c*4+r]}
    out.push(m[0]*(m[4]*m[8]-m[5]*m[7])-m[3]*(m[1]*m[8]-m[2]*m[7])+m[6]*(m[1]*m[5]-m[2]*m[4]));
   }
   out.sort((a,b)=>a-b);return out[Math.floor(out.length*.1)];
  }
  const summarize=a=>({min:Math.min(...a),mean:a.reduce((s,x)=>s+x,0)/a.length,max:Math.max(...a),range:Math.max(...a)-Math.min(...a)});
  const all={};for(const mode of ['walk','run'])for(const variant of ['before','after']){
   d.reset();d.setView('inspect');d.setMode(mode);d.setVariant(variant);d.setPlaying(false);
   const res={belly:[],radiusL:[],radiusR:[],twistL:[],twistR:[],detL:[],detR:[],hipsY:[],hipsZ:[]};let previous=null,maxStep=0,seam=0,first=null;
   for(let f=0;f<=240;f++){
    d.setPhase(f/240);d.scene.updateMatrixWorld(true);mesh.skeleton.update();let center=0;
    for(const i of groups.front){mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);center+=v.x}
    if(f<240){
     res.belly.push(center/groups.front.length);
     for(const side of ['L','R']){res['radius'+side].push(radius(side));res['twist'+side].push(twist(side));res['det'+side].push(determinant(side))}
     const q=d.male.getObjectByName('Rig_Hips').quaternion;res.hipsY.push(q.y);res.hipsZ.push(q.z);
    }
    const points=[];for(let i=0;i<p.count;i+=5){mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);points.push(v.x,v.y,v.z)}
    if(!first)first=points;
    if(previous)for(let i=0;i<points.length;i+=3)maxStep=Math.max(maxStep,Math.hypot(points[i]-previous[i],points[i+1]-previous[i+1],points[i+2]-previous[i+2]));
    if(f===240)for(let i=0;i<points.length;i+=3)seam=Math.max(seam,Math.hypot(points[i]-first[i],points[i+1]-first[i+1],points[i+2]-first[i+2]));
    previous=points;
   }
   all[mode+'/'+variant]={...Object.fromEntries(Object.entries(res).map(([k,a])=>[k,summarize(a)])),maxStep,seam};
  }
  // Remeasure after mixer.update(0), BEFORE the viewer's vertical guard, at
  // non-key phases. This is a discrete interpolation test, not continuous IK.
  const floor={};for(const mode of ['walk','run']){
   d.reset();d.setVariant('after');d.setMode(mode);d.setPlaying(false);let low=Infinity,flight=0,guard=0,ik=0;
   for(let f=0;f<480;f++){
    d.setPhase((f+.37)/480);guard=Math.max(guard,d.state.floorCorrection||0);ik=Math.max(ik,d.state.footIK||0);
    d.mixer.update(0);d.scene.updateMatrixWorld(true);mesh.skeleton.update();const minima=[];
    for(const side of ['L','R']){let y=Infinity;for(const i of groups['sole'+side]){mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);y=Math.min(y,v.y)}minima.push(y);low=Math.min(low,y)}
    if(minima.every(x=>x>.012))flight++;
   }
   floor[mode]={min:low,flightFraction:flight/480,guard,ik};
  }
  return {counts:Object.fromEntries(Object.entries(groups).map(([k,a])=>[k,a.length])),all,floor};
 });
 assert.ok(result.counts.front>=60&&result.counts.L>=20&&result.counts.R>=20&&result.counts.soleL>1000&&result.counts.soleR>1000);
 const a=result.all;
 assert.ok(a['walk/after'].belly.range<.001,'sampled belly centroid has large lateral movement');
 assert.ok(a['walk/before'].belly.range>a['walk/after'].belly.range*10,'comparison did not distinguish the tested belly group');
 for(const side of ['L','R']){
  assert.ok(a['run/after']['twist'+side].max<5,'unexpected forearm axial-twist proxy');
  assert.ok(a['run/after']['det'+side].mean>a['run/before']['det'+side].mean+.1,'selected elbow LBS diagnostic did not improve');
 }
 for(const mode of ['walk','run']){
  const s=a[mode+'/after'];assert.ok(Math.abs(s.hipsY.max)<1e-7&&Math.abs(s.hipsZ.max)<1e-7);
  assert.ok(s.seam<2e-6,mode+' sampled loop seam');assert.ok(s.maxStep<.02,mode+' sampled 240-phase vertex step');
  assert.ok(result.floor[mode].min>-.002,mode+' interpolated raw foot penetrates floor');
 }
 assert.ok(result.floor.walk.flightFraction<.01);assert.ok(result.floor.run.flightFraction>.04,'sampled jog lacks a visible airborne interval');
 console.log('PASS: selected deformed abdomen/elbow groups over 240 phases '+JSON.stringify({counts:result.counts,comparison:result.all}));
 console.log('PASS: 480 off-key interpolated phases before vertical guard '+JSON.stringify(result.floor));
 // Real requestAnimationFrame playback: it must advance, wrap and render,
 // without test-only stepping. This does not certify the visual result.
 const playback=await page.evaluate(()=>new Promise(resolve=>{
  const d=demo;d.reset();d.setMode('run');d.setVariant('after');d.setManual(false);
  const start=performance.now(),firstRender=d.renderer.info.render.frame;let last=d.state.phase,wraps=0,frames=0;
  function sample(now){const current=d.state.phase;if(current+0.5<last)wraps++;last=current;frames++;
   if(now-start<4000)requestAnimationFrame(sample);else resolve({frames,wraps,renders:d.renderer.info.render.frame-firstRender,phase:current});}
  requestAnimationFrame(sample);
 }));
 assert.ok(playback.frames>=15&&playback.renders>=10&&playback.wraps>=1,'automatic playback did not advance and loop');
 assert.deepEqual(errors,[],errors.join('\n'));
 console.log('PASS: actual browser requestAnimationFrame playback '+JSON.stringify(playback));
 console.log('NOTE: discrete selected groups, centroid/radius and LBS determinants do not prove appearance, exact contact, all transitions or absence of self-intersection.');
}catch(error){console.error(error);process.exitCode=1}finally{await browser.close()}
