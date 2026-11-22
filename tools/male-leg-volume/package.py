#!/usr/bin/env python3
"""Validate hashes, measured reports and package the separate leg-volume trial."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PERMITTED = ROOT / 'work/male-leg-volume'
ARCHIVE = 'BladesOfWar_Proba_Obyom_Nogi.zip'
UPHILL_VIDEOS = ['uphill_walk.mp4', 'uphill_run.mp4', 'uphill_transition.mp4', 'uphill_feet.mp4']
COMPARISON = ['sravnenie_nogi.png', 'leg_comparison.mp4']
REPORTS = ['qa-volume.json', 'qa-knee-report.json']
FILES = ['.gitattributes', 'README.md', 'DEVELOPMENT.md', 'CREDITS.md', 'LICENSE_QUATERNIUS_CC0.txt',
         'LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_THREE.txt', 'author-report.json',
         'build-info.json', 'capture-info.json', 'comparison-info.json', 'index.html', 'male_leg_volume_trial.glb',
         'terrain.mjs', 'uphill-controller.mjs', 'phase-clock.mjs', 'floor-envelope.mjs', 'locomotion-three.mjs',
         'knee-volume.mjs', *REPORTS, *COMPARISON, *UPHILL_VIDEOS]


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
    compare = json.loads((folder / 'comparison-info.json').read_text())
    expected_build = set(FILES) - {'build-info.json', 'capture-info.json', 'comparison-info.json', *REPORTS, *COMPARISON, *UPHILL_VIDEOS}
    if set(build['filesSha256']) != expected_build:
        raise AssertionError(f'Build manifest mismatch: {set(build["filesSha256"]) ^ expected_build}')
    for name, expected in build['filesSha256'].items():
        if digest(folder / name) != expected:
            raise AssertionError(f'Build hash mismatch: {name}')
    model = digest(folder / 'male_leg_volume_trial.glb')
    viewer = digest(folder / 'index.html')
    source_hash = '576077e068f2c48a88c208be0ad72b4214e42164d1e5b0f0f9f7050f3967e2bf'
    if build['previousModelSha256'] != source_hash or digest(ROOT / 'work/male-hand-flight/male_hands_airfoot_trial.glb') != source_hash:
        raise AssertionError('The previous character is not the pinned source')
    if not (model == build['modelSha256'] == build['pose']['outputSha256'] == capture['modelSha256'] == compare['modelSha256']):
        raise AssertionError('Model hash differs across build and captures')
    if not (viewer == capture['viewerSha256'] == compare['viewerSha256']):
        raise AssertionError('Captured video/still does not match the packaged viewer')
    if set(capture['videosSha256']) != set(UPHILL_VIDEOS):
        raise AssertionError('Missing uphill video capture hash')
    for name, expected in capture['videosSha256'].items():
        if digest(folder / name) != expected:
            raise AssertionError(f'Video hash mismatch: {name}')
    if digest(folder / COMPARISON[0]) != compare['stillSha256'] or digest(folder / COMPARISON[1]) != compare['videoSha256']:
        raise AssertionError('Comparison capture hash mismatch')
    volume = json.loads((folder / 'qa-volume.json').read_text())
    if volume['comparison']['count'] != 1920 or volume['comparison']['improved'] != volume['comparison']['strongCount']:
        raise AssertionError('Unexpected volume measurement report')
    knee = json.loads((folder / 'qa-knee-report.json').read_text())
    if set(knee) != {'kneeL', 'kneeR'} or any(r['poses'] != 577 or r['newHitPoses'] for r in knee.values()):
        raise AssertionError('Unexpected knee contact report')
    subprocess.run(['python3', str(ROOT / 'tools/male-leg-volume/qa-video.py'), str(folder)], check=True)
    (folder / 'SHA256SUMS.txt').write_text(''.join(f'{digest(folder / n)}  {n}\n' for n in sorted(FILES)), encoding='utf-8')
    files = sorted([*FILES, 'SHA256SUMS.txt'])
    temporary = folder / ('.' + ARCHIVE + '.tmp')
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name in files:
                item = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                item.compress_type = zipfile.ZIP_DEFLATED; item.create_system = 3; item.external_attr = 0o100644 << 16
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
