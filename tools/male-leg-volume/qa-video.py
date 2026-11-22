#!/usr/bin/env python3
"""Decode every frame; catch blank/frozen captures, not artistic defects."""
import argparse
import hashlib
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WIDTH, HEIGHT = 64, 36
FRAME_BYTES = WIDTH * HEIGHT * 3
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', nargs='?', type=Path, default=ROOT / 'work/male-leg-volume')
folder = parser.parse_args().output.resolve()
ffmpeg = os.environ.get('FFMPEG_BIN', 'ffmpeg')
clips = {'uphill_walk.mp4': 210, 'uphill_run.mp4': 210, 'uphill_transition.mp4': 180, 'uphill_feet.mp4': 180, 'leg_comparison.mp4': 180}
for name, frames in clips.items():
    result = subprocess.run([ffmpeg, '-v', 'error', '-i', str(folder / name), '-map', '0:v:0',
                             '-vf', f'scale={WIDTH}:{HEIGHT}', '-pix_fmt', 'rgb24',
                             '-f', 'rawvideo', 'pipe:1'], capture_output=True, check=True)
    if len(result.stdout) != FRAME_BYTES * frames:
        raise AssertionError(f'{name}: unexpected decoded length {len(result.stdout)}')
    hashes = set()
    for i in range(frames):
        frame = result.stdout[i * FRAME_BYTES:(i + 1) * FRAME_BYTES]
        pixel = frame[(5 * WIDTH + 2) * 3:(5 * WIDTH + 2) * 3 + 3]
        if sum(pixel) < 60:
            raise AssertionError(f'{name}: black 3D background at frame {i}: {list(pixel)}')
        pane = b''.join(frame[(y * WIDTH + 16) * 3:(y * WIDTH + 48) * 3] for y in range(4, 33))
        hashes.add(hashlib.sha256(pane).digest())
    # The route deliberately stops at the upper platform, leaving a short hold.
    if len(hashes) < frames * .70:
        raise AssertionError(f'{name}: too few distinct central frames ({len(hashes)}/{frames})')
    print(f'PASS {name}: {frames} decoded frames, no blank background, {len(hashes)} distinct central frames')
