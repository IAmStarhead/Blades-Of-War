#!/usr/bin/env python3
"""Compose labeled, same-camera before/after images from browser screenshots."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Crops select the same rectangle from each unmodified render. No rescaling,
# retouching, generated reference photographs or geometry edits are applied.
CROPS = {
    "face": (280, 150, 920, 840),
    "eyes": (190, 280, 1010, 660),
    "angle": (250, 125, 910, 860),
    "profile": (170, 120, 860, 850),
    "figure-front": (380, 50, 820, 970),
    "figure-side": (380, 50, 820, 970),
    "figure-back": (380, 50, 820, 970),
    "torso-front": (215, 100, 985, 820),
    "torso-side": (300, 125, 900, 950),
    "butt-side": (300, 220, 900, 900),
}


def text_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype("DejaVuSans.ttf", size)
    except OSError:
        return ImageFont.load_default(size=size)


def comparison(raw: Path, output: Path, view: str, filename: str,
               before: str = "before", label: str = "ДО · ИСХОДНАЯ А") -> None:
    first = Image.open(raw / f"{before}-{view}.png").convert("RGB").crop(CROPS[view])
    second = Image.open(raw / f"after-{view}.png").convert("RGB").crop(CROPS[view])
    if first.size != second.size:
        raise ValueError("Before and after screenshots have different sizes")
    width, height = first.size
    header, gap = 54, 8
    canvas = Image.new("RGB", (width * 2 + gap, height + header), "#151b20")
    canvas.paste(first, (0, header))
    canvas.paste(second, (width + gap, header))
    draw = ImageDraw.Draw(canvas)
    font = text_font(21)
    draw.text((18, 15), label, fill="#e8d7b6", font=font)
    draw.text((width + gap + 18, 15), "ПОСЛЕ · НОВАЯ ВЕРСИЯ", fill="#e8d7b6", font=font)
    canvas.save(output / filename, optimize=True)
    if view in ("face", "eyes", "figure-front") and before == "before":
        second.save(output / f"{view}-after.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    names = [
        ("face", "01-face-before-after.png"),
        ("eyes", "02-eyes-before-after.png"),
        ("angle", "03-face-angle-before-after.png"),
        ("profile", "04-profile-before-after.png"),
        ("figure-front", "05-figure-front-before-after.png"),
        ("figure-side", "06-figure-side-before-after.png"),
        ("figure-back", "07-figure-back-before-after.png"),
        ("torso-front", "08-torso-front-before-after.png"),
        ("torso-side", "09-torso-side-before-after.png"),
        ("butt-side", "10-hips-side-before-after.png"),
    ]
    for view, filename in names:
        comparison(args.raw, args.output, view, filename)
    comparison(args.raw, args.output, "eyes", "11-previous-lashes-before-after.png",
               before="previous", label="ПРОШЛАЯ ПРОБА · СО ШТРИХАМИ")
    for name in ("scene-front", "scene-angle", "well-front", "well-angle"):
        shutil.copyfile(args.raw / f"{name}.png", args.output / f"{name}.png")
    print(f"PASS: labeled before/after and scene images written to {args.output}")


if __name__ == "__main__":
    main()
