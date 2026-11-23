// Build only this separate scene. Previous scenes and the accepted GLB are read-only.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const permitted=path.join(repo,'work/male-stealth-posture-trial'),args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--output'))throw Error('Usage: node build.mjs [--output separate-directory]');
const out=path.resolve(args[1]||permitted);
if(out===repo||(out.startsWith(repo+path.sep)&&out!==permitted&&!out.startsWith(permitted+path.sep)))throw Error('Refusing to write another repository artifact');
const model=fs.readFileSync(path.join(repo,'work/male-leg-volume/male_leg_volume_trial.glb'));
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(model),'eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484');
const gen=spawnSync(process.execPath,[path.join(here,'author-crouch.mjs')],{cwd:repo,stdio:'inherit'});
if(gen.error)throw gen.error;if(gen.status!==0)throw Error('Crouch author failed');
const require=createRequire(import.meta.url),esbuild=require('esbuild');
const threeDir=path.resolve(path.dirname(require.resolve('three')),'..');
const built=await esbuild.build({entryPoints:[path.join(here,'viewer.mjs')],bundle:true,write:false,format:'iife',target:'es2020',minify:true,legalComments:'none',alias:{'three/addons':path.join(threeDir,'examples/jsm'),three:threeDir}});
const script=built.outputFiles[0].text.replaceAll('</script','<\\/script');
let html=fs.readFileSync(path.join(here,'index.template.html'),'utf8');
for(const [marker,value] of Object.entries({'__MODEL_BASE64__':model.toString('base64'),'__VIEWER_BUNDLE__':script})){
 assert.equal(html.split(marker).length,2,`Missing or duplicated marker ${marker}`);html=html.replace(marker,()=>value);
}
fs.mkdirSync(out,{recursive:true});
const file=path.join(out,'index.html');if(fs.existsSync(file)&&!fs.readFileSync(file,'utf8').includes('отдельная проба стелс-стойки'))throw Error('Refusing to overwrite unrelated index.html');
fs.writeFileSync(file,html);console.log(`Built ${file} (${html.length} chars; SHA-256 ${hash(Buffer.from(html))}).`);
