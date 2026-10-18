#!/usr/bin/env python3
# Author: Cory McCabe
"""Assemble SVG-rendered documentation frames; Pillow is development-only."""
import json
import pathlib
import subprocess
import tempfile
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="micro-battery-visuals-") as temporary:
    subprocess.run(["node", str(ROOT / "scripts/render-visuals.cjs"), temporary], check=True)
    manifest = json.loads((pathlib.Path(temporary) / "frames.json").read_text())
    frames = [Image.open(entry["file"]).convert("RGB") for entry in manifest]
    # Share one palette across all frames so static photo/text pixels remain stable.
    sheet = Image.new("RGB", (frames[0].width, frames[0].height * len(frames)))
    for index, frame in enumerate(frames):
        sheet.paste(frame, (0, index * frame.height))
    palette = sheet.quantize(colors=256)
    frames = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    destination = ROOT / "docs/assets/battery-sequence.gif"
    frames[0].save(destination, save_all=True, append_images=frames[1:],
                   duration=[entry["duration"] for entry in manifest],
                   loop=0, optimize=False, disposal=2)
    print(destination)
