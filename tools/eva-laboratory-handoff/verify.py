#!/usr/bin/env python3
"""Verify ZIPs, original asset bytes and links after merging into a fresh repo."""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import re
import stat
import struct
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

import build


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--result', type=Path, default=build.OUTPUT)
    args = parser.parse_args()
    art = ['02-white-pod-chamber.png', '03-white-research-hub.png',
           '04-eva-patient-gown.png', '05-eva-security-uniform.png']
    review = ['01-front.png', '02-front-ear-detail.png', '03-left-ear.png',
              '04-right-ear.png', '05-three-quarter.png', '06-back.png']
    expected = {
        '01_game_documents.zip': {'README.md', 'CHARACTER_DESIGN.md', 'NAME_CHECK.md', 'TRANSFER_NOTE.md'},
        '02_concept_art.zip': {'concept-art/README.md', *(f'concept-art/{x}' for x in art)},
        '03_heroine_model.zip': {
            'models/heroine/README.md', 'models/heroine/female_A_ears_refined.glb',
            'models/heroine/female_A_eyes_refined.glb', 'models/heroine/Heroine_Showcase.html',
            'models/heroine/LICENSE_MAKEHUMAN_ASSETS.md', 'models/heroine/LICENSE_THREEJS.md',
            *(f'models/heroine/review/{x}' for x in review),
        },
    }
    sums = (args.result / 'SHA256SUMS').read_text('ascii').splitlines()
    manifest = {}
    for line in sums:
        value, name = line.split('  ', 1)
        require(name not in manifest and re.fullmatch(r'[0-9a-f]{64}', value) is not None, 'Invalid checksum manifest')
        manifest[name] = value
    require(set(manifest) == set(expected), 'Checksum manifest does not list exactly three archives')

    all_files: dict[str, bytes] = {}
    for name, members in expected.items():
        data = (args.result / name).read_bytes()
        require(digest(data) == manifest[name], f'Archive checksum mismatch: {name}')
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            require(archive.testzip() is None, f'CRC error in {name}')
            entries = archive.infolist()
            names = [entry.filename for entry in entries]
            require(len(names) == len(set(names)) and set(names) == members, f'Unexpected members in {name}')
            for entry in entries:
                path = PurePosixPath(entry.filename)
                mode = entry.external_attr >> 16
                require(not path.is_absolute() and '..' not in path.parts and '\\' not in entry.filename
                        and stat.S_ISREG(mode), f'Unsafe ZIP member: {entry.filename}')
                require(entry.filename not in all_files, f'Archives overwrite each other: {entry.filename}')
                all_files[entry.filename] = archive.read(entry)
        print(f'PASS: {name}, {len(members)} files, CRC and SHA-256')

    mappings = {
        **{f'concept-art/{name}': build.GAME + 'concept-art/' + name for name in art},
        **{f'models/heroine/review/{name}': build.EAR + 'review/' + name for name in review},
        'models/heroine/female_A_ears_refined.glb': build.EAR + 'female_A_ears_refined.glb',
        'models/heroine/female_A_eyes_refined.glb': build.EYE + 'female_A_eyes_refined.glb',
        'models/heroine/LICENSE_MAKEHUMAN_ASSETS.md': 'tools/model-a-refinement/makehuman/LICENSE.ASSETS.md',
        'models/heroine/LICENSE_THREEJS.md': 'tools/eva-laboratory-handoff/licenses/THREE_R187_LICENSE.txt',
    }
    for destination, source in mappings.items():
        require(digest(all_files[destination]) == build.SHA256[source], f'Changed asset: {destination}')
    for name in ('female_A_ears_refined.glb', 'female_A_eyes_refined.glb'):
        glb = all_files[f'models/heroine/{name}']
        magic, version, length = struct.unpack('<4sII', glb[:12])
        require(magic == b'glTF' and version == 2 and length == len(glb), f'Invalid GLB header: {name}')
    for name in art:
        require(all_files['concept-art/' + name].startswith(b'\x89PNG\r\n\x1a\n'), f'Invalid PNG: {name}')
    model = all_files['models/heroine/female_A_ears_refined.glb']
    html = all_files['models/heroine/Heroine_Showcase.html']
    require(html.count(base64.b64encode(model)) == 1, 'Viewer embeds the wrong model')
    with zipfile.ZipFile(build.ROOT / build.EAR / 'female_A_ears_refined_and_well.zip') as original:
        before = original.read('BladesOfWar_Showcase.html').decode('utf-8')
    after = before.replace('Blades of War — проба ушей героини', 'Просмотр героини — проба ушей')
    after = after.replace('<span class="mark" aria-hidden="true">B</span>', '<span class="mark" aria-hidden="true">3D</span>')
    after = after.replace('<h1>BLADES OF WAR</h1>', '<h1>ПРОБА ГЕРОИНИ</h1>')
    require(html == after.encode('utf-8'), 'Viewer differs beyond the three display labels')
    print('PASS: selected art, screenshots, both GLBs and licenses match their sources; viewer embeds the delivered GLB')

    with tempfile.TemporaryDirectory(prefix='laboratory-handoff-') as directory:
        root = Path(directory).resolve()
        for name, data in all_files.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        broken = []
        for md in root.rglob('*.md'):
            for target in re.findall(r'\]\(([^)]+)\)', md.read_text('utf-8')):
                parsed = urlsplit(target)
                if parsed.scheme or parsed.netloc or not parsed.path:
                    continue
                path = (md.parent / unquote(parsed.path)).resolve()
                if not path.is_relative_to(root) or not path.exists():
                    broken.append(f'{md.relative_to(root)} -> {target}')
        require(not broken, 'Broken relative Markdown links: ' + ', '.join(broken))
        concept = (root / 'README.md').read_text('utf-8')
        design = (root / 'CHARACTER_DESIGN.md').read_text('utf-8')
        require(all(term in concept for term in ('Gen', 'Джин', 'станции', '1280×720', 'Не следует считать клонирование')),
                'Game concepts or open decisions disappeared from the document')
        require(all(term in design for term in ('940MX', 'i3-7100U', 'длинную', 'короче', 'ушей')),
                'Target-device or design context is missing')
        print(f'PASS: all {len(all_files)} files extracted together without overwrites; relative Markdown links resolve')
    print('NOTE: package checks do not establish artistic approval or performance on the target laptop.')


if __name__ == '__main__':
    main()
