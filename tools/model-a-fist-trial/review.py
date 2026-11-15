#!/usr/bin/env python3
"""Label and compare the real, unretouched fixed-camera browser captures."""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont


def fonts():
    try:
        return ImageFont.truetype('DejaVuSans.ttf', 20), ImageFont.truetype('DejaVuSans.ttf', 14)
    except OSError:
        return ImageFont.load_default(), ImageFont.load_default()


def compare(raw: Path, output: Path, side: str, suffix: str, crop, filename: str, note: str) -> None:
    panels = [Image.open(raw / f'{name}-{side}-{suffix}.png').convert('RGB').crop(crop)
              for name in ('before', 'after')]
    width, height = panels[0].size
    gap, header = 8, 64
    result = Image.new('RGB', (2 * width + gap, height + header), '#151b20')
    title, detail = fonts()
    draw = ImageDraw.Draw(result)
    for i, (panel, text) in enumerate(zip(panels, ('ПРЕЖНЯЯ ПРОБА', 'ОТДЕЛЬНАЯ ПРОБА'))):
        x = i * (width + gap)
        result.paste(panel, (x, header))
        draw.text((x + 12, 6), text, fill='#eedcba', font=title)
        draw.text((x + 12, 38), note, fill='#aeb8bf', font=detail)
    result.save(output / filename, optimize=True)


def stages(raw: Path, output: Path, side: str, filename: str) -> None:
    # The open pose extends lower than the fist; keep the same full framing for
    # every step rather than cropping off the fingertips at 0% and 25%.
    crop = (135, 25, 565, 655)
    panels = [Image.open(raw / f'after-{side}-palm-{weight}.png').convert('RGB').crop(crop)
              for weight in (0, 25, 50, 75, 100)]
    panels = [panel.resize((280, 410), Image.Resampling.LANCZOS) for panel in panels]
    width, height = panels[0].size
    gap, header = 8, 64
    result = Image.new('RGB', (width * len(panels) + gap * (len(panels) - 1), height + header), '#151b20')
    title, detail = fonts()
    draw = ImageDraw.Draw(result)
    for i, (panel, weight) in enumerate(zip(panels, (0, 25, 50, 75, 100))):
        x = i * (width + gap)
        result.paste(panel, (x, header))
        draw.text((x + 12, 6), f'СГИБ {weight}%', fill='#eedcba', font=title)
        draw.text((x + 12, 38), 'кисть изолирована для просмотра', fill='#aeb8bf', font=detail)
    result.save(output / filename, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    for side in ('left', 'right'):
        a = Image.open(args.raw / f'before-{side}-side-open.png').convert('RGB')
        b = Image.open(args.raw / f'after-{side}-side-open.png').convert('RGB')
        if ImageChops.difference(a, b).getbbox() is not None:
            raise AssertionError(f'Open hand changed in the {side} view')
    args.output.mkdir(parents=True, exist_ok=True)
    compare(args.raw, args.output, 'left', 'side-fist', (170, 140, 540, 540),
            '01-left-side.png', 'левая рука рядом с телом · 100%')
    compare(args.raw, args.output, 'right', 'side-fist', (160, 140, 530, 540),
            '02-right-side.png', 'правая рука рядом с телом · 100%')
    compare(args.raw, args.output, 'left', 'palm-100', (155, 35, 555, 500),
            '03-left-palm.png', 'кисть изолирована для просмотра · 100%')
    compare(args.raw, args.output, 'right', 'palm-100', (145, 35, 545, 500),
            '04-right-palm.png', 'кисть изолирована для просмотра · 100%')
    stages(args.raw, args.output, 'left', '05-left-movement.png')
    stages(args.raw, args.output, 'right', '06-right-movement.png')
    compare(args.raw, args.output, 'left', 'side-75', (170, 140, 540, 540),
            '07-left-75.png', 'левая рука рядом с телом · 75%')
    compare(args.raw, args.output, 'right', 'side-75', (160, 140, 530, 540),
            '08-right-75.png', 'правая рука рядом с телом · 75%')
    # An overview simply stacks the two same-camera pairs without altering
    # their pixels. Separate originals remain available for closer inspection.
    left = Image.open(args.output / '01-left-side.png').convert('RGB')
    right = Image.open(args.output / '02-right-side.png').convert('RGB')
    overview = Image.new('RGB', (max(left.width, right.width), left.height + right.height + 8), '#151b20')
    overview.paste(left, (0, 0))
    overview.paste(right, (0, left.height + 8))
    overview.save(args.output / '00-both-hands.png', optimize=True)
    print(f'PASS: both open-hand views are pixel-identical; real before/after captures saved to {args.output}')


if __name__ == '__main__':
    main()
