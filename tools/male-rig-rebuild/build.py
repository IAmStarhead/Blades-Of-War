#!/usr/bin/env python3
"""Rebuild the separate rig, gait reference, cut placeholders and offline review."""
from __future__ import annotations
import argparse, base64, hashlib, importlib.util, json, os, subprocess, sys, tempfile, zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).resolve().parent
PREVIOUS=ROOT/'work/male-body-contour/male_body_contour.glb'
STATIC=ROOT/'work/male-static-rebuild/male_static_rebuild.glb'
PREVIOUS_SHA='db361ec8c18620802acb8dfa02b534a33e9e249134668ea8258c29c8a0a7fba5'
STATIC_SHA='4ff3f49882d1544a856d1d9061a696e13224803fd58250782e456a3bca5982c2'
RIG='male_rig_rebuild.glb';REFERENCE='previous_walk_run_reference.glb';CUTS='male_cut_placeholders.glb';ZIP='BladesOfWar_Proba_Riga_I_Srezov.zip'

def sha(data):return hashlib.sha256(data).hexdigest()
def run(*args):subprocess.run([str(x) for x in args],cwd=ROOT,check=True)

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=ROOT/'work/male-rig-rebuild');args=parser.parse_args();out=args.output.resolve()
 protected=[ROOT,ROOT/'.git',ROOT/'work/male-static-rebuild',ROOT/'work/male-body-contour']
 if out in protected or any(out.is_relative_to(p) for p in protected[1:]):raise ValueError('Choose a separate output directory')
 for path,expected in [(PREVIOUS,PREVIOUS_SHA),(STATIC,STATIC_SHA)]:
  if sha(path.read_bytes())!=expected:raise ValueError(f'Unexpected input {path}')
 # Reuse and check the already-pinned static study sources; do not fetch assets.
 spec=importlib.util.spec_from_file_location('static_build',ROOT/'tools/male-static-rebuild/build.py');static_build=importlib.util.module_from_spec(spec);spec.loader.exec_module(static_build)
 for name,(_,expected) in static_build.ASSETS.items():
  if sha((ROOT/'tools/male-static-rebuild/sources'/name).read_bytes())!=expected:raise ValueError('Unexpected source '+name)
 out.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='bow-rig-rebuild-') as tmp:
  temp=Path(tmp);old=temp/'old.json';geometry=temp/'geometry.json';uncorrected=temp/'uncorrected.glb';calibration=temp/'calibration.json';segments=temp/'segments.json';bundle=temp/'viewer.js'
  run('node',HERE/'extract-old.mjs',PREVIOUS,old)
  run(sys.executable,HERE/'skin.py',old,geometry)
  run('node',HERE/'author.mjs',PREVIOUS,STATIC,geometry,uncorrected)
  run('node',HERE/'calibrate.mjs',PREVIOUS,uncorrected,out/RIG,calibration)
  run(sys.executable,HERE/'segment.py',geometry,segments)
  run('node',HERE/'author-segments.mjs',out/RIG,segments,out/CUTS)
  run('node',HERE/'trim-reference.mjs',PREVIOUS,out/REFERENCE)
  esbuild=ROOT/'tools/male-library-motion/node_modules/.bin/esbuild'
  if not esbuild.is_file():raise ValueError('Run npm ci --prefix tools/male-library-motion first')
  env=dict(os.environ,NODE_PATH=str(ROOT/'tools/male-library-motion/node_modules'))
  subprocess.run([str(esbuild),str(HERE/'viewer.mjs'),'--bundle','--minify','--format=iife','--target=es2020',f'--outfile={bundle}'],cwd=ROOT,env=env,check=True)
  script=bundle.read_text(encoding='utf-8')
  if '</script' in script.lower():raise ValueError('Unsafe closing script tag')
  html=(HERE/'viewer.template.html').read_text(encoding='utf-8')
  for marker,value in {'__NEW_MODEL_BASE64__':base64.b64encode((out/RIG).read_bytes()).decode('ascii'),
    '__PREVIOUS_MODEL_BASE64__':base64.b64encode((out/REFERENCE).read_bytes()).decode('ascii'),
    '__CUT_MODEL_BASE64__':base64.b64encode((out/CUTS).read_bytes()).decode('ascii'),'__VIEWER_BUNDLE__':script}.items():
   if html.count(marker)!=1:raise ValueError('Missing or duplicated marker '+marker)
   html=html.replace(marker,value)
  (out/'index.html').write_text(html,encoding='utf-8',newline='\n')
  geometry_report=json.loads(geometry.read_text())['report'];contact_report=json.loads(calibration.read_text());seg=json.loads(segments.read_text())
  segment_report={k:seg[k] for k in ('sites','closures','maxCutInterpolationWeightLoss')}
 (out/'README.md').write_bytes((HERE/'README.ru.md').read_bytes())
 (out/'LICENSE_CC0_ASSETS.md').write_bytes((ROOT/'work/male-body-contour/LICENSE_CC0_ASSETS.md').read_bytes())
 (out/'LICENSE_MAKEHUMAN.md').write_bytes((ROOT/'tools/male-static-rebuild/sources/LICENSE.MAKEHUMAN.md').read_bytes())
 (out/'LICENSE_THREE.txt').write_bytes((ROOT/'work/male-body-contour/LICENSE_THREE.txt').read_bytes())
 (out/'.gitattributes').write_text('*.glb binary\n*.zip binary\nindex.html -text -whitespace\n*.md text eol=lf\n*.json text eol=lf\n*.txt text eol=lf\nLICENSE_MAKEHUMAN.md -diff\n',encoding='utf-8',newline='\n')
 files=['index.html',RIG,REFERENCE,CUTS,'README.md','LICENSE_CC0_ASSETS.md','LICENSE_MAKEHUMAN.md','LICENSE_THREE.txt']
 info={'description':'Separate experimental rig and fixed-site paired-cap cut study; does not replace earlier deliveries.',
  'sourceStatic':{'path':str(STATIC.relative_to(ROOT)),'sha256':STATIC_SHA},'sourcePrevious':{'path':str(PREVIOUS.relative_to(ROOT)),'sha256':PREVIOUS_SHA},
  'makeHumanCommit':static_build.COMMIT,'makeHumanAssets':{n:{'sha256':digest,'path':path} for n,(path,digest) in static_build.ASSETS.items()},
  'body':geometry_report,'rootCalibration':contact_report,'segmentedStudy':segment_report,
  'filesSha256':{name:sha((out/name).read_bytes()) for name in files}}
 (out/'build-info.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');files.append('build-info.json')
 with zipfile.ZipFile(out/ZIP,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
  for name in files:
   entry=zipfile.ZipInfo(name,(2024,1,1,0,0,0));entry.create_system=3;entry.external_attr=0o100644<<16;entry.compress_type=zipfile.ZIP_DEFLATED
   archive.writestr(entry,(out/name).read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
 print(f'Wrote {out/ZIP}: sha256 {sha((out/ZIP).read_bytes())}')

if __name__=='__main__':main()
