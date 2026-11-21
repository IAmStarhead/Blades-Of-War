#!/usr/bin/env python3
"""Decode all frames and reject blank/frozen captures; not a motion-quality test."""
import argparse
import hashlib
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WIDTH, HEIGHT, FRAMES = 64, 36, 180
FRAME_BYTES = WIDTH * HEIGHT * 3

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', nargs='?', type=Path, default=ROOT / 'work/male-gait-limbs')
folder = parser.parse_args().output.resolve()
ffmpeg = os.environ.get('FFMPEG_BIN', 'ffmpeg')
for kind in ('walk', 'run', 'feet'):
    video = folder / f'{kind}_preview.mp4'
    result = subprocess.run([ffmpeg, '-v', 'error', '-i', str(video), '-map', '0:v:0',
                             '-vf', f'scale={WIDTH}:{HEIGHT}', '-pix_fmt', 'rgb24',
                             '-f', 'rawvideo', 'pipe:1'], capture_output=True, check=True)
    if len(result.stdout) != FRAME_BYTES * FRAMES:
        raise AssertionError(f'{video.name}: unexpected decoded length {len(result.stdout)}')
    hashes = set()
    for index in range(FRAMES):
        frame = result.stdout[index * FRAME_BYTES:(index + 1) * FRAME_BYTES]
        # Outside the text overlays, safely away from the central moving model.
        x, y = 2, 5
        pixel = frame[(y * WIDTH + x) * 3:(y * WIDTH + x) * 3 + 3]
        if sum(pixel) < 60:
            raise AssertionError(f'{video.name}: black 3D background at frame {index}: {list(pixel)}')
        pane = b''.join(frame[(y * WIDTH + 16) * 3:(y * WIDTH + 48) * 3] for y in range(4, 33))
        hashes.add(hashlib.sha256(pane).digest())
    if len(hashes) < 120:
        raise AssertionError(f'{video.name}: too few distinct central frames ({len(hashes)})')
    print(f'PASS {video.name}: {FRAMES} decoded frames, no blank background, {len(hashes)} distinct central frames')
