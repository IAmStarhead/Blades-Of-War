// Side-by-side fixed-step capture of the previous scene and this trial.
// The actor is kept in an open, obstacle-free area; the side camera follows
// it so the viewer can compare the animation rather than the route taken.
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const folder=path.join(repo,'work/male-stealth-tuning'),prior=path.join(repo,'work/male-game-scene/index.html');
const output=process.argv[2]?path.resolve(process.argv[2]):path.join(folder,'sravnenie.mp4');
if(output.startsWith(repo+path.sep)&&output!==path.join(folder,'sravnenie.mp4'))throw Error('Refusing to replace another repository artifact');
const require=createRequire(path.join(repo,'tools/character-showcase/package.json'));
const puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bow-stealth-comparison-'));const fps=30,frames=450;
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const captions=[
  [0,.8,'Стойка'],[.8,2.4,'Присед из стойки'],[2.4,3.1,'Возврат в стойку'],
  [3.1,4.5,'Ходьба'],[4.5,6.3,'Ходьба → бег'],[6.3,7.5,'Бег → ходьба'],
  [7.5,8.5,'Бег'],[8.5,10.2,'Присед из бега'],[10.2,11.4,'Подъём и бег'],
  [11.4,12.6,'Быстрые переключения приседа'],[12.6,15,'Подъём и остановка'],
];
let browser;
try{
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
    args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
  const pages=[],errors=[];
  for(const file of [prior,path.join(folder,'index.html')]){
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    await page.setViewport({width:960,height:673,deviceScaleFactor:1});await page.setOfflineMode(true);
    await page.goto(pathToFileURL(file).href,{waitUntil:'load',timeout:60000});await page.waitForFunction('window.ready===true',{timeout:60000});
    await page.evaluate(()=>{demo.setManual(true);demo.reset();demo.player.position.set(6,0,8);demo.player.rotation.y=Math.PI;demo.state.yaw=0});pages.push(page);
  }
  for(let i=0;i<frames;i++){
    const images=await Promise.all(pages.map(page=>page.evaluate(i=>{
      const d=demo;
      if(i===24)d.setCrouched(true);
      if(i===72)d.setCrouched(false);
      if(i===93)d.keys.add('KeyW');
      if(i===135)d.keys.add('ShiftLeft');
      if(i===189)d.keys.delete('ShiftLeft');
      if(i===225)d.keys.add('ShiftLeft');
      if(i===255)d.setCrouched(true);
      if(i===306)d.setCrouched(false);
      if(i===342)d.setCrouched(true);
      if(i===347)d.setCrouched(false);
      if(i===352)d.setCrouched(true);
      if(i===378)d.setCrouched(false);
      if(i===405){d.keys.delete('KeyW');d.keys.delete('ShiftLeft')}
      d.player.position.set(6,0,8);
      d.step(1/60);d.step(1/60);
      const {x,z}=d.player.position;d.camera.position.set(x+3.5,1.45,z);d.camera.lookAt(x,.88,z);d.camera.updateMatrixWorld();d.draw();
      return d.renderer.domElement.toDataURL('image/jpeg',.83);
    },i)));
    for(let j=0;j<2;j++){
      if(!images[j].startsWith('data:image/jpeg;base64,'))throw Error('Empty frame');
      fs.writeFileSync(path.join(temp,`${j}-${String(i).padStart(4,'0')}.jpg`),Buffer.from(images[j].split(',')[1],'base64'));
    }
    if(i%60===0)console.log(`Captured ${i}/${frames}`);
  }
  if(errors.length)throw Error(errors.join('; '));
  const font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const labels=captions.map(([start,end,text])=>`drawtext=fontfile=${font}:text='${text}':fontcolor=white:fontsize=17:x=(w-text_w)/2:y=42:enable='gte(t,${start})*lt(t,${end})'`).join(',');
  const filter=`[0:v]scale=640:360[old];[1:v]scale=640:360[new];[old][new]hstack=inputs=2,pad=1280:428:0:68:color=0x212923,drawtext=fontfile=${font}:text='ПРЕЖНЯЯ СЦЕНА':fontcolor=white:fontsize=18:x=(640-text_w)/2:y=12,drawtext=fontfile=${font}:text='НОВАЯ ПРОБА':fontcolor=white:fontsize=18:x=640+(640-text_w)/2:y=12,${labels}[out]`;
  const tmpvideo=path.join(temp,'result.mp4');
  const run=spawnSync(process.env.FFMPEG_BIN||'ffmpeg',['-hide_banner','-loglevel','error','-framerate',String(fps),'-i',path.join(temp,'0-%04d.jpg'),
    '-framerate',String(fps),'-i',path.join(temp,'1-%04d.jpg'),'-filter_complex',filter,'-map','[out]','-frames:v',String(frames),'-an','-c:v','libx264','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart','-y',tmpvideo],{stdio:'inherit'});
  if(run.error)throw run.error;if(run.status!==0)throw Error('FFmpeg failed');
  fs.copyFileSync(tmpvideo,output);
  if(output===path.join(folder,'sravnenie.mp4')){
    const info={kind:'stealth-comparison-fixed-timestep',previousHtmlSha256:hash(prior),trialHtmlSha256:hash(path.join(folder,'index.html')),
      videoSha256:hash(output),width:1280,height:428,fps,frames,duration:frames/fps,sequence:captions.map(([from,to,label])=>({from,to,label})),
      note:'Two actual offline scenes; actor held in an open area to compare the movement. No audio; 60 Hz controller, captured at 30 fps.'};
    fs.writeFileSync(path.join(folder,'capture-info.json'),JSON.stringify(info,null,2)+'\n');
  }
  console.log(`Video ${output}: ${fs.statSync(output).size} bytes, SHA-256 ${hash(output)}`);
}finally{if(browser)await browser.close();fs.rmSync(temp,{recursive:true,force:true})}
