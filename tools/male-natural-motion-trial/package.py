#!/usr/bin/env python3
"""Package only the new movement trial, never a repository archive.

Usage: python3 tools/male-natural-motion-trial/package.py [--output /tmp/trial.zip]
All report hashes must match the exact scene. ZIP entries have stable timestamps.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import os
import posixpath
import re
import tempfile
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
TRIAL = ROOT / 'work/male-natural-motion-trial'
DEFAULT = TRIAL / 'BladesOfWar_Estestvennoe_Dvizhenie.zip'
MODEL_SHA = 'eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484'
WELL_SHA = '62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5'
PREVIOUS = {
    'work/male-stealth-posture-trial/index.html': 'f0ed071fdf6e466ccaaa0ae6eab4410b11ca4bfd9de4095af9288369734046f8',
    'work/male-idle-stop-trial/index.html': 'd72670574cdb60d700c5fbd521ccc04da48768b9d6993185b05f0caff3c94ed9',
}
FILES = [
    'index.html', 'study.html', 'movement.mp4',
    'evidence/people-walk.jpg', 'evidence/people-run.jpg', 'evidence/reference-walk-12.jpg', 'evidence/reference-run-9.jpg',
    'CREDITS.md', 'INHERITED_CREDITS.md', 'LICENSE.ASSETS.md', 'LICENSE.CODE.md',
    'LICENSE_ANNY_APACHE-2.0.txt', 'LICENSE_CC0_ASSETS.md', 'LICENSE_GAITLAB_MIT.txt',
    'LICENSE_MAKEHUMAN.md', 'LICENSE_QUATERNIUS_CC0.txt', 'LICENSE_THREE.txt',
    'LICENSE_WGVP_AGPL-3.0.txt', 'NOTICE_HUMANMOTIONCRAFT.txt',
    'qa-offline.json', 'qa-http.json', 'qa-study-offline.json', 'qa-study-http.json',
    'foot-report.json', 'gait-report.json', 'collision-report.json',
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class HTMLLinks(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.ids: set[str] = set()

    def handle_starttag(self, _tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, value in attrs:
            if value and name in ('href', 'src', 'poster'):
                self.links.append(value)
            elif value and name == 'id':
                self.ids.add(value)


def check_links(entries: dict[str, bytes]) -> None:
    """Ensure local HTML and Markdown links resolve within the package."""
    for name, data in entries.items():
        if name.endswith('.html'):
            parser = HTMLLinks()
            parser.feed(data.decode('utf-8'))
            values, ids = parser.links, parser.ids
        elif name.endswith('.md'):
            values = re.findall(r'\]\(([^)]+)\)', data.decode('utf-8'))
            ids = set()
        else:
            continue
        for value in values:
            url = urlsplit(value)
            if url.scheme or url.netloc:
                continue
            if not url.path:
                if name.endswith('.html') and url.fragment and url.fragment not in ids:
                    raise AssertionError(f'{name}: missing #{url.fragment}')
                continue
            target = posixpath.normpath(posixpath.join(posixpath.dirname(name), unquote(url.path)))
            if target not in entries:
                raise AssertionError(f'{name}: missing local file {value}')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT)
    output = parser.parse_args().output.resolve()
    if output == ROOT or (output.is_relative_to(ROOT) and output != DEFAULT):
        raise ValueError('Use the trial ZIP path or a scratch path outside the repository')
    for name, expected in {
        'work/male-leg-volume/male_leg_volume_trial.glb': MODEL_SHA,
        'tools/male-rig-trial/well-source.mjs': WELL_SHA,
        **PREVIOUS,
    }.items():
        if sha((ROOT / name).read_bytes()) != expected:
            raise AssertionError(f'Unexpected source or previous scene: {name}')

    files = {name: (TRIAL / name).read_bytes() for name in FILES}
    files['README.md'] = (HERE / 'README-archive.md').read_bytes()
    scene = sha(files['index.html'])
    embedded = re.search(rb"const MODEL_URI='data:model/gltf-binary;base64,([^']+)'", files['index.html'])
    if not embedded or sha(base64.b64decode(embedded[1], validate=True)) != MODEL_SHA:
        raise AssertionError('Packaged scene does not embed the unchanged model')
    for name, transport in [('qa-offline.json', 'local file with network disabled'), ('qa-http.json', 'same-origin HTTP')]:
        report = json.loads(files[name]); results = report['results']
        if not (report['status'] == 'pass' and report['transport'] == transport and report['htmlSha256'] == scene
                and results['transitions']['cases'] == 48 and results['interruptions']['cases'] == 10
                and len(results['realKeyboardAndStop']['restarts']) == 16 and results['mouse']['restartDuringStop']
                and len(results['layouts']) == 4 and all(x['restartDuringStop'] for x in results['layouts'])
                and results['liveTouch']['restartedDuringBrake'] and results['liveTouch']['stopped']):
            raise AssertionError(f'Stale or failed test report: {name}')
    for name, transport in [('qa-study-offline.json', 'local file with network disabled'), ('qa-study-http.json', 'same-origin HTTP')]:
        report = json.loads(files[name])
        if not (report['status'] == 'pass' and report['transport'] == transport and report['htmlSha256'] == scene
                and report['studySha256'] == sha(files['study.html']) and report['videoSha256'] == sha(files['movement.mp4'])
                and len(report['layouts']) == 3 and all(x['seek'] and x['play'] for x in report['layouts'])):
            raise AssertionError(f'Stale or failed reference-page report: {name}')
    collision, feet, gait = (json.loads(files[name]) for name in ['collision-report.json', 'foot-report.json', 'gait-report.json'])
    if not (collision['htmlSha256'] == scene and collision['count'] == 278
            and all(value['poses'] == 0 for value in collision['tests'].values())
            and feet['htmlSha256'] == scene and len(feet['rows']) == 16
            and gait['htmlSha256'] == scene and len(gait['rows']) == 2):
        raise AssertionError('Stale or incomplete sampled collision/foot report')
    check_links(files)
    files['SHA256SUMS.txt'] = ''.join(f'{sha(files[name])}  {name}\n' for name in sorted(files)).encode('utf-8')

    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.natural-motion-', suffix='.zip', dir=output.parent)
    os.close(fd)
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name in sorted(files):
                item = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                item.compress_type = zipfile.ZIP_DEFLATED
                item.create_system = 3
                item.external_attr = 0o100644 << 16
                archive.writestr(item, files[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None or archive.namelist() != sorted(files):
                raise AssertionError('Archive integrity or entries are wrong')
            for name in files:
                if archive.read(name) != files[name]:
                    raise AssertionError(f'Archive content differs: {name}')
        os.chmod(temporary, 0o644)
        os.replace(temporary, output)
    finally:
        Path(temporary).unlink(missing_ok=True)
    print(f'PASS: {len(files)} verified files; local links resolve; previous scenes are not packaged')
    print(f'{output}: {output.stat().st_size} bytes; SHA-256 {sha(output.read_bytes())}')


if __name__ == '__main__':
    main()
