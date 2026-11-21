#!/usr/bin/env python3
"""Decode every video frame; reject blank or frozen captures, not bad acting."""
import argparse
import hashlib
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WIDTH, HEIGHT, FRAMES = 64, 36, 255
FRAME_BYTES = WIDTH * HEIGHT * 3
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', nargs='?', type=Path, default=ROOT / 'work/male-gait-transition')
folder = parser.parse_args().output.resolve()
ffmpeg = os.environ.get('FFMPEG_BIN', 'ffmpeg')
for name in ('transition_preview.mp4', 'transition_feet.mp4'):
    video = folder / name
    result = subprocess.run([ffmpeg, '-v', 'error', '-i', str(video), '-map', '0:v:0',
                             '-vf', f'scale={WIDTH}:{HEIGHT}', '-pix_fmt', 'rgb24',
                             '-f', 'rawvideo', 'pipe:1'], capture_output=True, check=True)
    if len(result.stdout) != FRAME_BYTES * FRAMES:
        raise AssertionError(f'{name}: unexpected decoded length {len(result.stdout)}')
    hashes = set()
    for index in range(FRAMES):
        frame = result.stdout[index * FRAME_BYTES:(index + 1) * FRAME_BYTES]
        pixel = frame[(5 * WIDTH + 2) * 3:(5 * WIDTH + 2) * 3 + 3]
        if sum(pixel) < 60:
            raise AssertionError(f'{name}: black 3D background at frame {index}: {list(pixel)}')
        pane = b''.join(frame[(y * WIDTH + 16) * 3:(y * WIDTH + 48) * 3] for y in range(4, 33))
        hashes.add(hashlib.sha256(pane).digest())
    if len(hashes) < 200:
        raise AssertionError(f'{name}: too few distinct central frames ({len(hashes)})')
    print(f'PASS {name}: {FRAMES} decoded frames, no blank background, {len(hashes)} distinct central frames')
