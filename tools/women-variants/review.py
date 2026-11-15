#!/usr/bin/env python3
"""Arrange fixed-camera screenshots; no modifications inside the 3D renders."""
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

WOMEN = [('eve', 'ЕВА', 'базовая женщина · 100%'),
         ('north', 'СЕВЕРЯНКА', 'первая проба · 105%'),
         ('central', 'ЦЕНТРАЛКА', 'первая проба · 100%'),
         ('east', 'ЯПОНСКИЙ МОТИВ', 'первая проба · 95%')]


def panel(raw: Path, output: Path, view: str, crop: tuple[int, int, int, int],
          filename: str, note_override: str | None = None) -> None:
    width, height = crop[2] - crop[0], crop[3] - crop[1]
    gap, header = 8, 64
    result = Image.new('RGB', (len(WOMEN) * width + (len(WOMEN) - 1) * gap, height + header), '#151b20')
    try:
        title, detail = ImageFont.truetype('DejaVuSans.ttf', 19), ImageFont.truetype('DejaVuSans.ttf', 14)
    except OSError:
        title = detail = ImageFont.load_default()
    draw = ImageDraw.Draw(result)
    for i, (key, heading, note) in enumerate(WOMEN):
        x = i * (width + gap)
        img = Image.open(raw / f'{key}-{view}.png').convert('RGB').crop(crop)
        result.paste(img, (x, header))
        draw.text((x + 12, 7), heading, fill='#eedcba', font=title)
        draw.text((x + 12, 37), note_override or note, fill='#aeb8bf', font=detail)
    result.save(output / filename, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    baseline = np.asarray(Image.open(args.raw / 'eve-face.png').convert('RGB'))
    for key, _, _ in WOMEN[1:]:
        picture = np.asarray(Image.open(args.raw / f'{key}-face.png').convert('RGB'))
        changed = np.count_nonzero(np.any(picture != baseline, axis=2))
        if changed < 500:
            raise AssertionError(f'{key} face render did not differ from Eve: {changed} pixels')
        print(f'PASS: {key} fixed-relative-camera face differs from Eve in {changed:,} pixels')
    for view, filename in [('front', '01-figure-front.png'), ('side', '02-figure-side.png'),
                           ('back', '03-figure-back.png')]:
        panel(args.raw, args.output, view, (320, 0, 680, 900), filename)
    panel(args.raw, args.output, 'face', (225, 90, 775, 820), '04-faces-front.png', 'одинаковый масштаб лица')
    panel(args.raw, args.output, 'angle', (90, 70, 810, 850), '05-faces-angle.png', 'одинаковый масштаб лица')
    panel(args.raw, args.output, 'blink', (80, 270, 920, 620), '06-blink.png', 'закрытые глаза · морф')
    print(f'PASS: unretouched 3D comparison renders saved in {args.output}')


if __name__ == '__main__':
    main()
