#!/usr/bin/env python3
"""Make the offline review ZIP without including or modifying a project model."""
from pathlib import Path
import hashlib
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / 'tools/male-motion-candidates'
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / 'work/male-motion-candidates'
ARCHIVE = OUT / 'BladesOfWar_Vybor_Hodby_I_Bega.zip'
main = ['index.html', 'README.md', 'CREDITS.md', 'LICENSE_THREE.txt', 'build-info.json', 'walk_comparison.mp4', 'run_comparison.mp4']
files = [(name, OUT / name) for name in main]
files += [(f'sources/{p.name}', p) for p in sorted((TOOLS / 'sources').iterdir()) if p.is_file()]
checksums = ''.join(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {name}\n" for name, path in files)
(OUT / 'SHA256SUMS.txt').write_text(checksums, encoding='utf-8')
files.append(('SHA256SUMS.txt', OUT / 'SHA256SUMS.txt'))
with zipfile.ZipFile(ARCHIVE, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, path in files:
        if not path.is_file():
            raise FileNotFoundError(path)
        info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes(), compresslevel=9)
with zipfile.ZipFile(ARCHIVE) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == {name for name, _ in files}
    for name, path in files:
        assert archive.read(name) == path.read_bytes(), name
print(f'{ARCHIVE} ({ARCHIVE.stat().st_size} bytes)')
print('SHA-256:', hashlib.sha256(ARCHIVE.read_bytes()).hexdigest())
print(f'Verified {len(files)} entries byte-for-byte')
