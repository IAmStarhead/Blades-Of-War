#!/usr/bin/env python3
"""Compare fixed-camera WebGL captures and label/crop them without retouching."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont


def same_pixels(a: Path, b: Path, label: str, crop: tuple[int, int, int, int] | None = None) -> None:
    first = Image.open(a).convert('RGB')
    second = Image.open(b).convert('RGB')
    if crop:
        first, second = first.crop(crop), second.crop(crop)
    if first.size != second.size or ImageChops.difference(first, second).getbbox() is not None:
        raise AssertionError(f'Pixel comparison failed: {label}')


def verify(raw: Path) -> None:
    for name in ('well-front', 'well-angle', 'pair-without-female-front', 'pair-without-female-angle'):
        same_pixels(raw / f'before-{name}.png', raw / f'after-{name}.png', name)
    for side in ('left', 'right'):
        same_pixels(raw / f'before-{side}-hand-open.png', raw / f'after-{side}-hand-open.png', f'{side} neutral hand')
        same_pixels(raw / f'after-{side}-hand-open.png', raw / f'after-{side}-hand-reset.png', f'{side} hand reset')
    same_pixels(raw / 'eyes-open.png', raw / 'eyes-reset.png', 'blink reset')
    same_pixels(raw / 'before-face.png', raw / 'after-face.png', 'central face unchanged', (330, 140, 670, 800))
    for side in ('left', 'right'):
        a = np.asarray(Image.open(raw / f'before-{side}-ear.png').convert('RGB'))
        b = np.asarray(Image.open(raw / f'after-{side}-ear.png').convert('RGB'))
        if not np.any(a != b):
            raise AssertionError(f'No visible ear change on {side}')
    print('PASS: neutral hands and central face unchanged at fixed cameras; reopening eyes and hands is pixel-identical')
    print('PASS: well-only and paired-mode well match the preceding version pixel-for-pixel in two views')
    print('PASS: changes are visible in both fixed-camera ear captures')


def comparison(raw: Path, output: Path, first: str, second: str, crop: tuple[int, int, int, int],
               filename: str, captions: tuple[tuple[str, str], tuple[str, str]]) -> None:
    a = Image.open(raw / f'{first}.png').convert('RGB').crop(crop)
    b = Image.open(raw / f'{second}.png').convert('RGB').crop(crop)
    if a.size != b.size:
        raise ValueError('Mismatched captures')
    width, height = a.size
    header, gap = 68, 8
    result = Image.new('RGB', (2 * width + gap, height + header), '#151b20')
    result.paste(a, (0, header))
    result.paste(b, (width + gap, header))
    try:
        title = ImageFont.truetype('DejaVuSans.ttf', 20)
        note = ImageFont.truetype('DejaVuSans.ttf', 15)
    except OSError:
        title, note = ImageFont.load_default(), ImageFont.load_default()
    draw = ImageDraw.Draw(result)
    for x, (heading, detail) in zip((0, width + gap), captions):
        draw.text((x + 15, 8), heading, fill='#eedcba', font=title)
        draw.text((x + 15, 38), detail, fill='#aeb8bf', font=note)
    result.save(output / filename, optimize=True)


def stages(raw: Path, output: Path) -> None:
    crop = (220, 165, 780, 780)
    panels = [Image.open(raw / f'after-left-isolated-{weight}.png').convert('RGB').crop(crop)
              for weight in (0, 25, 50, 75, 100)]
    width, height = panels[0].size
    gap, header = 8, 68
    result = Image.new('RGB', (width * len(panels) + gap * (len(panels) - 1), height + header), '#151b20')
    try:
        title = ImageFont.truetype('DejaVuSans.ttf', 20)
        note = ImageFont.truetype('DejaVuSans.ttf', 15)
    except OSError:
        title, note = ImageFont.load_default(), ImageFont.load_default()
    draw = ImageDraw.Draw(result)
    for i, (panel, weight) in enumerate(zip(panels, (0, 25, 50, 75, 100))):
        x = i * (width + gap)
        result.paste(panel, (x, header))
        draw.text((x + 15, 8), f'СГИБ {weight}%', fill='#eedcba', font=title)
        draw.text((x + 15, 38), 'левая кисть изолирована для проверки', fill='#aeb8bf', font=note)
    result.save(output / '09-intermediate-hand.png', optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    verify(args.raw)
    if args.output is None:
        return
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    before = ('ДО', 'предыдущая проба')
    after_ear = ('ПОСЛЕ', 'слегка смягчённый край')
    comparison(args.raw, out, 'before-left-ear', 'after-left-ear', (230, 165, 770, 735),
               '01-left-ear.png', (before, after_ear))
    comparison(args.raw, out, 'before-left-ear-angle', 'after-left-ear-angle', (230, 165, 770, 735),
               '02-left-ear-angle.png', (before, after_ear))
    comparison(args.raw, out, 'before-both-fists', 'after-both-fists', (120, 140, 880, 760),
               '03-both-hands.png', (("ДО", "обе кисти, прежний хват"), ("ПОСЛЕ", "обе кисти, новый хват")))
    for side, filename, description in [('left', '04-left-hand.png', 'левая кисть, тыльная сторона'),
                                        ('right', '05-right-hand.png', 'правая кисть, тыльная сторона')]:
        comparison(args.raw, out, f'before-{side}-hand-fist', f'after-{side}-hand-fist', (220, 100, 780, 820),
                   filename, (('ДО', description), ('ПОСЛЕ', description)))
    comparison(args.raw, out, 'before-left-hand-front', 'after-left-hand-front', (220, 100, 780, 820),
               '06-hand-angle.png', (('ДО', 'левая кисть спереди'), ('ПОСЛЕ', 'тот же ракурс')))
    for side, filename, description in [('left', '07-left-palm.png', 'левая кисть изолирована'),
                                        ('right', '08-right-palm.png', 'правая кисть изолирована')]:
        comparison(args.raw, out, f'before-{side}-isolated-100', f'after-{side}-isolated-100', (220, 165, 780, 780),
                   filename, (('ДО · ЛАДОНЬ', description), ('ПОСЛЕ · ЛАДОНЬ', description)))
    stages(args.raw, out)
    comparison(args.raw, out, 'before-right-ear', 'after-right-ear', (230, 165, 770, 735),
               '10-right-ear.png', (before, after_ear))
    for name in ('scene-front', 'scene-angle', 'well-front', 'well-angle', 'figure-front'):
        shutil.copyfile(args.raw / f'after-{name}.png', out / f'{name}.png')
    print(f'PASS: real same-camera comparisons and unretouched review captures in {out}')


if __name__ == '__main__':
    main()
