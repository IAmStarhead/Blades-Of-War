// Build one self-contained HTML, preserving and checking all prior assets.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--output'))throw Error('Usage: node build.mjs [--output separate-directory]');
const permitted=path.join(repo,'work/male-game-scene'),out=path.resolve(args[1]||permitted);
if(out===repo||(out.startsWith(repo+path.sep)&&out!==permitted&&!out.startsWith(permitted+path.sep)))
  throw Error('Refusing to overwrite another repository artifact');
const modelPath=path.join(repo,'work/male-leg-volume/male_leg_volume_trial.glb');
const modelHash='eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484';
const wellPath=path.join(repo,'tools/male-rig-trial/well-source.mjs');
const wellHash='62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const model=fs.readFileSync(modelPath);assert.equal(sha(model),modelHash,'Unexpected accepted model');
assert.equal(sha(fs.readFileSync(wellPath)),wellHash,'Well source must remain unchanged');
const generated=spawnSync(process.execPath,[path.join(here,'author-crouch.mjs')],{cwd:repo,stdio:'inherit'});
if(generated.error)throw generated.error;if(generated.status!==0)throw Error('Crouch author failed');
const require=createRequire(path.join(here,'package.json')),esbuild=require('esbuild');
// Well and controller live in older tool folders. Point every Three.js import
// at this package's copy so the bundle does not contain multiple engines.
const threeDir=path.resolve(path.dirname(require.resolve('three')),'..');
const built=await esbuild.build({entryPoints:[path.join(here,'viewer.mjs')],bundle:true,write:false,format:'iife',target:'es2020',minify:true,legalComments:'none',alias:{'three/addons':path.join(threeDir,'examples/jsm'),three:threeDir}});
const script=built.outputFiles[0].text.replaceAll('</script','<\\/script');
let html=fs.readFileSync(path.join(here,'index.template.html'),'utf8');
for(const [marker,value] of Object.entries({'__MODEL_BASE64__':model.toString('base64'),'__VIEWER_BUNDLE__':script})){
  assert.equal(html.split(marker).length,2,`Missing or duplicated marker ${marker}`);html=html.replace(marker,()=>value);
}
fs.mkdirSync(out,{recursive:true});
const marker='Blades of War — у колодца';
if(fs.existsSync(path.join(out,'index.html'))&&!fs.readFileSync(path.join(out,'index.html'),'utf8').includes(marker))throw Error('Refusing to replace an unrelated index.html');
fs.writeFileSync(path.join(out,'index.html'),html);
fs.copyFileSync(path.join(here,'README.ru.md'),path.join(out,'README.md'));
const previous=path.join(repo,'work/male-leg-volume');
for(const name of ['LICENSE_CC0_ASSETS.md','LICENSE_MAKEHUMAN.md','LICENSE_QUATERNIUS_CC0.txt','LICENSE_THREE.txt'])fs.copyFileSync(path.join(previous,name),path.join(out,name));
fs.writeFileSync(path.join(out,'CREDITS.md'),`# Well scene and animation trial\n\nThe original accepted model is embedded unchanged (SHA-256 \`${modelHash}\`). The well is the unchanged procedural prefab from \`tools/male-rig-trial/well-source.mjs\` (SHA-256 \`${wellHash}\`). Additional idle, crouch and interaction motions are separately generated for this rig; source code, IK authoring and tests are in \`tools/male-game-scene/\`. The 22-bone \`tools/male-stealth-crouch/author.mjs\` served as an algorithmic reference for the new crouch, but its old animation tracks and model are not shipped.\n\n---\n\n`+fs.readFileSync(path.join(previous,'CREDITS.md'),'utf8'));
fs.writeFileSync(path.join(out,'.gitattributes'),'*.zip binary\n*.mp4 binary\nindex.html -text -whitespace\n*.md text eol=lf\n*.json text eol=lf\nSHA256SUMS.txt text eol=lf\nLICENSE_MAKEHUMAN.md -diff\n');
const files=['index.html','README.md','CREDITS.md','LICENSE_CC0_ASSETS.md','LICENSE_MAKEHUMAN.md','LICENSE_QUATERNIUS_CC0.txt','LICENSE_THREE.txt'];
const data=JSON.parse(fs.readFileSync(path.join(here,'crouch-clips.json'),'utf8'));
const info={scope:'Separate flat-ground playable scene; not a complete game.',modelSha256:modelHash,wellSourceSha256:wellHash,runPhaseOffset:-3/32,
  generatedCrouch:data.clips.map(({name,duration,speed,stats})=>({name,duration,speed,stats})),
  assetsSha256:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(out,f)))]))};
fs.writeFileSync(path.join(out,'build-info.json'),JSON.stringify(info,null,2)+'\n');
console.log(`Built ${path.join(out,'index.html')} (${html.length} characters).`);
