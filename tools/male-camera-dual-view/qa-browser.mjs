// Offline browser checks. --scope=basic|old-scene|normal-compare.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const args=process.argv.slice(2),scope=args.find(x=>x.startsWith('--scope='))?.split('=')[1]||'basic';
const output=path.resolve(args.find(x=>!x.startsWith('--'))||path.join(root,'work/male-camera-dual-view'));
assert.ok(['basic','old-scene','normal-compare'].includes(scope));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bow-two-view-qa-'));
const failures=[];
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],
 defaultViewport:{width:1280,height:720,deviceScaleFactor:1},
});
async function open(file=path.join(output,'index.html'),viewport) {
 const page=await browser.newPage();if(viewport)await page.setViewport(viewport);
 page.on('pageerror',e=>failures.push(`page: ${e.message}`));
 page.on('console',m=>{if(m.type()==='error'||(m.type()==='warn'&&m.text().startsWith('THREE.')))failures.push(`console: ${m.text()}`)});
 await page.setRequestInterception(true);
 page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{failures.push('external request: '+r.url());r.abort()}});
 await page.setOfflineMode(true);
 await page.goto(pathToFileURL(file).href,{waitUntil:'load',timeout:120_000});
 await page.waitForFunction('window.ready===true',{timeout:120_000});
 return page;
}
const frame=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const pose=page=>page.evaluate(()=>({view:demo.state.view,version:demo.state.version,position:demo.camera.position.toArray(),
 target:demo.controls.target.toArray(),distance:demo.camera.position.distanceTo(demo.controls.target),yaw:demo.currentYaw(),
 elevation:Math.asin((demo.camera.position.y-demo.controls.target.y)/demo.camera.position.distanceTo(demo.controls.target)),well:demo.well.visible}));
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const nearArray=(a,b)=>a.forEach((x,i)=>near(x,b[i]));

async function basic() {
 const page=await open();await frame(page);
 let status=await page.evaluate(()=>({view:demo.state.view,version:demo.state.version,
  visible:[demo.original.visible,demo.optimized.visible,demo.well.visible],
  game:document.querySelector('[data-view="game"]').getAttribute('aria-pressed'),
  normal:document.querySelector('[data-view="normal"]').getAttribute('aria-pressed'),
  zoom:demo.controls.enableZoom,pan:demo.controls.enablePan,touchTwo:demo.controls.touches.TWO,
  hand:!!document.querySelector('[data-hand]'),triangles:document.querySelector('#triangle-label').textContent.replace(/\s/g,'')}));
 assert.deepEqual(status,{view:'game',version:'optimized',visible:[false,true,true],game:'true',normal:'false',zoom:false,pan:false,touchTwo:null,hand:false,triangles:'32354'});
 for(const [label,width,height] of [['desktop',1280,720],['mobile',390,844],['small phone',320,568],['tall phone',360,896],['landscape phone',568,320],['short phone',390,400],['desktop HD',1920,1080]]) {
  await page.setViewport({width,height,deviceScaleFactor:1});await frame(page);
  const res=await page.evaluate(()=>{
   const d=demo,out=[];function bounds(root){d.camera.updateMatrixWorld(true);root.updateMatrixWorld(true);
    const box=[Infinity,-Infinity,Infinity,-Infinity];root.traverse(o=>{
     if(!o.isMesh||!o.geometry?.attributes?.position)return;
     if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;if(!b||b.isEmpty())return;
     for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
      const v=d.camera.position.clone().set(x,y,z).applyMatrix4(o.matrixWorld).project(d.camera);
      box[0]=Math.min(box[0],v.x);box[1]=Math.max(box[1],v.x);box[2]=Math.min(box[2],v.y);box[3]=Math.max(box[3],v.y);
     }
    });return box;
   }
   for(const view of ['game','normal']){
    d.setView(view);
    for(let angle=0;angle<360;angle+=45){d.setYaw(angle*Math.PI/180);out.push({view,angle,male:bounds(d.optimized),well:view==='game'?bounds(d.well):null,
     distance:d.camera.position.distanceTo(d.controls.target),elevation:Math.asin((d.camera.position.y-d.controls.target.y)/d.camera.position.distanceTo(d.controls.target))});}
   }
   d.setView('game');d.setYaw(d.views.game.startYaw);d.setView('normal');d.setYaw(d.views.normal.startYaw);d.setView('game');d.draw();
   return {angles:out,canvas:[d.renderer.domElement.clientWidth,d.renderer.domElement.clientHeight],aspect:d.camera.aspect,
    page:[document.documentElement.clientWidth,document.documentElement.clientHeight,document.documentElement.scrollWidth,document.documentElement.scrollHeight]};
  });
  assert.equal(res.page[0],res.page[2],label+' horizontal overflow');assert.equal(res.page[1],res.page[3],label+' vertical overflow');
  near(res.aspect,res.canvas[0]/res.canvas[1],0.003);
  for(const x of res.angles){near(x.distance,x.view==='game'?10.6:3.9);near(x.elevation,(x.view==='game'?52:5)*Math.PI/180);
   for(const name of x.well?['male','well']:['male']){const [xmin,xmax,ymin,ymax]=x[name];assert.ok(xmin>=-1&&xmax<=1&&ymin>=-1&&ymax<=1,`${label}/${x.view}/${x.angle}/${name} cropped: ${x[name]}`)}
   if(x.view==='normal')assert.ok(x.male[3]-x.male[2]>1.1,`${label}: normal character too small`);
  }
  console.log(`PASS ${label}: both views, 8 rotations framed; canvas ${res.canvas.join('x')}`);
 }
 await page.setViewport({width:1280,height:720,deviceScaleFactor:1});await frame(page);
 await page.click('[data-view="normal"]');await frame(page);
 let front=await pose(page);assert.equal(front.well,false);near(front.distance,3.9);near(front.elevation,5*Math.PI/180);near(front.yaw,0);
 assert.deepEqual(await page.evaluate(()=>[document.querySelector('[data-view="game"]').getAttribute('aria-pressed'),document.querySelector('[data-view="normal"]').getAttribute('aria-pressed')]),['false','true']);
 await page.click('[data-version="original"]');await frame(page);const original=await pose(page);nearArray(front.position,original.position);nearArray(front.target,original.target);assert.equal(original.well,false);assert.equal(original.version,'original');
 await page.click('[data-version="optimized"]');await frame(page);const optimized=await pose(page);nearArray(front.position,optimized.position);nearArray(front.target,optimized.target);
 await page.click('[data-rotate="1"]');await page.click('[data-rotate="1"]');await frame(page);const side=await pose(page);near(side.yaw,Math.PI/2);near(side.distance,3.9);near(side.elevation,5*Math.PI/180);
 await page.click('[data-view="game"]');await frame(page);const game=await pose(page);assert.equal(game.well,true);near(game.distance,10.6);near(game.elevation,52*Math.PI/180);near(game.yaw,25*Math.PI/180);
 await page.click('[data-view="normal"]');await frame(page);const restored=await pose(page);nearArray(restored.position,side.position);assert.equal(restored.well,false);
 await page.click('[data-reset]');await frame(page);front=await pose(page);near(front.yaw,0);assert.equal(front.well,false);
 const canvas=await (await page.$('canvas')).boundingBox(),x=canvas.x+canvas.width/2,y=canvas.y+canvas.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+100,y+80,{steps:5});await page.mouse.up();await frame(page);
 const turned=await pose(page);assert.ok(Math.abs(turned.yaw-front.yaw)>0.05,'drag did not rotate');near(turned.distance,3.9);near(turned.elevation,5*Math.PI/180);nearArray(turned.target,front.target);
 await page.mouse.wheel({deltaY:-600});await frame(page);const wheel=await pose(page);nearArray(wheel.position,turned.position);nearArray(wheel.target,turned.target);
 await page.mouse.move(x,y);await page.mouse.down({button:'right'});await page.mouse.move(x+100,y+50,{steps:4});await page.mouse.up({button:'right'});await frame(page);const right=await pose(page);nearArray(right.position,wheel.position);nearArray(right.target,wheel.target);
 console.log('PASS: mode switching, memory of angles, model comparison, reset, mouse orbit and disabled wheel/pan');

 const shots=path.join(output,'review');fs.mkdirSync(shots,{recursive:true});
 await page.click('[data-reset]');await page.click('[data-version="optimized"]');await frame(page);await page.screenshot({path:path.join(shots,'01-normal-front.png')});
 await page.click('[data-version="original"]');await frame(page);await page.screenshot({path:path.join(shots,'02-normal-original.png')});
 await page.click('[data-version="optimized"]');await page.click('[data-rotate="1"]');await page.click('[data-rotate="1"]');await frame(page);await page.screenshot({path:path.join(shots,'03-normal-side.png')});
 await page.click('[data-rotate="1"]');await page.click('[data-rotate="1"]');await frame(page);await page.screenshot({path:path.join(shots,'04-normal-back.png')});
 await page.click('[data-view="game"]');await page.click('[data-reset]');await frame(page);await page.screenshot({path:path.join(shots,'05-game-view.png')});
 await page.setViewport({width:390,height:844,deviceScaleFactor:1});await frame(page);await page.click('[data-view="normal"]');await page.click('[data-reset]');await frame(page);await page.screenshot({path:path.join(shots,'06-mobile-normal.png')});
 await page.close();

 const mobile=await open(undefined,{width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});await frame(mobile);
 await mobile.click('[data-view="normal"]');await frame(mobile);
 const box=await (await mobile.$('canvas')).boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2,client=await mobile.createCDPSession();
 const before=await pose(mobile);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-22,y:cy,id:1},{x:cx+22,y:cy,id:2}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-75,y:cy,id:1},{x:cx+75,y:cy,id:2}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frame(mobile);const pinch=await pose(mobile);nearArray(before.position,pinch.position);nearArray(before.target,pinch.target);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy,id:1}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+75,y:cy+65,id:1}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frame(mobile);const swipe=await pose(mobile);
 assert.ok(Math.abs(swipe.yaw-pinch.yaw)>0.05,'touch swipe did not rotate');near(swipe.distance,3.9);near(swipe.elevation,5*Math.PI/180);nearArray(swipe.target,pinch.target);
 console.log('PASS mobile: pinch cannot zoom; one-finger swipe rotates at fixed distance and tilt');
 await mobile.close();
}

async function oldScene() {
 const previous=path.join(root,'work/male-camera-optimization/BladesOfWar_Male_Fixed_Camera.zip');
 const oldFile=path.join(temp,'previous.html');fs.writeFileSync(oldFile,execFileSync('unzip',['-p',previous,'BladesOfWar_Fixed_Camera.html'],{maxBuffer:35_000_000}));
 const [oldPage,newPage]=await Promise.all([open(oldFile),open()]);
 for(const page of [oldPage,newPage]) {
  await page.setViewport({width:960,height:720,deviceScaleFactor:1});
  await page.evaluate(()=>{document.querySelector('header').style.display='none';document.querySelector('footer').style.display='none';window.dispatchEvent(new Event('resize'));demo.renderer.setPixelRatio(1)});await frame(page);
 }
 const size=async p=>p.evaluate(()=>[demo.renderer.domElement.width,demo.renderer.domElement.height]);assert.deepEqual(await size(oldPage),await size(newPage));
 for(const version of ['original','optimized'])for(const angle of [0,25,45,90,180,270]) {
  const render=p=>p.evaluate(({version,angle})=>{demo.choose(version);demo.setYaw(angle*Math.PI/180);demo.draw();return demo.renderer.domElement.toDataURL('image/png')},{version,angle});
  const [a,b]=await Promise.all([render(oldPage),render(newPage)]);
  const metrics=await newPage.evaluate(async({a,b})=>{
   function image(src){return new Promise((ok,no)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=no;im.src=src})}
   const [x,y]=await Promise.all([image(a),image(b)]),c=document.createElement('canvas');c.width=x.width;c.height=x.height;const ctx=c.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(x,0,0);const p=ctx.getImageData(0,0,c.width,c.height).data;ctx.drawImage(y,0,0);const q=ctx.getImageData(0,0,c.width,c.height).data;let sum=0,changed=0;
   for(let i=0;i<p.length;i+=4){let d=0;for(let j=0;j<3;j++){const k=Math.abs(p[i+j]-q[i+j]);sum+=k;d=Math.max(d,k)}if(d)changed++}
   return {changed,mean:sum/(c.width*c.height*3)};
  },{a,b});
  assert.equal(metrics.changed,0,`${version}/${angle} prior game scene differs: ${JSON.stringify(metrics)}`);
 }
 console.log('PASS: previous scene matches pixel-for-pixel in both model versions at six yaw angles');
 await oldPage.close();await newPage.close();
}

async function normalCompare() {
 const page=await open();
 await page.evaluate(()=>{document.querySelector('header').style.display='none';document.querySelector('footer').style.display='none';window.dispatchEvent(new Event('resize'));demo.renderer.setPixelRatio(1);demo.setView('normal')});await frame(page);
 const reports=[];
 for(const angle of [0,45,90,135,180,225,270,315]) {
  const r=await page.evaluate(angle=>{
   const d=demo;d.setYaw(angle*Math.PI/180);d.camera.updateMatrixWorld(true);d.original.updateMatrixWorld(true);
   const obj=d.original.getObjectByName('head_1');if(!obj.geometry.boundingBox)obj.geometry.computeBoundingBox();const b=obj.geometry.boundingBox;
   let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
   for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
    const v=d.camera.position.clone().set(x,y,z).applyMatrix4(obj.matrixWorld).project(d.camera),px=(v.x+1)*d.renderer.domElement.width/2,py=(1-v.y)*d.renderer.domElement.height/2;
    xmin=Math.min(xmin,px);xmax=Math.max(xmax,px);ymin=Math.min(ymin,py);ymax=Math.max(ymax,py);
   }
   const x=Math.floor(xmin)-3,y=Math.floor(ymin)-3,w=Math.ceil(xmax)-x+3,h=Math.ceil(ymax)-y+3;
   const c=document.createElement('canvas');c.width=d.renderer.domElement.width;c.height=d.renderer.domElement.height;const ctx=c.getContext('2d',{willReadFrequently:true});
   const capture=version=>{d.choose(version);d.draw();ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(d.renderer.domElement,0,0);return ctx.getImageData(x,y,w,h).data};
   const a=capture('original'),repeat=capture('original'),second=capture('optimized');let repeated=0,changed=0,sum=0,max=0;
   for(let i=0;i<a.length;i+=4){let pixel=0;for(let j=0;j<3;j++){repeated=Math.max(repeated,Math.abs(a[i+j]-repeat[i+j]));const v=Math.abs(a[i+j]-second[i+j]);sum+=v;pixel=Math.max(pixel,v);max=Math.max(max,v)}if(pixel)changed++}
   return {angle,headCrop:[w,h],changed,meanRGB:sum/(w*h*3),max,repeated};
  },angle);
  assert.equal(r.repeated,0,`unstable baseline ${angle}°`);assert.ok(r.meanRGB<2,`large change ${angle}° ${JSON.stringify(r)}`);reports.push(r);
  console.log(`Normal ${angle}°: ${r.headCrop.join('x')} head crop mean RGB ${r.meanRGB.toFixed(4)}/255; ${r.changed} pixels differ`);
 }
 assert.ok(reports.some(r=>r.changed>0),'comparison did not toggle models');
 fs.writeFileSync(path.join(output,'normal-comparison.json'),JSON.stringify({description:'Head bounding rectangle including nearby background; fixed ordinary camera and same light; not pixel-identical.',reports},null,2)+'\n');
 console.log('PASS: ordinary view compared at 8 angles with matched camera/light; differences are not zero');
 await page.close();
}

try {
 if(scope==='basic')await basic();else if(scope==='old-scene')await oldScene();else await normalCompare();
 assert.deepEqual(failures,[],'Browser errors, warnings or network requests: '+failures.join('; '));
 console.log('PASS: opened offline without browser errors, Three.js warnings or external requests');
} finally {
 const proc=browser.process();let timer;await Promise.race([browser.close(),new Promise(r=>{timer=setTimeout(r,5000);timer.unref()})]);clearTimeout(timer);if(browser.connected&&proc)proc.kill('SIGKILL');
 fs.rmSync(temp,{recursive:true,force:true});
}
