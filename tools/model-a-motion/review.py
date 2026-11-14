#!/usr/bin/env python3
"""Check fixed-camera captures and label comparisons without retouching the renders."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont


def same_pixels(a: Path, b: Path, label: str) -> None:
    first = Image.open(a).convert("RGB")
    second = Image.open(b).convert("RGB")
    if first.size != second.size or ImageChops.difference(first, second).getbbox() is not None:
        raise AssertionError(f"Pixel comparison failed: {label}")


def verify(raw: Path) -> None:
    for name in ("well-front", "well-angle", "pair-without-female-front", "pair-without-female-angle"):
        same_pixels(raw / f"before-{name}.png", raw / f"after-{name}.png", name)
    for name in ("eyes", "left-hand", "right-hand"):
        same_pixels(raw / f"{name}-open.png", raw / f"{name}-reset.png", name + " reset")
    before = np.asarray(Image.open(raw / "before-face.png").convert("RGB"))
    after = np.asarray(Image.open(raw / "after-face.png").convert("RGB"))
    if before.shape != (900, 1000, 3) or after.shape != before.shape:
        raise AssertionError("Unexpected face capture size")
    diff = np.any(before != after, axis=2)
    y, x = np.where(diff)
    if not (1000 < len(x) and x.min() > 290 and x.max() < 710 and y.min() > 300 and y.max() < 410):
        raise AssertionError(f"Neutral face changed outside brow region: {len(x)} pixels")
    print("PASS: neutral face pixels differ only around the eyebrows at this fixed camera")
    print("PASS: reopening eyes and hands restores the fixed-camera image pixel-for-pixel")
    print("PASS: well-only and paired-mode well match the preceding version pixel-for-pixel in two views")


def comparison(raw: Path, output: Path, first: str, second: str, crop: tuple[int, int, int, int],
               filename: str, captions: tuple[tuple[str, str], tuple[str, str]]) -> None:
    a = Image.open(raw / f"{first}.png").convert("RGB").crop(crop)
    b = Image.open(raw / f"{second}.png").convert("RGB").crop(crop)
    if a.size != b.size:
        raise ValueError("Mismatched captures")
    width, height = a.size
    header, gap = 68, 8
    result = Image.new("RGB", (2 * width + gap, height + header), "#151b20")
    result.paste(a, (0, header))
    result.paste(b, (width + gap, header))
    try:
        title = ImageFont.truetype("DejaVuSans.ttf", 20)
        note = ImageFont.truetype("DejaVuSans.ttf", 15)
    except OSError:
        title = ImageFont.load_default(size=20)
        note = ImageFont.load_default(size=15)
    draw = ImageDraw.Draw(result)
    for x, (heading, detail) in zip((0, width + gap), captions):
        draw.text((x + 15, 8), heading, fill="#eedcba", font=title)
        draw.text((x + 15, 38), detail, fill="#aeb8bf", font=note)
    result.save(output / filename, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    verify(args.raw)
    if args.output is None:
        return
    args.output.mkdir(parents=True, exist_ok=True)
    comparison(args.raw, args.output, "before-face", "after-face", (225, 90, 775, 820),
               "01-brows-before-after.png", (("ДО", "прежняя проба кожи"), ("ПОСЛЕ", "рисунок бровей немного ниже")))
    comparison(args.raw, args.output, "eyes-open", "eyes-closed", (95, 235, 905, 640),
               "02-blink.png", (("ГЛАЗА ОТКРЫТЫ", "нейтральная поза"), ("ГЛАЗА ЗАКРЫТЫ", "морф моргания")))
    comparison(args.raw, args.output, "eyes-angle-open", "eyes-angle-closed", (120, 120, 900, 800),
               "05-blink-angle.png", (("ГЛАЗА ОТКРЫТЫ", "ракурс три четверти"), ("ГЛАЗА ЗАКРЫТЫ", "тот же ракурс")))
    for side, description, filename in [("left", "левая кисть", "03-left-hand.png"),
                                        ("right", "правая кисть", "04-right-hand.png")]:
        comparison(args.raw, args.output, f"{side}-hand-open", f"{side}-hand-fist", (220, 70, 780, 820),
                   filename, (("ОТКРЫТА", description), ("КУЛАК", "слегка сжатая поза")))
    for name in ("scene-front", "scene-angle", "well-front", "well-angle", "figure-front", "eyes-half"):
        shutil.copyfile(args.raw / f"after-{name}.png", args.output / f"{name}.png")
    print(f"PASS: real same-camera, unretouched comparisons and scene captures in {args.output}")


if __name__ == "__main__":
    main()
