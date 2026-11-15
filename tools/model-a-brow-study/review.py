#!/usr/bin/env python3
"""Verify and label unretouched fixed-camera comparisons of the brow change."""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont


def compare(raw: Path, output: Path, view: str, crop: tuple[int, int, int, int], filename: str) -> None:
    panels = [Image.open(raw / f'{name}-{view}.png').convert('RGB').crop(crop) for name in ('before', 'after')]
    width, height = panels[0].size
    gap, header = 8, 64
    result = Image.new('RGB', (2 * width + gap, height + header), '#151b20')
    try:
        title = ImageFont.truetype('DejaVuSans.ttf', 20)
        detail = ImageFont.truetype('DejaVuSans.ttf', 15)
    except OSError:
        title = detail = ImageFont.load_default()
    draw = ImageDraw.Draw(result)
    for i, (panel, heading, note) in enumerate(zip(
            panels, ('ДО', 'ПОСЛЕ'), ('предыдущая проба кистей', 'рисунок бровей немного ниже'))):
        x = i * (width + gap)
        result.paste(panel, (x, header))
        draw.text((x + 14, 7), heading, fill='#eedcba', font=title)
        draw.text((x + 14, 37), note, fill='#aeb8bf', font=detail)
    result.save(output / filename, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    before = np.asarray(Image.open(args.raw / 'before-front.png').convert('RGB'))
    after = np.asarray(Image.open(args.raw / 'after-front.png').convert('RGB'))
    if before.shape != (900, 1000, 3) or before.shape != after.shape:
        raise AssertionError('Unexpected face screenshot dimensions')
    diff = np.any(before != after, axis=2)
    y, x = np.where(diff)
    if not (len(x) > 200 and x.min() > 250 and x.max() < 750 and y.min() > 250 and y.max() < 450):
        raise AssertionError(f'Unexpected front-view changed area: {len(x)} pixels')
    print(f'PASS: front view differs only around the brows: {len(x)} pixels, x={x.min()}..{x.max()}, y={y.min()}..{y.max()}')
    if ImageChops.difference(Image.open(args.raw / 'before-hand.png').convert('RGB'),
                             Image.open(args.raw / 'after-hand.png').convert('RGB')).getbbox() is not None:
        raise AssertionError('The preceding fist view changed')
    print('PASS: fixed-camera hand view is pixel-identical to the preceding fist trial')
    args.output.mkdir(parents=True, exist_ok=True)
    compare(args.raw, args.output, 'front', (225, 90, 775, 820), '01-front.png')
    compare(args.raw, args.output, 'angle', (90, 70, 810, 850), '02-angle.png')
    compare(args.raw, args.output, 'front', (270, 255, 730, 465), '03-brows-close.png')
    print(f'PASS: same-camera brow comparisons saved in {args.output}')


if __name__ == '__main__':
    main()
