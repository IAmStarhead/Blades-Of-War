#!/usr/bin/env python3
"""Build a compact, deterministic ZIP of this trial, not the repository.

Usage: python3 tools/male-unarmed-combat-trial/package.py [--output /tmp/trial.zip]
The included reports must describe the exact current scene and video.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import posixpath
import re
import tempfile
from urllib.parse import unquote, urlsplit
import zipfile

ROOT = Path(__file__).resolve().parents[2]
TRIAL = ROOT / 'work/male-unarmed-combat-trial'
DEFAULT = TRIAL / 'BladesOfWar_Bez_Oruzhia.zip'
MODEL = 'eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484'
SOURCES = {
    'work/male-leg-volume/male_leg_volume_trial.glb': MODEL,
    'tools/male-rig-trial/well-source.mjs': '62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5',
    'work/male-stealth-posture-trial/index.html': 'f0ed071fdf6e466ccaaa0ae6eab4410b11ca4bfd9de4095af9288369734046f8',
    'work/male-idle-stop-trial/index.html': 'd72670574cdb60d700c5fbd521ccc04da48768b9d6993185b05f0caff3c94ed9',
    'work/male-natural-motion-trial/index.html': 'a709eb7a397440c3ea9195cc80b67d1f9c021a075e52f4762496dce2d9525636',
    'tools/male-unarmed-combat-trial/source/Kick-retargeted-30fps.glb': '3939578c4029acbd529fd433689858b542b438d01be8783f30686b01d509c262',
    'tools/male-library-motion/source/AnimationLibrary_Godot_Standard.gltf': '0ff075c7ad6855c5c2c37a171592ee8f0d6ab2f58259e2be77a9b63dd8027765',
    'tools/male-library-motion/source/AnimationLibrary_Godot_Standard.bin': '6e65377d81558333c4093dbb144a48fd19019343d82b1a3a7992a98ec0e0543c',
}
FILES = [
    'index.html', 'combat-preview.mp4', 'README.md', 'CREDITS.md', 'INHERITED_CREDITS.md',
    'LICENSE.ASSETS.md', 'LICENSE.CODE.md', 'LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md',
    'LICENSE_QUATERNIUS_CC0.txt', 'LICENSE_THREE.txt',
    'qa-offline.json', 'qa-http.json', 'qa-video-offline.json', 'qa-video-http.json',
    'gait-report.json', 'collision-report.json',
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Links(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.ids: set[str] = set()

    def handle_starttag(self, _tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for key, value in attrs:
            if value and key in ('href', 'src', 'poster'):
                self.links.append(value)
            if value and key == 'id':
                self.ids.add(value)


def check_links(files: dict[str, bytes]) -> None:
    for name, data in files.items():
        if name.endswith('.html'):
            parser = Links()
            parser.feed(data.decode('utf-8'))
            values, ids = parser.links, parser.ids
        elif name.endswith('.md'):
            values, ids = re.findall(r'\]\(([^)]+)\)', data.decode('utf-8')), set()
        else:
            continue
        for value in values:
            parsed = urlsplit(value)
            if parsed.scheme or parsed.netloc:
                continue
            if not parsed.path:
                if name.endswith('.html') and parsed.fragment and parsed.fragment not in ids:
                    raise AssertionError(f'{name}: missing anchor {value}')
                continue
            target = posixpath.normpath(posixpath.join(posixpath.dirname(name), unquote(parsed.path)))
            if target not in files:
                raise AssertionError(f'{name}: missing local file {value}')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT)
    output = parser.parse_args().output.resolve()
    if output == ROOT or (output.is_relative_to(ROOT) and output != DEFAULT):
        raise ValueError('Use the dedicated ZIP path or a scratch path outside the repository')
    for name, expected in SOURCES.items():
        if sha((ROOT / name).read_bytes()) != expected:
            raise AssertionError(f'Unexpected input or earlier scene: {name}')
    files = {name: (TRIAL / name).read_bytes() for name in FILES}
    scene_hash, video_hash = sha(files['index.html']), sha(files['combat-preview.mp4'])
    model = re.search(rb"const MODEL_URI='data:model/gltf-binary;base64,([^']+)'", files['index.html'])
    if not model or sha(base64.b64decode(model[1], validate=True)) != MODEL:
        raise AssertionError('Wrong embedded model')
    for name, transport in [('qa-offline.json', 'local file with network disabled'), ('qa-http.json', 'same-origin HTTP')]:
        report = json.loads(files[name]); r = report['results']
        if not (report['status'] == 'pass' and report['transport'] == transport and report['htmlSha256'] == scene_hash
                and r['parity']['cases'] == 80 and max(r['parity'][k] for k in ('bone', 'vertex', 'morph', 'floor')) < 1e-5
                and r['parity']['afterCombatCases'] == 20 and r['parity']['afterCombatMax'] < 1e-5
                and r['transitions']['cases'] == 72 and r['interruptions']['cases'] == 16
                and len(r['attacks']) == 4 and all(a['ended'] for a in r['attacks'])
                and len(r['keyboard']['braking']) == 2 and r['mouse']['cancelKick']
                and len(r['layouts']) == 4 and all(x['framingCases'] == 8 for x in r['layouts'])
                and not r['liveTouch']['manual']):
            raise AssertionError(f'Stale or failed scene report: {name}')
    for name, transport in [('qa-video-offline.json', 'local file with network disabled'), ('qa-video-http.json', 'same-origin HTTP')]:
        report = json.loads(files[name])
        if not (report['status'] == 'pass' and report['transport'] == transport and report['htmlSha256'] == scene_hash
                and report['videoSha256'] == video_hash and 32.9 < report['result']['duration'] < 33.1
                and report['result']['after'] > report['result']['seeked'] and report['range'] == (transport == 'same-origin HTTP')):
            raise AssertionError(f'Stale or failed video report: {name}')
    gait, collisions = json.loads(files['gait-report.json']), json.loads(files['collision-report.json'])
    if not (gait['htmlSha256'] == scene_hash and [x['mode'] for x in gait['rows']] == ['walk', 'run', 'combat']
            and all(x['episodes'] > 0 for x in gait['rows']) and collisions['htmlSha256'] == scene_hash
            and collisions['count'] == 327 and all(x['poses'] == 0 for x in collisions['tests'].values())):
        raise AssertionError('Stale or incomplete sampled gait/collision report')
    check_links(files)
    files['SHA256SUMS.txt'] = ''.join(f'{sha(files[n])}  {n}\n' for n in sorted(files)).encode('utf-8')
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix='.unarmed-', suffix='.zip', dir=output.parent)
    os.close(fd)
    try:
        with zipfile.ZipFile(temp_name, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name in sorted(files):
                item = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                item.compress_type = zipfile.ZIP_DEFLATED
                item.create_system = 3
                item.external_attr = 0o100644 << 16
                archive.writestr(item, files[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        with zipfile.ZipFile(temp_name) as archive:
            if archive.testzip() is not None or archive.namelist() != sorted(files):
                raise AssertionError('Archive integrity or entries failed')
            for name, data in files.items():
                if archive.read(name) != data:
                    raise AssertionError(f'Archive content changed: {name}')
        os.chmod(temp_name, 0o644)
        os.replace(temp_name, output)
    finally:
        Path(temp_name).unlink(missing_ok=True)
    print(f'PASS: {len(files)} verified trial files; all local links resolve; earlier versions unchanged.')
    print(f'{output}: {output.stat().st_size} bytes; SHA-256 {sha(output.read_bytes())}')


if __name__ == '__main__':
    main()
