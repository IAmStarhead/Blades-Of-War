#!/usr/bin/env python3
"""Build a small, reproducible ZIP of this trial, not the whole repository.

Usage: python3 tools/male-idle-stop-trial/package.py [--output /tmp/trial.zip]
The scene itself is byte-identical to the tested page. Only two links to the
unpackaged previous scene are removed from the standalone comparison page.
"""
from __future__ import annotations

import argparse
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
TRIAL = ROOT / 'work/male-idle-stop-trial'
DEFAULT = TRIAL / 'BladesOfWar_Ozhidanie_i_Ostanovka.zip'
PREVIOUS = ROOT / 'work/male-stealth-posture-trial/index.html'
MODEL_SHA = 'eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484'
WELL_SHA = '62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5'
PREVIOUS_SHA = 'f0ed071fdf6e466ccaaa0ae6eab4410b11ca4bfd9de4095af9288369734046f8'
VIDEO_SHA = {
    'comparison.mp4': '970425589c9d9cec28cd81725ec7e45e4ed5dc5f9570f7ca17c8bd374bc4be7c',
    'idle-comparison.mp4': 'c2eca37f6462190805e90f13869854cfe15e6e3ac692d8be779f1cbe9dbc1a44',
}
FILES = [
    'index.html', 'comparison.mp4', 'idle-comparison.mp4',
    'evidence/idle-poster.jpg', 'evidence/stop-poster.jpg',
    'CREDITS.md', 'INHERITED_CREDITS.md', 'LICENSE.ASSETS.md', 'LICENSE.CODE.md',
    'LICENSE_ANNY_APACHE-2.0.txt', 'LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md',
    'LICENSE_QUATERNIUS_CC0.txt', 'LICENSE_THREE.txt', 'NOTICE_HUMANMOTIONCRAFT.txt',
    'qa-offline.json', 'qa-http.json', 'foot-report.json', 'collision-report.json',
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
    """Every local link in the packaged pages/docs must resolve inside ZIP."""
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
    for path, expected in [(ROOT / 'work/male-leg-volume/male_leg_volume_trial.glb', MODEL_SHA),
                           (ROOT / 'tools/male-rig-trial/well-source.mjs', WELL_SHA),
                           (PREVIOUS, PREVIOUS_SHA)]:
        if sha(path.read_bytes()) != expected:
            raise AssertionError(f'Unexpected source: {path}')

    files = {name: (TRIAL / name).read_bytes() for name in FILES}
    html = sha(files['index.html'])
    for name, transport in [('qa-offline.json', 'local file with network disabled'),
                            ('qa-http.json', 'same-origin HTTP')]:
        report = json.loads(files[name])
        results = report['results']
        if not (report['status'] == 'pass' and report['transport'] == transport
                and report['htmlSha256'] == html and results['gaitParity']['cases'] == 80
                and results['transitions']['cases'] == 48 and results['interruptions']['cases'] == 10
                and len(results['layouts']) == 4 and results['liveTouch']['stopped']):
            raise AssertionError(f'Stale or failed test report: {name}')
    collision = json.loads(files['collision-report.json'])
    feet = json.loads(files['foot-report.json'])
    if not (collision['htmlSha256'] == html and collision['count'] == 230
            and all(value['poses'] == 0 for value in collision['tests'].values())
            and feet['htmlSha256'] == html and len(feet['rows']) == 16):
        raise AssertionError('Stale or incomplete sampled collision/foot report')
    for name, expected in VIDEO_SHA.items():
        if sha(files[name]) != expected:
            raise AssertionError(f'Unexpected comparison video: {name}')

    original = (TRIAL / 'study.html').read_text(encoding='utf-8')
    link1 = '<a href="../male-stealth-posture-trial/index.html">сохранена отдельно</a>'
    link2 = '<a href="../male-stealth-posture-trial/index.html">Прежняя сцена</a>'
    if original.count(link1) != 1 or original.count(link2) != 1:
        raise AssertionError('Standalone comparison links have changed; review packaging')
    standalone = original.replace(link1, 'сохранена в репозитории и не входит в этот архив').replace(link2, '')
    files['study.html'] = standalone.encode('utf-8')
    files['README.md'] = (HERE / 'README-archive.md').read_bytes()
    check_links(files)
    files['SHA256SUMS.txt'] = ''.join(f'{sha(files[name])}  {name}\n' for name in sorted(files)).encode('utf-8')

    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.idle-stop-', suffix='.zip', dir=output.parent)
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
        os.replace(temporary, output)
    finally:
        Path(temporary).unlink(missing_ok=True)
    print(f'PASS: {len(files)} verified files; local links resolve; previous scene is not packaged')
    print(f'{output}: {output.stat().st_size} bytes; SHA-256 {sha(output.read_bytes())}')


if __name__ == '__main__':
    main()
