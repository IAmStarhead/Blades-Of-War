#!/usr/bin/env python3
"""Verify package hashes/embedded models, optionally rebuild byte-for-byte."""
from __future__ import annotations
import argparse,base64,hashlib,json,re,subprocess,sys,tempfile,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).resolve().parent
ZIP='BladesOfWar_Proba_Riga_I_Srezov.zip'
def sha(data):return hashlib.sha256(data).hexdigest()
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=ROOT/'work/male-rig-rebuild');parser.add_argument('--rebuild',action='store_true');args=parser.parse_args();out=args.output.resolve()
 info=json.loads((out/'build-info.json').read_text(encoding='utf-8'));files=info['filesSha256']
 for name,expected in files.items():
  data=(out/name).read_bytes()
  if sha(data)!=expected:raise AssertionError(f'Hash mismatch: {name}')
 html=(out/'index.html').read_text(encoding='utf-8');match=re.search(r'window\.EMBEDDED_MODELS=\{new:"([A-Za-z0-9+/=]+)",previous:"([A-Za-z0-9+/=]+)",cuts:"([A-Za-z0-9+/=]+)"\}',html)
 if not match:raise AssertionError('Missing embedded model data')
 for data,name in zip(match.groups(),['male_rig_rebuild.glb','previous_walk_run_reference.glb','male_cut_placeholders.glb']):
  if base64.b64decode(data,validate=True)!=(out/name).read_bytes():raise AssertionError('Embedded model differs: '+name)
 members=[*files,'build-info.json']
 with zipfile.ZipFile(out/ZIP) as archive:
  if sorted(archive.namelist())!=sorted(members):raise AssertionError('Unexpected ZIP member list')
  for name in members:
   if archive.read(name)!=(out/name).read_bytes():raise AssertionError('ZIP differs: '+name)
 print('PASS: file hashes, embedded GLBs and ZIP members match; ZIP SHA-256',sha((out/ZIP).read_bytes()))
 if args.rebuild:
  with tempfile.TemporaryDirectory(prefix='bow-rig-verify-') as tmp:
   rebuilt=Path(tmp);subprocess.run([sys.executable,str(HERE/'build.py'),'--output',str(rebuilt)],cwd=ROOT,check=True)
   for name in [*members,ZIP,'.gitattributes']:
    if (out/name).read_bytes()!=(rebuilt/name).read_bytes():raise AssertionError('Rebuild differs: '+name)
   print('PASS: byte-for-byte rebuild of GLBs, page, metadata and archive in this environment')
if __name__=='__main__':main()
