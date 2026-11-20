#!/usr/bin/env python3
"""Rebuild the separate static body study and its offline review package."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
PREVIOUS = ROOT / 'work/male-body-contour/male_body_contour.glb'
PREVIOUS_SHA = 'db361ec8c18620802acb8dfa02b534a33e9e249134668ea8258c29c8a0a7fba5'
NEW_NAME = 'male_static_rebuild.glb'
OLD_NAME = 'previous_static_reference.glb'
ZIP_NAME = 'BladesOfWar_Proba_Novogo_Tela_Static.zip'
COMMIT = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482'
ASSETS = {
    'base.obj': ('makehuman/data/3dobjs/base.obj', '8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c'),
    'caucasian-male-young.target': ('makehuman/data/targets/macrodetails/caucasian-male-young.target', '70e228ba7164737dae664454394536fc5935fa48d333c1a97d77e2dc6eacc5f5'),
    'universal-male-young-maxmuscle-averageweight.target': ('makehuman/data/targets/macrodetails/universal-male-young-maxmuscle-averageweight.target', 'c171ff9cc95e96273beb3e3b1969a01988c2d4982ebc6fe04bf81cf72ee3b295'),
    'default.mhskel': ('makehuman/data/rigs/default.mhskel', '99f179bce0aa850b45d4191a1d0d234c5851f881c057439470ded3bddf729a24'),
    'default_weights.mhw': ('makehuman/data/rigs/default_weights.mhw', '0f3641d651ae3d00ad6b4ccee43142edb109d3bd909d27d9e4139ef1beed8625'),
    'LICENSE.MAKEHUMAN.md': ('LICENSE.md', 'edd99571ca62698f78c943fd4fffb159a413c315fa0d4819d3cec5cadaf8b4f1'),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run(*args):
    subprocess.run([str(arg) for arg in args], cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'work/male-static-rebuild')
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or output == ROOT / '.git':
        raise ValueError('Output must be a separate directory')
    if sha(PREVIOUS.read_bytes()) != PREVIOUS_SHA:
        raise ValueError('Previous GLB does not match the pinned source')
    for name, (_, expected) in ASSETS.items():
        if sha((HERE / 'sources' / name).read_bytes()) != expected:
            raise ValueError(f'Unexpected MakeHuman asset: {name}')
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='bow-static-rebuild-') as tmpdir:
        temp = Path(tmpdir)
        old_body, geometry, bundle = temp / 'old-body.json', temp / 'geometry.json', temp / 'viewer.js'
        run('node', HERE / 'extract-head.mjs', PREVIOUS, old_body)
        run(sys.executable, HERE / 'mesh.py', old_body, geometry)
        run('node', HERE / 'author.mjs', PREVIOUS, geometry, output / NEW_NAME, output / OLD_NAME)
        esbuild = ROOT / 'tools/male-library-motion/node_modules/.bin/esbuild'
        if not esbuild.is_file():
            raise ValueError('Run npm ci --prefix tools/male-library-motion first')
        env = dict(os.environ, NODE_PATH=str(ROOT / 'tools/male-library-motion/node_modules'))
        subprocess.run([str(esbuild), str(HERE / 'viewer.mjs'), '--bundle', '--minify',
                        '--format=iife', '--target=es2020', f'--outfile={bundle}'],
                       cwd=ROOT, env=env, check=True)
        script = bundle.read_text(encoding='utf-8')
        # A literal closing tag inside inline JS would terminate the script.
        if '</script' in script.lower():
            raise ValueError('Unsafe closing script tag in bundled JavaScript')
        html = (HERE / 'viewer.template.html').read_text(encoding='utf-8')
        substitutions = {
            '__NEW_MODEL_BASE64__': base64.b64encode((output / NEW_NAME).read_bytes()).decode('ascii'),
            '__PREVIOUS_MODEL_BASE64__': base64.b64encode((output / OLD_NAME).read_bytes()).decode('ascii'),
            '__VIEWER_BUNDLE__': script,
        }
        for marker, value in substitutions.items():
            if html.count(marker) != 1:
                raise ValueError(f'Missing or duplicate HTML marker: {marker}')
            html = html.replace(marker, value)
        (output / 'index.html').write_text(html, encoding='utf-8', newline='\n')
        report = json.loads(geometry.read_text(encoding='utf-8'))['report']
    (output / 'README.md').write_bytes((HERE / 'README.ru.md').read_bytes())
    (output / 'LICENSE_CC0_ASSETS.md').write_bytes((ROOT / 'work/male-body-contour/LICENSE_CC0_ASSETS.md').read_bytes())
    (output / 'LICENSE_THREE.txt').write_bytes((ROOT / 'work/male-body-contour/LICENSE_THREE.txt').read_bytes())
    (output / 'LICENSE_MAKEHUMAN.md').write_bytes((HERE / 'sources/LICENSE.MAKEHUMAN.md').read_bytes())
    (output / '.gitattributes').write_text(
        '*.glb binary\n*.zip binary\nindex.html -text -whitespace\n*.md text eol=lf\n*.json text eol=lf\n*.txt text eol=lf\nLICENSE_MAKEHUMAN.md -diff\n',
        encoding='utf-8', newline='\n')
    files = ['index.html', NEW_NAME, OLD_NAME, 'README.md', 'LICENSE_CC0_ASSETS.md',
             'LICENSE_MAKEHUMAN.md', 'LICENSE_THREE.txt']
    info = {
        'description': 'Separate static-only shape review. No rig, skin or animations.',
        'previousInput': {'path': str(PREVIOUS.relative_to(ROOT)), 'sha256': PREVIOUS_SHA},
        'makeHumanCommit': COMMIT,
        'makeHumanAssets': {name: {'path': src, 'sha256': digest,
                                   'url': f'https://github.com/makehumancommunity/makehuman/blob/{COMMIT}/{src}'}
                            for name, (src, digest) in ASSETS.items()},
        'construction': {'macroTarget': 1.0, 'muscleTarget': .35,
                         'upperArmDegrees': 28, 'forearmDegrees': 25, 'legDegrees': 4,
                         'fingerDegrees': [-12, -9.6, -7.8], 'donorNeckShiftMeters': -.020,
                         'neckDepthScale': 1.12, 'neckBackwardMeters': .011,
                         'staticOnly': True, 'join': report},
        'filesSha256': {name: sha((output / name).read_bytes()) for name in files},
    }
    (output / 'build-info.json').write_text(json.dumps(info, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    files.append('build-info.json')
    # Fixed ZIP metadata gives a byte-for-byte reproducible package.
    with zipfile.ZipFile(output / ZIP_NAME, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in files:
            entry = zipfile.ZipInfo(name, (2024, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, (output / name).read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    print(f'Wrote {output / ZIP_NAME}: sha256 {sha((output / ZIP_NAME).read_bytes())}')


if __name__ == '__main__':
    main()
