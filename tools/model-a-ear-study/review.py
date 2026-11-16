#!/usr/bin/env python3
"""Make labelled comparison panels from unpainted same-camera screenshots."""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont


def panel(raw: Path, output: Path, view: str, crop: tuple[int, int, int, int],
          filename: str, note: str, scale: int = 1) -> None:
    images = [Image.open(raw / f'{state}-{view}.png').convert('RGB').crop(crop) for state in ('before', 'after')]
    if scale != 1:
        images = [im.resize((im.width * scale, im.height * scale), Image.Resampling.NEAREST) for im in images]
    w, h = images[0].size
    gap, header = 8, 66
    result = Image.new('RGB', (w * 2 + gap, h + header), '#151b20')
    try:
        heading = ImageFont.truetype('DejaVuSans.ttf', 21)
        detail = ImageFont.truetype('DejaVuSans.ttf', 15)
    except OSError:
        heading = detail = ImageFont.load_default()
    draw = ImageDraw.Draw(result)
    for i, (im, label) in enumerate(zip(images, ('ДО · исходная модель', 'ПОСЛЕ · проба ушей'))):
        x = i * (w + gap)
        result.paste(im, (x, header))
        draw.text((x + 13, 7), label, font=heading, fill='#eedcba')
        draw.text((x + 13, 39), note, font=detail, fill='#aeb8bf')
    result.save(output / filename, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    before = Image.open(args.raw / 'before-front.png').convert('RGB')
    after = Image.open(args.raw / 'after-front.png').convert('RGB')
    diff = np.any(np.asarray(before) != np.asarray(after), axis=2)
    yy, xx = np.where(diff)
    if not (len(xx) > 300 and xx.min() > 200 and xx.max() < 800
            and yy.min() > 275 and yy.max() < 650 and not np.any(diff[:, 315:685])):
        raise AssertionError(f'Unexpected face-image difference: {len(xx)}, bounds x={xx.min()}..{xx.max()}, y={yy.min()}..{yy.max()}')
    hand0 = Image.open(args.raw / 'before-hand.png').convert('RGB')
    hand1 = Image.open(args.raw / 'after-hand.png').convert('RGB')
    if ImageChops.difference(hand0, hand1).getbbox() is not None:
        raise AssertionError('The unchanged fist render differs')
    args.output.mkdir(parents=True, exist_ok=True)
    panel(args.raw, args.output, 'front', (225, 80, 775, 820), '01-front.png', 'анфас · одинаковые камера и свет')
    panel(args.raw, args.output, 'front', (220, 395, 320, 590), '02-front-ear-detail.png',
          'фрагмент анфас · увеличено ×3', scale=3)
    panel(args.raw, args.output, 'left-ear', (205, 190, 695, 740), '03-left-ear.png', 'левое ухо · одинаковый ракурс')
    panel(args.raw, args.output, 'right-ear', (305, 190, 795, 740), '04-right-ear.png', 'правое ухо · одинаковый ракурс')
    panel(args.raw, args.output, 'angle', (405, 215, 965, 740), '05-three-quarter.png', 'три четверти · одинаковый ракурс')
    panel(args.raw, args.output, 'back', (225, 80, 775, 820), '06-back.png', 'вид сзади · одинаковый ракурс')
    print(f'PASS: {len(xx)} changed front pixels at the ears/adjacent root; center face and fist renders are identical')
    print(f'PASS: six comparisons (cropping/labels only; no retouching) in {args.output}')


if __name__ == '__main__':
    main()
