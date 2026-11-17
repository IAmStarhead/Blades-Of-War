#!/usr/bin/env python3
"""Verify two-view package integrity, preserved sources, and reproducible build."""
from __future__ import annotations

import argparse
import base64
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("dual_view_builder", HERE / "build.py")
assert spec and spec.loader
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def verify(output: Path, rebuild: bool) -> None:
    original, optimized, engine, licenses = builder.sources()
    html = (output / "index.html").read_bytes()
    archive_data = (output / builder.ARCHIVE).read_bytes()
    info = json.loads((output / "build-info.json").read_text(encoding="utf-8"))
    assert info["previousZipSha256"] == builder.PREVIOUS_SHA
    assert info["originalGlbSha256"] == builder.ORIGINAL_SHA == builder.sha(original)
    assert info["optimizedGlbSha256"] == builder.OPTIMIZED_SHA == builder.sha(optimized)
    assert info["originalTriangles"] == 287782 and info["optimizedTriangles"] == 32354
    assert info["pageSha256"] == builder.sha(html) and info["archiveSha256"] == builder.sha(archive_data)
    text = html.decode("utf-8")
    assert text.startswith(builder.MARKER) and text.count(engine) == 1
    for variable, data in [("ORIGINAL_URI", original), ("OPTIMIZED_URI", optimized)]:
        matches = re.findall(rf'const {variable} = "data:model/gltf-binary;base64,([A-Za-z0-9+/=]+)";', text)
        assert len(matches) == 1 and base64.b64decode(matches[0], validate=True) == data
    assert text.count("data:model/gltf-binary;base64,") == 2
    assert "FIST_DELTAS" not in text and "data-hand=" not in text and "setFists" not in text
    with zipfile.ZipFile(output / builder.ARCHIVE) as z:
        assert z.testzip() is None
        assert set(z.namelist()) == {builder.PAGE, builder.ORIGINAL, builder.OPTIMIZED, "README.txt", *builder.LICENSES}
        assert z.read(builder.PAGE) == html and z.read(builder.ORIGINAL) == original and z.read(builder.OPTIMIZED) == optimized
        assert all(z.read(name) == licenses[name] for name in builder.LICENSES)
        readme = z.read("README.txt").decode("utf-8")
        for word in ("Обычный ракурс", "Сверху", "287 782", "32 354", "скелета"):
            assert word.lower() in readme.lower(), word
    print("PASS: both GLBs and the complete previous well/engine bundle copied unchanged; no fist trial")
    print("PASS: standalone page, ZIP CRC, models and licenses")
    if rebuild:
        with tempfile.TemporaryDirectory(prefix="bow-two-view-rebuild-") as temp:
            subprocess.run([sys.executable, str(HERE / "build.py"), "--output", temp], cwd=builder.ROOT, check=True)
            for name in ("index.html", builder.ARCHIVE, "build-info.json"):
                assert (Path(temp) / name).read_bytes() == (output / name).read_bytes(), f"Rebuild differs: {name}"
        print("PASS: byte-for-byte reproducible rebuild")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=builder.OUTPUT)
    parser.add_argument("--rebuild", action="store_true")
    args = parser.parse_args()
    verify(args.output.resolve(), args.rebuild)


if __name__ == "__main__":
    main()
