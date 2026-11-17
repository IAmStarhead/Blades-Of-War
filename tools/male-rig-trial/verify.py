#!/usr/bin/env python3
"""Verify the offline deliverable and optionally reproduce it byte-for-byte."""
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
DEFAULT=ROOT/'work/male-rig-trial'
ARCHIVE='BladesOfWar_Proba_Skeleta.zip'
FILES=['index.html','male_rig_trial.glb','README.md','LICENSE_CC0_ASSETS.md','LICENSE_THREE.txt']

def sha(b: bytes)->str:
    return hashlib.sha256(b).hexdigest()

def verify(output: Path, rebuild: bool)->None:
    output=output.resolve()
    info=json.loads((output/'build-info.json').read_text(encoding='utf-8'))
    html=(output/'index.html').read_bytes()
    model=(output/'male_rig_trial.glb').read_bytes()
    archive=(output/ARCHIVE).read_bytes()
    assert sha(html)==info['pageSha256']
    assert sha(model)==info['outputSha256']
    assert sha(archive)==info['archiveSha256']
    assert info['sourceSha256']=='009275f703e22426139908f03c44e52a52cc52f20b9f3d6e12fb39ae1285075e'
    assert info['wellSourceSha256']=='e0433a8dc25a44aa127425d4c4d9b7aa1c62e767d775dc261ac64c0d190eba8b'
    assert info['triangles']==32354 and info['bones']==22 and len(info['clips'])==5
    matches=re.findall(rb'data:model/gltf-binary;base64,([A-Za-z0-9+/=]+)',html)
    assert len(matches)==1 and base64.b64decode(matches[0],validate=True)==model
    assert b'__RIGGED_DATA_URI__' not in html and b'/*__VIEWER_BUNDLE__*/' not in html
    with zipfile.ZipFile(output/ARCHIVE) as z:
        assert z.testzip() is None and sorted(z.namelist())==sorted(FILES)
        for name in FILES:
            assert z.read(name)==(output/name).read_bytes(), name
    print('PASS: standalone HTML embeds the exact rigged GLB; ZIP matches every neighboring file')
    print('PASS: page, model, archive, source and well hashes match build-info; ZIP CRC is valid')
    if rebuild:
        with tempfile.TemporaryDirectory(prefix='bow-rig-rebuild-') as t:
            subprocess.run(['python3',str(HERE/'build.py'),'--output',t],cwd=ROOT,check=True)
            for name in FILES+[ARCHIVE,'build-info.json','.gitattributes']:
                assert (Path(t)/name).read_bytes()==(output/name).read_bytes(), f'non-reproducible: {name}'
        print('PASS: clean rebuild is byte-for-byte reproducible')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path,nargs='?',default=DEFAULT)
    parser.add_argument('--rebuild',action='store_true')
    args=parser.parse_args()
    verify(args.output,args.rebuild)
