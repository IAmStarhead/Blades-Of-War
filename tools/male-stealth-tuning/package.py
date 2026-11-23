#!/usr/bin/env python3
"""Check and package the separate movement trial without changing earlier scenes."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PERMITTED = ROOT / 'work/male-stealth-tuning'
ARCHIVE = 'BladesOfWar_Dvizhenie_i_Stels.zip'
MODEL = 'eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484'
WELL = '62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5'
PREVIOUS = '3712e7a8df6e86249da7b90d97eb019fefca3d0213cd0387b7459b35d61933f2'
BUILD_FILES = ['index.html', 'README.md', 'CREDITS.md', 'LICENSE_CC0_ASSETS.md',
               'LICENSE_MAKEHUMAN.md', 'LICENSE_QUATERNIUS_CC0.txt', 'LICENSE_THREE.txt']
FILES = ['.gitattributes', *BUILD_FILES, 'build-info.json', 'capture-info.json', 'sravnenie.mp4',
         'qa-offline.json', 'qa-http.json', 'collision-report.json']


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
    build = json.loads((folder / 'build-info.json').read_text(encoding='utf-8'))
    if set(build['assetsSha256']) != set(BUILD_FILES):
        raise AssertionError('Unexpected build manifest')
    for name, expected in build['assetsSha256'].items():
        if digest(folder / name) != expected:
            raise AssertionError(f'Build hash mismatch: {name}')
    if (build['modelSha256'] != MODEL or digest(ROOT / 'work/male-leg-volume/male_leg_volume_trial.glb') != MODEL
            or build['wellSourceSha256'] != WELL or digest(ROOT / 'tools/male-rig-trial/well-source.mjs') != WELL
            or digest(ROOT / 'work/male-game-scene/index.html') != PREVIOUS):
        raise AssertionError('Model, well or previous scene is not the pinned source')
    html = digest(folder / 'index.html')
    capture = json.loads((folder / 'capture-info.json').read_text(encoding='utf-8'))
    if (capture['kind'] != 'stealth-comparison-fixed-timestep' or capture['trialHtmlSha256'] != html
            or capture['previousHtmlSha256'] != PREVIOUS or capture['videoSha256'] != digest(folder / 'sravnenie.mp4')):
        raise AssertionError('The comparison video does not match the two scenes')
    for name, transport in [('qa-offline.json', 'local file with network disabled'),
                            ('qa-http.json', 'same-origin HTTP')]:
        report = json.loads((folder / name).read_text(encoding='utf-8'))
        result = report['results']
        response = result['responsiveness']
        if (report['status'] != 'pass' or report['transport'] != transport or report['htmlSha256'] != html
                or result['parity']['cases'] != 80 or result['routes']['count'] != 48
                or result['interactions']['count'] != 12 or result['phaseSweep']['cases'] != 64
                or response['gaitCases'] != 72 or response['crouchEntries'] != 48 or response['reversals'] != 9
                or response['minGaitMove'] < .999 or response['crouchTiming']['0.9'] > .28
                or response['maxSpeedAt90'] > .401 or len(result['layouts']) != 4
                or not all(all(x.get(k) is True for k in ('groundTap', 'wellTap', 'cameraDrag')) for x in result['layouts'])
                or result['liveTouch'] != {'moved': True, 'crouchResponded': True, 'manual': False}):
            raise AssertionError(f'Incomplete, stale or failed browser report: {name}')
    collision = json.loads((folder / 'collision-report.json').read_text(encoding='utf-8'))
    if (collision['htmlSha256'] != html or collision['count'] != 96 or collision['vertices'] < 1000
            or len(collision['tests']) != 17 or any(x['poses'] for x in collision['tests'].values())):
        raise AssertionError('Incomplete, stale or failed sampled collision report')
    (folder / 'SHA256SUMS.txt').write_text(''.join(f'{digest(folder / n)}  {n}\n' for n in sorted(FILES)), encoding='utf-8')
    files = sorted([*FILES, 'SHA256SUMS.txt'])
    temporary = folder / ('.' + ARCHIVE + '.tmp')
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name in files:
                item = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                item.compress_type = zipfile.ZIP_DEFLATED
                item.create_system = 3
                item.external_attr = 0o100644 << 16
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
