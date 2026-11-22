// Record a scripted, fixed-timestep tour of the actual offline scene.
// JPEG frames stay in an owned temporary directory and are removed afterwards.
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const folder=path.join(repo,'work/male-game-scene'),output=path.join(folder,'demonstratsiya.mp4');
const infoPath=path.join(folder,'capture-info.json');
if(fs.existsSync(output)){
  if(!fs.existsSync(infoPath)||JSON.parse(fs.readFileSync(infoPath,'utf8')).kind!=='game-scene-fixed-timestep')
    throw Error('Refusing to overwrite an unrelated video');
}
const require=createRequire(path.join(repo,'tools/character-showcase/package.json'));
const puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bow-scene-record-'));
const fps=24,count=336;
let browser;
try{
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
    args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.setViewport({width:960,height:673,deviceScaleFactor:1});await page.setOfflineMode(true);
  await page.goto(pathToFileURL(path.join(folder,'index.html')).href,{waitUntil:'load',timeout:60000});
  await page.waitForFunction('window.ready===true',{timeout:60000});
  const size=await page.evaluate(()=>{demo.setManual(true);demo.reset();return [demo.renderer.domElement.width,demo.renderer.domElement.height]});
  if(size[0]!==960||size[1]!==540)throw Error('Unexpected capture size '+size.join('x'));
  for(let i=0;i<count;i++){
    const jpeg=await page.evaluate(i=>{
      const d=demo;
      if(i===24)d.moveTo(4.3,2.6);
      if(i===53)d.state.pace='run';
      if(i===90)d.moveTo(-.5,3);
      if(i===154){d.state.pace='walk';d.setCrouched(true);d.moveTo(.65,1.75)}
      if(i===235)d.stop();
      if(i===252)d.inspect();
      d.advanceElapsed(1/24);d.draw();return d.renderer.domElement.toDataURL('image/jpeg',.88);
    },i);
    if(!jpeg.startsWith('data:image/jpeg;base64,'))throw Error('Failed to capture frame '+i);
    fs.writeFileSync(path.join(temp,`frame-${String(i).padStart(4,'0')}.jpg`),Buffer.from(jpeg.split(',')[1],'base64'));
    if(i%48===0)console.log(`Captured ${i}/${count}`);
  }
  if(errors.length)throw Error('Browser errors: '+errors.join('; '));
  const ffmpeg=process.env.FFMPEG_BIN||'ffmpeg',font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const captions=[
    [0,1,'Спокойная стойка'],[1,2.208,'Ходьба и поворот'],[2.208,3.75,'Переход от ходьбы к бегу'],
    [3.75,6.416,'Бег и поворот'],[6.416,9.792,'Присед и движение'],
    [9.792,10.5,'Остановка'],[10.5,14,'Подход и осмотр колодца'],
  ];
  const filters=['drawbox=x=18:y=17:w=430:h=49:color=black@0.55:t=fill',...captions.map(([start,end,text])=>
    `drawtext=fontfile=${font}:text='${text}':fontcolor=white:fontsize=20:x=32:y=29:enable='gte(t,${start})*lt(t,${end})'`)];
  const tempVideo=path.join(temp,'output.mp4');
  const run=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-framerate',String(fps),'-i',path.join(temp,'frame-%04d.jpg'),
    '-vf',filters.join(','),'-frames:v',String(count),'-an','-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-y',tempVideo],{stdio:'inherit'});
  if(run.error)throw run.error;if(run.status!==0)throw Error('FFmpeg failed');
  const data=fs.readFileSync(tempVideo);if(data.length<10000)throw Error('Empty video');fs.writeFileSync(output,data);
  const info={kind:'game-scene-fixed-timestep',description:'Scripted capture of the actual separate scene, no audio; fixed 1/24-second controller steps.',
    htmlSha256:createHash('sha256').update(fs.readFileSync(path.join(folder,'index.html'))).digest('hex'),
    width:960,height:540,fps,frames:count,duration:count/fps,sha256:createHash('sha256').update(data).digest('hex'),
    sequence:captions.map(([from,to,label])=>({from,to,label}))};
  fs.writeFileSync(infoPath,JSON.stringify(info,null,2)+'\n');console.log(`Video: ${output} (${data.length} bytes, ${info.sha256})`);
}finally{if(browser)await browser.close();fs.rmSync(temp,{recursive:true,force:true})}
