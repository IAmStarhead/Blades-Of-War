#!/usr/bin/env python3
"""Create a reproducible, verified zip of the repaired showcase."""
import argparse
import base64
import hashlib
import os
import re
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, default=ROOT / 'work/character-showcase/prototype')
parser.add_argument('--output', type=Path, default=ROOT / 'work/character-showcase/BladesOfWar_Adam_Eve_Showcase_Repaired.zip')
args = parser.parse_args()
source_zip = ROOT / 'BladesOfWar_Adam_Eve_Showcase (3).zip'
if args.output.resolve() == source_zip.resolve():
    raise ValueError('Refusing to overwrite the original archive')
if args.output.suffix.lower() != '.zip':
    raise ValueError('The output must have a .zip extension')

names = ['BladesOfWar_Showcase.html', 'assets/models/female_fixed.glb', 'assets/models/male_fixed.glb', 'README.txt']
files = {name: (args.input / name).read_bytes() for name in names}
html = files['BladesOfWar_Showcase.html'].decode('utf-8')
for variable, name in [('FEMALE_URI', names[1]), ('MALE_URI', names[2])]:
    embedded = re.search(r'const ' + variable + r'\s*=\s*"data:model/gltf-binary;base64,([^\"]+)";', html)
    if not embedded or base64.b64decode(embedded.group(1)) != files[name]:
        raise ValueError(f'HTML and external model differ: {name}')

args.output.parent.mkdir(parents=True, exist_ok=True)
fd, tmp = tempfile.mkstemp(prefix='.showcase-package-', suffix='.tmp', dir=args.output.parent)
os.close(fd)
try:
    with zipfile.ZipFile(tmp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in names:
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, files[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(tmp) as archive:
        if archive.testzip() is not None or archive.namelist() != names:
            raise ValueError('Archive verification failed')
        for name in names:
            if archive.read(name) != files[name]:
                raise ValueError(f'Archive contents differ: {name}')
    os.chmod(tmp, 0o644)
    os.replace(tmp, args.output)
finally:
    if os.path.exists(tmp):
        os.unlink(tmp)
sha = hashlib.sha256(args.output.read_bytes()).hexdigest()
print(f'Created {args.output} ({args.output.stat().st_size} bytes), SHA-256 {sha}')
