#!/usr/bin/env python3
"""Make labelled comparisons from same-camera, unretouched viewer captures."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Exactly the same crop is applied to the previous approved version and v2.
CROPS = {
    "eyes": (190, 280, 1010, 660),
    "face": (280, 150, 920, 840),
    "torso-front": (215, 100, 985, 820),
    "torso-angle": (215, 100, 985, 820),
    "torso-side": (300, 125, 900, 950),
    "figure-front": (380, 50, 820, 970),
    "figure-side": (380, 50, 820, 970),
    "figure-back": (380, 50, 820, 970),
    "hips-side": (300, 220, 900, 900),
}


def comparison(raw: Path, output: Path, view: str, filename: str) -> None:
    before = Image.open(raw / f"before-{view}.png").convert("RGB").crop(CROPS[view])
    after = Image.open(raw / f"after-{view}.png").convert("RGB").crop(CROPS[view])
    if before.size != after.size:
        raise ValueError("Before and after captures differ in size")
    width, height = before.size
    header, gap = 54, 8
    canvas = Image.new("RGB", (width * 2 + gap, height + header), "#151b20")
    canvas.paste(before, (0, header))
    canvas.paste(after, (width + gap, header))
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 21)
    except OSError:
        font = ImageFont.load_default(size=21)
    draw = ImageDraw.Draw(canvas)
    draw.text((18, 15), "ДО · ПРЕДЫДУЩАЯ ВЕРСИЯ А", fill="#e8d7b6", font=font)
    draw.text((width + gap + 18, 15), "ПОСЛЕ · ВЕРСИЯ 2", fill="#e8d7b6", font=font)
    canvas.save(output / filename, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for view, filename in [
        ("eyes", "01-eyes-before-after.png"),
        ("face", "02-face-before-after.png"),
        ("torso-front", "03-torso-front-before-after.png"),
        ("torso-angle", "04-torso-angle-before-after.png"),
        ("torso-side", "05-torso-side-before-after.png"),
        ("figure-front", "06-figure-front-before-after.png"),
        ("figure-side", "07-figure-side-before-after.png"),
        ("figure-back", "08-figure-back-before-after.png"),
        ("hips-side", "09-hips-side-before-after.png"),
    ]:
        comparison(args.raw, args.output, view, filename)
    for name in ("scene-front", "scene-angle", "well-front", "well-angle"):
        shutil.copyfile(args.raw / f"{name}.png", args.output / f"{name}.png")
    print(f"PASS: labelled same-camera comparisons and scene images written to {args.output}")


if __name__ == "__main__":
    main()
