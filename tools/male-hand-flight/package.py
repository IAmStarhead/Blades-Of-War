#!/usr/bin/env python3
"""Validate and package this isolated follow-up without touching prior work."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PERMITTED = ROOT / 'work/male-hand-flight'
ARCHIVE = 'BladesOfWar_Kisti_Stopy_Proba.zip'
FILES = ['.gitattributes', 'README.md', 'CREDITS.md', 'LICENSE_QUATERNIUS_CC0.txt',
         'LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_THREE.txt',
         'build-info.json', 'capture-info.json', 'index.html', 'male_hands_airfoot_trial.glb',
         'previous_feet_arms.glb', 'walk_preview.mp4', 'run_preview.mp4', 'hands_preview.mp4', 'feet_preview.mp4']


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', nargs='?', type=Path, default=PERMITTED)
    folder = parser.parse_args().output.resolve()
    if folder == ROOT or (folder.is_relative_to(ROOT) and not folder.is_relative_to(PERMITTED)):
        raise ValueError('Choose this delivery or a separate scratch directory')
    for name in FILES:
        if not (folder / name).is_file():
            raise FileNotFoundError(folder / name)
    build = json.loads((folder / 'build-info.json').read_text())
    capture = json.loads((folder / 'capture-info.json').read_text())
    for name, expected in build['filesSha256'].items():
        if digest(folder / name) != expected:
            raise AssertionError(f'Build hash mismatch: {name}')
    model = digest(folder / 'male_hands_airfoot_trial.glb')
    previous = digest(folder / 'previous_feet_arms.glb')
    viewer = digest(folder / 'index.html')
    if (model != build['modelSha256'] or model != capture['modelSha256'] or
            previous != build['previousModelSha256'] or previous != capture['previousModelSha256'] or viewer != capture['viewerSha256']):
        raise AssertionError('Video capture does not match the packaged models/viewer')
    expected_videos = {'walk_preview.mp4', 'run_preview.mp4', 'hands_preview.mp4', 'feet_preview.mp4'}
    if set(capture['videosSha256']) != expected_videos:
        raise AssertionError('Missing video capture hash')
    for name, expected in capture['videosSha256'].items():
        if digest(folder / name) != expected:
            raise AssertionError(f'Video hash mismatch: {name}')
    subprocess.run(['python3', str(ROOT / 'tools/male-hand-flight/qa-video.py'), str(folder)], check=True)
    (folder / 'SHA256SUMS.txt').write_text(''.join(f'{digest(folder / n)}  {n}\n' for n in sorted(FILES)), encoding='utf-8')
    files = sorted([*FILES, 'SHA256SUMS.txt'])
    temporary = folder / ('.' + ARCHIVE + '.tmp')
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name in files:
                item = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0)); item.compress_type = zipfile.ZIP_DEFLATED
                item.create_system = 3; item.external_attr = 0o100644 << 16
                archive.writestr(item, (folder / name).read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None or archive.namelist() != files:
                raise AssertionError('Archive integrity failure')
            for name in files:
                if archive.read(name) != (folder / name).read_bytes():
                    raise AssertionError(f'Archive content mismatch: {name}')
        os.replace(temporary, folder / ARCHIVE)
    finally:
        temporary.unlink(missing_ok=True)
    print(f'PASS archive: {len(files)} byte-verified entries')
    print(f'{ARCHIVE}: SHA-256 {digest(folder / ARCHIVE)}')


if __name__ == '__main__':
    main()
