#!/usr/bin/env python3
"""Verify every archive entry and optionally rebuild using the same recorded videos."""
from __future__ import annotations
import argparse
import hashlib
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DEFAULT = ROOT / 'work/male-posture-fit'
ZIP = 'BladesOfWar_Osanka_I_Bedra_C.zip'

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', nargs='?', type=Path, default=DEFAULT)
    parser.add_argument('--rebuild', action='store_true')
    args = parser.parse_args()
    out = args.output.resolve()
    with zipfile.ZipFile(out / ZIP) as archive:
        names = archive.namelist()
        if len(names) != 19 or len(names) != len(set(names)):
            raise AssertionError('Unexpected archive entries')
        for name in names:
            if name.startswith('/') or '..' in Path(name).parts:
                raise AssertionError(f'Unsafe archive path: {name}')
            if archive.read(name) != (out / name).read_bytes():
                raise AssertionError(f'Archive entry differs from delivery: {name}')
        lines = archive.read('SHA256SUMS.txt').decode('utf-8').splitlines()
        for line in lines:
            digest, name = line.split('  ', 1)
            if hashlib.sha256(archive.read(name)).hexdigest() != digest:
                raise AssertionError(f'Checksum mismatch: {name}')
        if len(lines) != len(names) - 1:
            raise AssertionError('Incomplete checksum manifest')
    print(f'PASS: all {len(names)} archive entries match the delivery and checksum manifest; ZIP SHA-256 {sha(out / ZIP)}')
    if args.rebuild:
        with tempfile.TemporaryDirectory(prefix='bow-posture-fit-verify-') as tmp:
            target = Path(tmp)
            subprocess.run(['node', str(HERE / 'build.mjs'), '--output', str(target)], cwd=ROOT, check=True)
            for name in ('walk_before_after.mp4', 'run_before_after.mp4', 'capture-info.json'):
                shutil.copyfile(out / name, target / name)
            subprocess.run(['python3', str(HERE / 'package.py'), str(target)], cwd=ROOT, check=True)
            for name in names + [ZIP]:
                if sha(out / name) != sha(target / name):
                    raise AssertionError(f'Rebuild mismatch: {name}')
        print('PASS: model, standalone viewer and ZIP rebuild byte-for-byte with the same two captured video inputs')

if __name__ == '__main__':
    main()
