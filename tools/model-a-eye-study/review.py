#!/usr/bin/env python3
"""Label/crop (and optionally enlarge) screenshots; no painting over the 3D render."""
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont


def panel(raw: Path, output: Path, files: list[str], labels: list[tuple[str, str]],
          crop: tuple[int, int, int, int], filename: str, scale: int = 1) -> None:
    images = [Image.open(raw / f'{name}.png').convert('RGB').crop(crop) for name in files]
    if scale != 1:
        images = [image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
                  for image in images]
    width, height = images[0].size
    gap, header = 8, 64
    result = Image.new('RGB', (len(images) * width + (len(images) - 1) * gap, height + header), '#151b20')
    try:
        title, detail = ImageFont.truetype('DejaVuSans.ttf', 20), ImageFont.truetype('DejaVuSans.ttf', 15)
    except OSError:
        title = detail = ImageFont.load_default()
    draw = ImageDraw.Draw(result)
    for i, (image, (heading, note)) in enumerate(zip(images, labels)):
        x = i * (width + gap)
        result.paste(image, (x, header))
        draw.text((x + 14, 7), heading, fill='#eedcba', font=title)
        draw.text((x + 14, 37), note, fill='#aeb8bf', font=detail)
    result.save(output / filename, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    before = np.asarray(Image.open(args.raw / 'before-face.png').convert('RGB'))
    after = np.asarray(Image.open(args.raw / 'after-face.png').convert('RGB'))
    difference = np.any(before != after, axis=2)
    y, x = np.where(difference)
    if not (len(x) > 100 and x.min() > 230 and x.max() < 770 and y.min() > 300 and y.max() < 500):
        raise AssertionError(f'Unexpected face difference: {len(x)}, bounds x={x.min()}..{x.max()}, y={y.min()}..{y.max()}')
    if ImageChops.difference(Image.open(args.raw / 'before-hand.png').convert('RGB'),
                             Image.open(args.raw / 'after-hand.png').convert('RGB')).getbbox() is not None:
        raise AssertionError('Hand image changed')
    print(f'PASS: fixed face view changes confined to eyes ({len(x)} pixels, x={x.min()}..{x.max()}, y={y.min()}..{y.max()}); hand identical')
    args.output.mkdir(parents=True, exist_ok=True)
    labels = [('ДО', 'согласованные брови'), ('ПОСЛЕ', 'белок и линия ресниц')]
    panel(args.raw, args.output, ['before-eyes', 'after-eyes'], labels, (80, 270, 920, 620), '01-both-eyes.png')
    panel(args.raw, args.output, ['before-one-eye', 'after-one-eye'], labels, (100, 230, 900, 650), '02-eye-close.png')
    panel(args.raw, args.output, ['before-angle', 'after-angle'], labels, (120, 235, 880, 650), '03-angle.png')
    panel(args.raw, args.output, ['after-eyes', 'after-blink-0.5', 'after-blink-1'],
          [('ОТКРЫТЫ', 'нейтральная поза'), ('МОРГАНИЕ 50%', 'промежуточная форма'),
           ('ЗАКРЫТЫ', 'морф моргания')], (80, 270, 920, 620), '04-blink.png')
    panel(args.raw, args.output, ['before-face', 'after-face'], labels, (225, 90, 775, 820), '05-face.png')
    panel(args.raw, args.output, ['before-one-eye', 'after-one-eye'],
          [('ДО', 'фрагмент белка · увеличено ×5'), ('ПОСЛЕ', 'тот же 3D-ракурс · увеличено ×5')],
          (295, 441, 385, 531), '06-sclera-detail.png', scale=5)
    print(f'PASS: actual fixed-camera comparisons saved in {args.output}')


if __name__ == '__main__':
    main()
