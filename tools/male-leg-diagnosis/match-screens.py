#!/usr/bin/env python3
"""Locate the two supplied phone screenshots in the published split-screen video.

Specific to their 1080x2340 media-viewer layout and this 1280x428 video. No
screenshot is bundled or uploaded. Requires numpy, Pillow and ffmpeg.
Example: python match-screens.py --ffmpeg /path/to/ffmpeg screenshot1.jpg screenshot2.jpg
"""
from __future__ import annotations
import argparse
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('screenshots', nargs='+', type=Path)
parser.add_argument('--ffmpeg', default='ffmpeg')
parser.add_argument('--video', type=Path, default=REPO / 'work/male-stealth-tuning/sravnenie.mp4')
args = parser.parse_args()

def mask(a):
    a = a.astype(np.int16)
    return (a[:, :, 0] > 45) & (a[:, :, 0] - a[:, :, 1] > 5) & (a[:, :, 0] - a[:, :, 2] > 7)

targets = []
for filename in args.screenshots:
    with Image.open(filename) as image:
        if image.size != (1080, 2340):
            raise ValueError(f'Expected the original 1080x2340 phone screenshot: {filename}')
        # Exclude the media UI; the phone image is a horizontal crop of the
        # right-hand 640x428 panel in the original video.
        image = image.convert('RGB').crop((0, 492, 1080, 1769)).resize((362, 428), Image.Resampling.LANCZOS)
    m = mask(np.asarray(image))[70:425, :]
    targets.append((filename.name, m, np.fft.rfft(m, n=1024, axis=1), m.sum()))

proc = subprocess.Popen([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-i', str(args.video),
                         '-vf', 'crop=640:428:640:0,format=rgb24', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
results = [[] for _ in targets]
size = 640 * 428 * 3
for frame in range(450):
    chunks = bytearray()
    while len(chunks) < size:
        chunk = proc.stdout.read(size - len(chunks))
        if not chunk:
            break
        chunks.extend(chunk)
    if len(chunks) != size:
        raise RuntimeError(f'Video ended early at frame {frame}')
    a = mask(np.frombuffer(chunks, np.uint8).reshape(428, 640, 3))[70:425, :]
    af = np.fft.rfft(a, n=1024, axis=1)
    cs = np.concatenate([[0], np.cumsum(a.sum(axis=0))])
    within = cs[362:] - cs[:-362]
    for index, (_, _, bf, bsum) in enumerate(targets):
        intersections = np.fft.irfft((af * bf.conj()).sum(axis=0), n=1024)[:279]
        scores = intersections / (within + bsum - intersections + 1e-6)
        x = int(np.argmax(scores))
        results[index].append((float(scores[x]), frame, x))
proc.stdout.close()
if proc.wait() != 0:
    raise RuntimeError('ffmpeg failed')
for (name, *_), rows in zip(targets, results):
    print(f'\n{name}: best (mask IoU, frame index, horizontal crop offset)')
    for score, frame, offset in sorted(rows, reverse=True)[:12]:
        print(f'  {score:.6f}  {frame:3d}  {offset:3d}')
