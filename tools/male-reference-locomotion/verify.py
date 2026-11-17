#!/usr/bin/env python3
"""Check the offline archive and optionally rebuild it byte-for-byte."""
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
DEFAULT=ROOT/'work/male-reference-locomotion'
ARCHIVE='BladesOfWar_Hodba_Beg_Referens.zip'
MODEL='male_reference_locomotion.glb'
FILES=['index.html',MODEL,'README.md','LICENSE_MOCAP.md','CMU_BVH_READMEFIRST.txt','LICENSE_CC0_ASSETS.md','LICENSE_THREE.txt']


def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()


def verify(output:Path,rebuild:bool)->None:
    output=output.resolve();info=json.loads((output/'build-info.json').read_text(encoding='utf-8'))
    html=(output/'index.html').read_bytes();model=(output/MODEL).read_bytes();archive=(output/ARCHIVE).read_bytes()
    assert sha(html)==info['pageSha256'] and sha(model)==info['outputSha256'] and sha(archive)==info['archiveSha256']
    assert info['sourceSha256']=='e32fca3f789abbb0eebcf17f21cba5d2a981155de50e155982bbcb0281574d6c'
    assert info['sourceZipSha256']=='328d5250c525d9a1a6af65320b8ba4316e310380e737b7d79af4d5543f16b4c6'
    assert info['wellCodeSha256']=='62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5'
    assert info['navigationCodeSha256']=='93127f23ebc0185c21a11cceace973e0ab3eb9c3a19b447c5d215590527aa608'
    assert info['bones']==22 and len(info['clips'])==2 and len(info['allAnimations'])==14
    encoded=re.findall(rb'data:model/gltf-binary;base64,([A-Za-z0-9+/=]+)',html)
    assert len(encoded)==1 and base64.b64decode(encoded[0],validate=True)==model
    assert b'__MODEL__' not in html and b'__BUNDLE__' not in html
    with zipfile.ZipFile(output/ARCHIVE) as z:
        assert z.testzip() is None and sorted(z.namelist())==sorted(FILES)
        for name in FILES:
            assert z.read(name)==(output/name).read_bytes(),name
    print('PASS: embedded GLB, neighboring files and ZIP match; hashes and CRC valid')
    if rebuild:
        with tempfile.TemporaryDirectory(prefix='bow-reference-rebuild-') as directory:
            subprocess.run(['python3',str(HERE/'build.py'),'--output',directory],cwd=ROOT,check=True)
            for name in FILES+[ARCHIVE,'build-info.json','.gitattributes']:
                assert (Path(directory)/name).read_bytes()==(output/name).read_bytes(),f'non-reproducible: {name}'
        print('PASS: clean rebuild is byte-for-byte reproducible')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',nargs='?',type=Path,default=DEFAULT);parser.add_argument('--rebuild',action='store_true')
    args=parser.parse_args();verify(args.output,args.rebuild)
