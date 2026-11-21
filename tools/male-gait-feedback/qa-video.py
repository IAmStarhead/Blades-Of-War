#!/usr/bin/env python3
"""Decode every video frame and reject blank capture panes or frozen output.

A healthy H.264 container can still hold black frames when headless canvas
resources fail. This is a technical capture check, not an aesthetic judgment.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WIDTH, HEIGHT, FRAMES = 64, 36, 180
FRAME_BYTES = WIDTH * HEIGHT * 3


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', nargs='?', type=Path, default=ROOT / 'work/male-gait-feedback')
    folder = parser.parse_args().output.resolve()
    ffmpeg = os.environ.get('FFMPEG_BIN', 'ffmpeg')
    for name in ('walk', 'run', 'feet'):
        video = folder / f'{name}_before_after.mp4'
        result = subprocess.run([ffmpeg, '-v', 'error', '-i', str(video), '-map', '0:v:0',
                                 '-vf', f'scale={WIDTH}:{HEIGHT}', '-pix_fmt', 'rgb24',
                                 '-f', 'rawvideo', 'pipe:1'], capture_output=True, check=True)
        if len(result.stdout) != FRAME_BYTES * FRAMES:
            raise AssertionError(f'{video.name}: unexpected decoded length {len(result.stdout)}')
        panel_hashes = (set(), set())
        for index in range(FRAMES):
            frame = result.stdout[index * FRAME_BYTES:(index + 1) * FRAME_BYTES]
            # Chosen points lie in the 2D margin and at the top-left of each 3D
            # panel, clear of the moving model and text at every sampled phase.
            for x, y, minimum, label in ((0, 0, 35, 'surround'), (2, 6, 60, 'left pane'), (33, 6, 60, 'right pane')):
                rgb = frame[(y * WIDTH + x) * 3:(y * WIDTH + x) * 3 + 3]
                if sum(rgb) < minimum:
                    raise AssertionError(f'{video.name}: black {label} at frame {index} ({index / 30:.2f}s), RGB={list(rgb)}')
            for hashes, (x1, x2) in zip(panel_hashes, ((2, 31), (33, 62))):
                pane = b''.join(frame[(y * WIDTH + x1) * 3:(y * WIDTH + x2) * 3] for y in range(6, 30))
                hashes.add(hashlib.sha256(pane).digest())
        if min(map(len, panel_hashes)) < 90:
            raise AssertionError(f'{video.name}: too few distinct pane frames: {[len(h) for h in panel_hashes]}')
        print(f'PASS {video.name}: {FRAMES} decoded frames, no black surround/panes, '
              f'{len(panel_hashes[0])}/{len(panel_hashes[1])} distinct downsampled pane frames')


if __name__ == '__main__':
    main()
