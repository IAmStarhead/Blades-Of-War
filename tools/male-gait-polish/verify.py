#!/usr/bin/env python3
"""Verify files, embedded model, ZIP, hashes and optional clean rebuild."""
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
DEFAULT = ROOT / 'work/male-gait-polish'
ARCHIVE = 'BladesOfWar_Proba_Pravok_Hodby_i_Bega.zip'
MODEL = 'male_gait_polish.glb'
FILES = ['index.html', MODEL, 'README.md', 'LICENSE_MOCAP.md', 'CMU_BVH_READMEFIRST.txt',
         'LICENSE_CC0_ASSETS.md', 'LICENSE_THREE.txt', 'LICENSE_CC0_QUATERNIUS.txt']


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify(output: Path, rebuild: bool) -> None:
    output = output.resolve()
    info = json.loads((output / 'build-info.json').read_text(encoding='utf-8'))
    html, model, archive = (output / 'index.html').read_bytes(), (output / MODEL).read_bytes(), (output / ARCHIVE).read_bytes()
    assert sha(html) == info['pageSha256'] and sha(model) == info['outputSha256'] and sha(archive) == info['archiveSha256']
    assert info['sourceSha256'] == '14fb12a55c690b3919a66c07d3e9715da568fa13bbf7e945538bf0ab4a4b8cd0'
    assert info['sourceZipSha256'] == '8b55bc818cb9944a904194664e1029930a7b9fed3944fae57aba4c4c70a78981'
    assert info['addedClips'] == ['Polish_Walk', 'Polish_Run']
    assert info['walk']['forearmYZScale'] == .2 and info['walk']['upperArmSpreadReductionDegrees'] == 2
    encoded = re.findall(rb'data:model/gltf-binary;base64,([A-Za-z0-9+/=]+)', html)
    assert len(encoded) == 1 and base64.b64decode(encoded[0], validate=True) == model
    assert b'__MODEL__' not in html and b'__BUNDLE__' not in html
    with zipfile.ZipFile(output / ARCHIVE) as z:
        assert z.testzip() is None and sorted(z.namelist()) == sorted(FILES)
        for name in FILES:
            assert z.read(name) == (output / name).read_bytes(), name
    print('PASS: model, embedded HTML, ZIP contents, hashes and CRC match')
    if rebuild:
        with tempfile.TemporaryDirectory(prefix='bow-library-rebuild-') as directory:
            subprocess.run(['python3', str(HERE / 'build.py'), '--output', directory], cwd=ROOT, check=True)
            for name in FILES + [ARCHIVE, 'build-info.json', '.gitattributes']:
                assert (Path(directory) / name).read_bytes() == (output / name).read_bytes(), f'non-reproducible: {name}'
        print('PASS: clean rebuild byte-for-byte')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', nargs='?', type=Path, default=DEFAULT)
    parser.add_argument('--rebuild', action='store_true')
    args = parser.parse_args()
    verify(args.output, args.rebuild)
