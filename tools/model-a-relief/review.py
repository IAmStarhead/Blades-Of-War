#!/usr/bin/env python3
"""Label real same-camera viewer captures; do not retouch either render."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

CROPS = {
    "face": (280, 150, 920, 840),
    "torso-front": (215, 100, 985, 820),
    "torso-angle": (215, 100, 985, 820),
    "figure-front": (380, 50, 820, 970),
    "figure-angle": (350, 50, 850, 970),
    "figure-back": (380, 50, 820, 970),
}


def comparison(raw: Path, output: Path, view: str, left: str, right: str,
               filename: str, captions: tuple[tuple[str, str], tuple[str, str]]) -> None:
    before = Image.open(raw / f"{left}-{view}.png").convert("RGB").crop(CROPS[view])
    after = Image.open(raw / f"{right}-{view}.png").convert("RGB").crop(CROPS[view])
    if before.size != after.size:
        raise ValueError("Mismatched camera capture size")
    width, height = before.size
    header, gap = 70, 8
    canvas = Image.new("RGB", (2 * width + gap, height + header), "#151b20")
    canvas.paste(before, (0, header))
    canvas.paste(after, (width + gap, header))
    try:
        title = ImageFont.truetype("DejaVuSans.ttf", 20)
        note = ImageFont.truetype("DejaVuSans.ttf", 16)
    except OSError:
        title = ImageFont.load_default(size=20)
        note = ImageFont.load_default(size=16)
    draw = ImageDraw.Draw(canvas)
    for x, (heading, description) in zip((0, width + gap), captions):
        draw.text((x + 17, 10), heading, fill="#eedcba", font=title)
        draw.text((x + 17, 40), description, fill="#aeb8bf", font=note)
    canvas.save(output / filename, optimize=True)


def verify_well(raw: Path) -> None:
    for name in ("well-front", "well-angle", "pair-without-female-front", "pair-without-female-angle"):
        before = Image.open(raw / f"before-{name}.png").convert("RGB")
        after = Image.open(raw / f"after-{name}.png").convert("RGB")
        if before.size != after.size or ImageChops.difference(before, after).getbbox() is not None:
            raise AssertionError(f"The fixed-camera original vs new well image differs: {name}")
    print("PASS: well-only and paired-mode well renders match v2 pixel-for-pixel at two fixed views")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    verify_well(args.raw)
    if args.output is None:
        return
    args.output.mkdir(parents=True, exist_ok=True)
    main = (("ДО · ВЕРСИЯ 2", "прежняя кожа и свет"),
            ("ПРОБА", "обновлённая кожа + мягкий свет"))
    for view, filename in [
        ("face", "01-face-before-after.png"),
        ("figure-front", "02-figure-before-after.png"),
        ("figure-angle", "03-figure-angle-before-after.png"),
        ("torso-front", "04-torso-before-after.png"),
        ("torso-angle", "05-torso-angle-before-after.png"),
        ("figure-back", "06-back-before-after.png"),
    ]:
        comparison(args.raw, args.output, view, "before", "after", filename, main)
    comparison(args.raw, args.output, "face", "before", "texture", "07-skin-only-face.png",
               (("ПРЕЖНЯЯ КОЖА", "одинаковый прежний свет"),
                ("ОБНОВЛЁННАЯ КОЖА", "одинаковый прежний свет")))
    comparison(args.raw, args.output, "torso-front", "texture", "after", "08-light-only-torso.png",
               (("ПРЕЖНИЙ СВЕТ", "одинаковая новая кожа"),
                ("МЯГКИЙ СВЕТ", "одинаковая новая кожа")))
    for name in ("scene-front", "scene-angle", "well-front", "well-angle"):
        shutil.copyfile(args.raw / f"after-{name}.png", args.output / f"{name}.png")
    print(f"PASS: labelled, unretouched viewer comparisons and scene captures in {args.output}")


if __name__ == "__main__":
    main()
