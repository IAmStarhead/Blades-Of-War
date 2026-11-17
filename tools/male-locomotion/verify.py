#!/usr/bin/env python3
"""Verify the offline archive and optionally rebuild it byte-for-byte."""
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
DEFAULT=ROOT/'work/male-locomotion'
ARCHIVE='BladesOfWar_Hodba_Beg_Upravlenie.zip'
FILES=['index.html','male_locomotion.glb','README.md','LICENSE_CC0_ASSETS.md','LICENSE_THREE.txt']

def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()

def verify(output:Path,rebuild:bool)->None:
    output=output.resolve();info=json.loads((output/'build-info.json').read_text(encoding='utf-8'))
    html=(output/'index.html').read_bytes();model=(output/'male_locomotion.glb').read_bytes();archive=(output/ARCHIVE).read_bytes()
    assert sha(html)==info['pageSha256'] and sha(model)==info['outputSha256'] and sha(archive)==info['archiveSha256']
    assert info['sourceSha256']=='a442b85eab3e725bb54f87ce5a3e89da05e7cfefa02cf5cfbb817cf6c67fcc4d'
    assert info['sourceZipSha256']=='494b0b314c47f8ff288c7ed3d03b834e019738de8101b5dd3e50ce36e6b4ff04'
    assert info['wellCodeSha256']=='62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5'
    assert info['triangles']==32354 and info['bones']==22 and len(info['clips'])==11
    encoded=re.findall(rb'data:model/gltf-binary;base64,([A-Za-z0-9+/=]+)',html)
    assert len(encoded)==1 and base64.b64decode(encoded[0],validate=True)==model
    assert b'__MODEL__' not in html and b'__BUNDLE__' not in html
    with zipfile.ZipFile(output/ARCHIVE) as z:
        assert z.testzip() is None and sorted(z.namelist())==sorted(FILES)
        for name in FILES:
            assert z.read(name)==(output/name).read_bytes(),name
    print('PASS: offline HTML embeds the exact model; ZIP and neighboring files match, hashes and CRC valid')
    if rebuild:
        with tempfile.TemporaryDirectory(prefix='bow-locomotion-rebuild-') as directory:
            subprocess.run(['python3',str(HERE/'build.py'),'--output',directory],cwd=ROOT,check=True)
            for name in FILES+[ARCHIVE,'build-info.json','.gitattributes']:
                assert (Path(directory)/name).read_bytes()==(output/name).read_bytes(),f'non-reproducible: {name}'
        print('PASS: clean rebuild is byte-for-byte reproducible')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('output',nargs='?',type=Path,default=DEFAULT);parser.add_argument('--rebuild',action='store_true')
    args=parser.parse_args();verify(args.output,args.rebuild)
