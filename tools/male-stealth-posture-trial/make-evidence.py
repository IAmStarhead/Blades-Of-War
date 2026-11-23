#!/usr/bin/env python3
"""Make matched, labelled comparison sheets from capture-poses.mjs output.

Requires Pillow and a captured directory outside the repository. Writes only
new evidence files for this trial; prior scene/evidence are never modified.
"""
from pathlib import Path
import argparse
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('captures', type=Path)
args = parser.parse_args()
source = args.captures.resolve()
if not source.is_dir() or source == ROOT or ROOT in source.parents:
    raise SystemExit('Captures must be a directory outside the repository')
out = ROOT / 'work/male-stealth-posture-trial/evidence'
out.mkdir(parents=True, exist_ok=True)
font_file = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = ImageFont.truetype(font_file, 19)
bold = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
title = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 26)
views = [('side', 'Сбоку'), ('three', 'Три четверти'), ('front', 'Спереди'), ('rear', 'Сзади')]
for mode, phase, name, heading in [('idle', '0', 'idle-comparison.jpg', 'Присед на месте'),
                                    ('walk', '0.25', 'walk-comparison.jpg', 'Движение в приседе · одна фаза')]:
    width, cell, row = 1000, 500, 540
    image = Image.new('RGB', (width, 110 + 4 * row), '#18271f')
    draw = ImageDraw.Draw(image)
    draw.text((25, 12), heading, fill='#f0e4cb', font=title)
    draw.text((25, 59), 'ПРЕЖНЯЯ ПРОБА', fill='#ddc799', font=bold)
    draw.text((525, 59), 'НОВАЯ СТЕЛС-СТОЙКА', fill='#ddc799', font=bold)
    for r, (view, caption) in enumerate(views):
        y = 110 + row * r
        draw.text((25, y + 5), caption, fill='#eee9dc', font=font)
        for column, label in enumerate(('previous', 'trial')):
            file = source / f'{label}-{mode}-{phase}-{view}.jpg'
            with Image.open(file) as original:
                im = original.convert('RGB').resize((cell, cell), Image.Resampling.LANCZOS)
                image.paste(im, (column * cell, y + 36))
    target = out / name
    if target.exists():
        raise SystemExit(f'Refusing to overwrite {target}')
    image.save(target, quality=89, optimize=True)
    print(target)
