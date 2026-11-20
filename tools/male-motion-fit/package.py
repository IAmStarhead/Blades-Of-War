#!/usr/bin/env python3
"""Create a reproducible offline archive from an already built and recorded trial."""
from __future__ import annotations
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT = ROOT / 'work/male-motion-fit'
ZIP = 'BladesOfWar_Primerka_Hodby_I_Bega_C.zip'

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', nargs='?', type=Path, default=DEFAULT)
    out = parser.parse_args().output.resolve()
    if out == ROOT or (out.is_relative_to(ROOT) and not (out == DEFAULT or out.is_relative_to(DEFAULT))):
        raise ValueError('Choose a separate output directory, not an earlier delivery')
    capture = json.loads((out / 'capture-info.json').read_text(encoding='utf-8'))
    build = json.loads((out / 'build-info.json').read_text(encoding='utf-8'))
    for filename, expected in build['filesSha256'].items():
        if sha((out / filename).read_bytes()) != expected:
            raise ValueError(f'Build file changed after build: {filename}')
    for filename, expected in [('index.html', capture['viewerSha256']), ('male_motion_C_trial.glb', capture['modelSha256']), *capture['videosSha256'].items()]:
        if sha((out / filename).read_bytes()) != expected:
            raise ValueError(f'Video capture does not match current file: {filename}')
    sources = [f'sources/{name}' for name in sorted(p.name for p in (out / 'sources').iterdir() if p.is_file())]
    required_sources = sorted(f'sources/{name}{suffix}' for name in ('accad_male2_walk.bvh', 'accad_male2_run.bvh', 'accad_male2_stand_to_walk.bvh') for suffix in ('', '.LICENSE.txt'))
    if sorted(sources) != required_sources:
        raise ValueError('Unexpected source files in archive')
    files = ['index.html', 'male_motion_C_trial.glb', 'walk_C.mp4', 'run_C.mp4', 'README.md', 'CREDITS.md',
             'LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_THREE.txt', 'build-info.json', 'capture-info.json', *sources]
    sums = ''.join(f'{sha((out / name).read_bytes())}  {name}\n' for name in sorted(files))
    (out / 'SHA256SUMS.txt').write_text(sums, encoding='utf-8', newline='\n')
    files.append('SHA256SUMS.txt')
    with zipfile.ZipFile(out / ZIP, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in sorted(files):
            entry = zipfile.ZipInfo(name, (2024, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, (out / name).read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    print(f'{out / ZIP}: SHA-256 {sha((out / ZIP).read_bytes())}, {len(files)} entries')

if __name__ == '__main__':
    main()
