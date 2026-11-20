#!/usr/bin/env python3
"""Verify the package, embedded model bytes and optionally reproduce the build."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
NEW, OLD = 'male_static_rebuild.glb', 'previous_static_reference.glb'
ARCHIVE = 'BladesOfWar_Proba_Novogo_Tela_Static.zip'
FILES = ['index.html', NEW, OLD, 'README.md', 'LICENSE_CC0_ASSETS.md',
         'LICENSE_MAKEHUMAN.md', 'LICENSE_THREE.txt', 'build-info.json']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT/'work/male-static-rebuild')
    parser.add_argument('--rebuild', action='store_true')
    args = parser.parse_args()
    output = args.output.resolve()
    info = json.loads((output/'build-info.json').read_text(encoding='utf-8'))
    for name, digest in info['filesSha256'].items():
        assert name in FILES and sha((output/name).read_bytes()) == digest, name
    html = (output/'index.html').read_text(encoding='utf-8')
    match = re.search(r'window\.EMBEDDED_MODELS=\{new:"([A-Za-z0-9+/=]+)",previous:"([A-Za-z0-9+/=]+)"\};', html)
    assert match, 'model data is not embedded'
    for data, name in zip(match.groups(), [NEW, OLD]):
        assert base64.b64decode(data, validate=True) == (output/name).read_bytes(), f'embedded {name}'
    with zipfile.ZipFile(output/ARCHIVE) as archive:
        assert archive.testzip() is None
        assert archive.namelist() == FILES
        for name in FILES:
            assert archive.read(name) == (output/name).read_bytes(), f'ZIP member {name}'
    print(f'PASS: ZIP members and both embedded GLBs match standalone files; ZIP SHA-256 {sha((output/ARCHIVE).read_bytes())}')
    if args.rebuild:
        with tempfile.TemporaryDirectory(prefix='bow-static-verify-') as tmp:
            subprocess.run([sys.executable, str(HERE/'build.py'), '--output', tmp], cwd=ROOT, check=True)
            for name in [*FILES, '.gitattributes', ARCHIVE]:
                assert (output/name).read_bytes() == (Path(tmp)/name).read_bytes(), f'non-reproducible {name}'
        print('PASS: byte-identical rebuild of both GLBs, offline page, metadata and ZIP')


if __name__ == '__main__':
    main()
