#!/usr/bin/env python3
"""Check the offline ZIP and optionally reproduce it byte-for-byte."""
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
ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DEFAULT = ROOT / 'work/male-zomboid-style'
ARCHIVE = 'BladesOfWar_Novaya_Hodba_Beg.zip'
MODEL = 'male_zomboid_style.glb'
FILES = ['index.html', MODEL, 'README.md', 'LICENSE_MOCAP.md', 'CMU_BVH_READMEFIRST.txt', 'LICENSE_CC0_ASSETS.md', 'LICENSE_THREE.txt']


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify(output: Path, rebuild: bool) -> None:
    output = output.resolve()
    info = json.loads((output / 'build-info.json').read_text(encoding='utf-8'))
    html, model, archive = (output / 'index.html').read_bytes(), (output / MODEL).read_bytes(), (output / ARCHIVE).read_bytes()
    assert sha(html) == info['pageSha256'] and sha(model) == info['outputSha256'] and sha(archive) == info['archiveSha256']
    assert info['sourceSha256'] == '0525f293409ad40e5146f461964d89d23e863ac57f57b12a51ea453f87867554'
    assert info['sourceZipSha256'] == 'f9ae35be819bd2a7954c0b635c0cf3fa0dcb33f2887f884948f4bf4bb908ac3e'
    assert info['bones'] == 22 and len(info['clips']) == 2 and len(info['allAnimations']) == 20
    assert [c['name'] for c in info['clips']] == ['Game_Style_Walk', 'Game_Style_Jog']
    encoded = re.findall(rb'data:model/gltf-binary;base64,([A-Za-z0-9+/=]+)', html)
    assert len(encoded) == 1 and base64.b64decode(encoded[0], validate=True) == model
    assert b'__MODEL__' not in html and b'__BUNDLE__' not in html
    with zipfile.ZipFile(output / ARCHIVE) as z:
        assert z.testzip() is None and sorted(z.namelist()) == sorted(FILES)
        for name in FILES:
            assert z.read(name) == (output / name).read_bytes(), name
    print('PASS: embedded GLB, neighboring files and ZIP match; hashes and CRC valid')
    if rebuild:
        with tempfile.TemporaryDirectory(prefix='bow-game-style-rebuild-') as directory:
            subprocess.run(['python3', str(HERE / 'build.py'), '--output', directory], cwd=ROOT, check=True)
            for name in FILES + [ARCHIVE, 'build-info.json', '.gitattributes']:
                assert (Path(directory) / name).read_bytes() == (output / name).read_bytes(), f'non-reproducible: {name}'
        print('PASS: clean rebuild is byte-for-byte reproducible')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', nargs='?', type=Path, default=DEFAULT)
    parser.add_argument('--rebuild', action='store_true')
    args = parser.parse_args()
    verify(args.output, args.rebuild)
