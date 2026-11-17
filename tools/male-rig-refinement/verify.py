#!/usr/bin/env python3
"""Verify the offline comparison and optionally reproduce it byte-for-byte."""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
DEFAULT=ROOT/'work/male-rig-refinement'
ARCHIVE='BladesOfWar_Dorabotka_Dvizheniy.zip'
FILES=['index.html','male_motion_refinement.glb','README.md','LICENSE_CC0_ASSETS.md','LICENSE_THREE.txt']
def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()
def verify(output:Path,rebuild:bool)->None:
    output=output.resolve();info=json.loads((output/'build-info.json').read_text(encoding='utf-8'))
    html=(output/'index.html').read_bytes();model=(output/'male_motion_refinement.glb').read_bytes();archive=(output/ARCHIVE).read_bytes()
    assert sha(html)==info['pageSha256'] and sha(model)==info['outputSha256'] and sha(archive)==info['archiveSha256']
    assert info['sourceSha256']=='9d9ee4719111f932573f098b97ee7d55c8357db0e730ba4a8883862a10985bea'
    assert info['wellCodeSha256']=='62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5'
    assert info['triangles']==32354 and info['bones']==22 and len(info['clips'])==8
    encoded=re.findall(rb'data:model/gltf-binary;base64,([A-Za-z0-9+/=]+)',html)
    assert len(encoded)==1 and base64.b64decode(encoded[0],validate=True)==model
    assert b'__RIGGED_DATA_URI__' not in html and b'/*__VIEWER_BUNDLE__*/' not in html
    with zipfile.ZipFile(output/ARCHIVE) as z:
        assert z.testzip() is None and sorted(z.namelist())==sorted(FILES)
        for name in FILES:
            assert z.read(name)==(output/name).read_bytes(),name
    print('PASS: standalone HTML embeds the exact model; ZIP and neighboring files match, hashes and CRC valid')
    if rebuild:
        with tempfile.TemporaryDirectory(prefix='bow-refine-rebuild-') as t:
            subprocess.run(['python3',str(HERE/'build.py'),'--output',t],cwd=ROOT,check=True)
            for name in FILES+[ARCHIVE,'build-info.json','.gitattributes']:
                assert (Path(t)/name).read_bytes()==(output/name).read_bytes(),f'non-reproducible: {name}'
        print('PASS: clean rebuild is byte-for-byte reproducible')
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output',nargs='?',type=Path,default=DEFAULT);p.add_argument('--rebuild',action='store_true');args=p.parse_args();verify(args.output,args.rebuild)
