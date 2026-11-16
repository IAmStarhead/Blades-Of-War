#!/usr/bin/env python3
"""Arrange actual WebGL screenshots: crop/resize and add labels, no retouching."""
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

WOMEN = [('eve', 'ЕВА'), ('north', 'СЕВЕРЯНКА'), ('central', 'ЦЕНТРАЛКА'),
         ('east', 'ЯПОНСКИЙ МОТИВ'), ('africa', 'АФРИКАНКА'), ('spain', 'ИСПАНСКИЙ ОБРАЗ')]
PAIRS = [('north', 'СЕВЕРЯНКА'), ('central', 'ЦЕНТРАЛКА'),
         ('east', 'ЯПОНИЯ'), ('africa', 'АФРИКАНКА')]
try:
    TITLE, DETAIL = ImageFont.truetype('DejaVuSans.ttf', 19), ImageFont.truetype('DejaVuSans.ttf', 14)
except OSError:
    TITLE = DETAIL = ImageFont.load_default()


def gallery(raw: Path, output: Path, view: str, crop: tuple[int, int, int, int],
            filename: str, note: str) -> None:
    width, height = crop[2] - crop[0], crop[3] - crop[1]
    gap, header = 8, 64
    result = Image.new('RGB', (len(WOMEN) * width + (len(WOMEN) - 1) * gap, height + header), '#151b20')
    draw = ImageDraw.Draw(result)
    for i, (key, heading) in enumerate(WOMEN):
        x = i * (width + gap)
        result.paste(Image.open(raw / f'v4-{key}-{view}.png').convert('RGB').crop(crop), (x, header))
        draw.text((x + 12, 7), heading, fill='#eedcba', font=TITLE)
        draw.text((x + 12, 37), note, fill='#aeb8bf', font=DETAIL)
    result.save(output / filename, optimize=True)


def comparison(raw: Path, output: Path, view: str, crop: tuple[int, int, int, int],
               width: int, filename: str) -> None:
    source_w, source_h = crop[2] - crop[0], crop[3] - crop[1]
    height = round(source_h * width / source_w)
    margin, header, between = 12, 58, 24
    block_w = 2 * width + margin
    result = Image.new('RGB', (2 * block_w + between, 2 * (height + header) + between), '#151b20')
    draw = ImageDraw.Draw(result)
    for i, (key, name) in enumerate(PAIRS):
        col, row = i % 2, i // 2
        x0, y0 = col * (block_w + between), row * (height + header + between)
        for j, version in enumerate(('v3', 'v4')):
            x = x0 + j * (width + margin)
            image = Image.open(raw / f'{version}-{key}-{view}.png').convert('RGB').crop(crop)
            result.paste(image.resize((width, height), Image.Resampling.LANCZOS), (x, y0 + header))
            draw.text((x + 6, y0 + 5), f'{name} · {version.upper()}', fill='#eedcba', font=TITLE)
            draw.text((x + 6, y0 + 32), 'одинаковые камера и свет', fill='#aeb8bf', font=DETAIL)
    result.save(output / filename, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for key, _ in WOMEN:
        img = np.asarray(Image.open(args.raw / f'v4-{key}-face.png').convert('RGB')).astype(np.int16)
        occupied = np.count_nonzero(np.max(np.abs(img[390, 225:775] - img[0, 0]), axis=1) > 15)
        if occupied < 300:
            raise AssertionError(f'{key}: unexpectedly distant face camera ({occupied} pixels)')
    for key, _ in PAIRS:
        a = np.asarray(Image.open(args.raw / f'v3-{key}-face.png').convert('RGB'))
        b = np.asarray(Image.open(args.raw / f'v4-{key}-face.png').convert('RGB'))
        changed = np.count_nonzero(np.any(a[100:800, 225:775] != b[100:800, 225:775], axis=2))
        if changed < 1_000:
            raise AssertionError(f'{key}: before/after face captures unexpectedly identical')
        print(f'PASS: {key} v3/v4 face screenshots differ at {changed:,} pixels')
    gallery(args.raw, args.output, 'face', (225, 25, 775, 820), '04-faces-front.png',
            'одинаковое относительное кадрирование')
    gallery(args.raw, args.output, 'angle', (90, 70, 810, 850), '05-faces-three-quarter.png',
            'одинаковое относительное кадрирование')
    gallery(args.raw, args.output, 'eyes', (80, 200, 920, 620), '06-eyes-and-brows.png', 'глаза и брови · одинаковый свет')
    gallery(args.raw, args.output, 'blink', (80, 270, 920, 620), '07-blink.png', 'закрытые глаза · морф 1,00')
    gallery(args.raw, args.output, 'blink-half', (80, 270, 920, 620), '14-blink-half.png', 'моргание · морф 0,50')
    gallery(args.raw, args.output, 'blink-three-quarter', (80, 270, 920, 620), '15-blink-three-quarter.png', 'моргание · морф 0,75')
    gallery(args.raw, args.output, 'ear', (200, 180, 800, 730), '08-ears.png', 'левое ухо · одинаковый свет')
    comparison(args.raw, args.output, 'face', (225, 25, 775, 820), 330, '09-v3-v4-faces-front.png')
    # In profile the nose extends farther to screen-right than in the frontal
    # frame. Include the complete nose and back of the head in both versions.
    comparison(args.raw, args.output, 'profile', (290, 25, 940, 820), 350, '10-v3-v4-faces-profile.png')
    comparison(args.raw, args.output, 'body-side', (300, 25, 700, 890), 225, '11-v3-v4-figures-side.png')
    comparison(args.raw, args.output, 'body-back', (300, 25, 700, 890), 225, '12-v3-v4-figures-back.png')
    print(f'PASS: actual, consistently framed 3D comparison panels in {args.output}')


if __name__ == '__main__':
    main()
