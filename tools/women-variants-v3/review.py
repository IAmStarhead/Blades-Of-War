#!/usr/bin/env python3
"""Arrange fixed-camera face screenshots; do not modify any of the 3D pixels."""
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

WOMEN = [('eve', 'ЕВА'), ('north', 'СЕВЕРЯНКА'), ('central', 'ЦЕНТРАЛКА'),
         ('east', 'ЯПОНСКИЙ МОТИВ'), ('africa', 'АФРИКАНКА')]


def panel(raw: Path, output: Path, view: str, crop: tuple[int, int, int, int],
          filename: str, note: str) -> None:
    width, height = crop[2] - crop[0], crop[3] - crop[1]
    gap, header = 8, 64
    result = Image.new('RGB', (len(WOMEN) * width + (len(WOMEN) - 1) * gap, height + header), '#151b20')
    try:
        title, detail = ImageFont.truetype('DejaVuSans.ttf', 19), ImageFont.truetype('DejaVuSans.ttf', 14)
    except OSError:
        title = detail = ImageFont.load_default()
    draw = ImageDraw.Draw(result)
    for i, (key, heading) in enumerate(WOMEN):
        x = i * (width + gap)
        result.paste(Image.open(raw / f'{key}-{view}.png').convert('RGB').crop(crop), (x, header))
        draw.text((x + 12, 7), heading, fill='#eedcba', font=title)
        draw.text((x + 12, 37), note, fill='#aeb8bf', font=detail)
    result.save(output / filename, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    # Catch a delayed resize resetting a portrait to a full-body camera. At
    # this framing the face spans much of the centre scanline; a distant full
    # figure is considerably narrower. This checks framing, not anatomy.
    for key, _ in WOMEN:
        img = np.asarray(Image.open(args.raw / f'{key}-face.png').convert('RGB')).astype(np.int16)
        background = img[0, 0]
        occupied = np.count_nonzero(np.max(np.abs(img[390, 225:775] - background), axis=1) > 15)
        if occupied < 300:
            raise AssertionError(f'{key}: face camera is unexpectedly distant ({occupied} pixels)')
    baseline = np.asarray(Image.open(args.raw / 'eve-face.png').convert('RGB'))
    for key, _ in WOMEN[1:]:
        img = np.asarray(Image.open(args.raw / f'{key}-face.png').convert('RGB'))
        changed = np.count_nonzero(np.any(img != baseline, axis=2))
        if changed < 500:
            raise AssertionError(f'{key}: face render unexpectedly identical to Eve')
        print(f'PASS: {key}: {changed:,} face pixels differ from Eve at the same relative framing')
    panel(args.raw, args.output, 'face', (225, 25, 775, 820), '04-faces-front.png', 'одинаковое относительное кадрирование')
    panel(args.raw, args.output, 'angle', (90, 70, 810, 850), '05-faces-angle.png', 'одинаковое относительное кадрирование')
    panel(args.raw, args.output, 'blink', (80, 270, 920, 620), '06-blink.png', 'закрытые глаза · морф')
    panel(args.raw, args.output, 'eyes', (80, 200, 920, 620), '07-eyes-and-brows.png', 'глаза и брови · одинаковый свет')
    panel(args.raw, args.output, 'ear', (200, 180, 800, 730), '08-ears.png', 'левое ухо · одинаковый свет')
    panel(args.raw, args.output, 'mouth', (140, 230, 860, 650), '09-lips.png', 'губы · одинаковый свет')
    # Central v2 and v3 are rendered by their actual viewers with exactly the
    # same camera, light and viewport; only a title strip and crop are added.
    crop = (225, 25, 775, 820)
    w, h = crop[2] - crop[0], crop[3] - crop[1]
    comparison = Image.new('RGB', (2 * w + 8, h + 64), '#151b20')
    draw = ImageDraw.Draw(comparison)
    try:
        font = ImageFont.truetype('DejaVuSans.ttf', 19)
        detail = ImageFont.truetype('DejaVuSans.ttf', 14)
    except OSError:
        font = detail = ImageFont.load_default()
    for i, (filename, title) in enumerate([('central-v2.png', 'ЦЕНТРАЛКА · V2'),
                                            ('central-face.png', 'ЦЕНТРАЛКА · V3')]):
        x = i * (w + 8)
        comparison.paste(Image.open(args.raw / filename).convert('RGB').crop(crop), (x, 64))
        draw.text((x + 12, 7), title, fill='#eedcba', font=font)
        draw.text((x + 12, 37), 'одинаковые камера и свет', fill='#aeb8bf', font=detail)
    comparison.save(args.output / '10-central-before-after.png', optimize=True)
    print(f'PASS: unretouched 3D comparison panels saved in {args.output}')


if __name__ == '__main__':
    main()
