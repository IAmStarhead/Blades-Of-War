// Render the NEW scene only, from three viewpoints, with fixed-step inputs.
// Floor dots and title strips exist only in this video. This recording does
// not replace an interactive or physical-device test. Requires FFmpeg/libx264.
// Usage: FFMPEG_BIN=/path/to/ffmpeg node record.mjs [/tmp/movement.mp4]
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const allowed=path.join(repo,'work/male-natural-motion-trial/movement.mp4');
const output=path.resolve(process.argv[2]||allowed);
if(process.argv.length>3||output===repo||(output.startsWith(repo+path.sep)&&output!==allowed))throw Error('Use the trial video path or a scratch path outside the repository');
const ffmpeg=process.env.FFMPEG_BIN||'ffmpeg';
if(spawnSync(ffmpeg,['-version'],{stdio:'ignore'}).status!==0)throw Error('FFmpeg with libx264 is required');
const require=createRequire(import.meta.url),puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bow-natural-video-')),temp=path.join(dir,'motion.mp4'),fps=24,perView=180,total=perView*3,errors=[];
let browser,encoder;
try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
  args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.setViewport({width:640,height:680,deviceScaleFactor:1});await page.setOfflineMode(true);
 await page.goto(pathToFileURL(path.join(repo,'work/male-natural-motion-trial/index.html')).href,{waitUntil:'load'});
 await page.waitForFunction('window.ready===true',{timeout:60000});
 await page.evaluate(()=>{
  const d=demo;d.setManual(true);d.renderer.setSize(540,540,false);d.camera.aspect=1;d.camera.fov=34;d.camera.updateProjectionMatrix();
  for(const x of [5.35,6.65])for(let z=-14;z<=9;z+=.4){const mark=d.marker.clone();mark.visible=true;mark.scale.setScalar(.2);mark.position.set(x,.004,z);d.scene.add(mark)}
  window.captureCanvas=document.createElement('canvas');captureCanvas.width=540;captureCanvas.height=594;
 });
 encoder=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','-',
  '-an','-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',temp],{stdio:['pipe','ignore','pipe']});
 let stderr='';encoder.stderr.on('data',b=>stderr+=b.toString());
 const finished=new Promise((resolve,reject)=>{encoder.on('error',reject);encoder.on('close',code=>code===0?resolve():reject(Error(`FFmpeg ${code}: ${stderr}`)))});
 try{
  for(let i=0;i<total;i++){
   const image=await page.evaluate(({i,perView})=>{
    const d=demo,k=i%perView,view=Math.floor(i/perView);
    if(k===0){d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0}
    if(k===24||k===84)d.keys.add('KeyW');
    if(k===84)d.keys.add('ShiftLeft');
    if(k===60||k===126){d.keys.delete('KeyW');d.keys.delete('ShiftLeft')}
    for(let step=0;step<5;step++)d.step(1/120);
    const {x,z}=d.player.position;
    if(view===0)d.camera.position.set(x,1.28,z-3.6);
    else if(view===1)d.camera.position.set(x+3.6,1.28,z);
    else d.camera.position.set(x,1.28,z+3.6);
    d.camera.lookAt(x,.80,z);d.camera.updateMatrixWorld();d.draw();
    const ctx=captureCanvas.getContext('2d');ctx.fillStyle='#202e26';ctx.fillRect(0,0,540,594);
    ctx.drawImage(d.renderer.domElement,0,0,540,540);ctx.textAlign='center';ctx.font='17px sans-serif';ctx.fillStyle='#f2e6cd';
    const angle=['Спереди','Сбоку','Сзади'][view],motion=k<24?'Ожидание':k<60?'Ходьба':k<84?'Остановка':k<126?'Бег':'Остановка';
    ctx.fillText(`${angle} · ${motion}`,270,572);
    return captureCanvas.toDataURL('image/jpeg',.82);
   },{i,perView});
   assert.ok(image.startsWith('data:image/jpeg;base64,'));
   if(!encoder.stdin.write(Buffer.from(image.split(',')[1],'base64')))await once(encoder.stdin,'drain');
   if(i%180===0)console.log(`Captured ${i}/${total} frames`);
  }
  encoder.stdin.end();await finished;encoder=null;
 }catch(error){encoder?.kill('SIGKILL');await Promise.allSettled([finished]);throw error}
 assert.deepEqual(errors,[]);fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(temp,output);
 console.log(`Video: ${output}; ${fs.statSync(output).size} bytes; SHA-256 ${createHash('sha256').update(fs.readFileSync(output)).digest('hex')}`);
}finally{if(browser)await browser.close();fs.rmSync(dir,{recursive:true,force:true})}
