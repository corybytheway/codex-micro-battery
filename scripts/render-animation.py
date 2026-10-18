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
    palette = sheet.quantize(colors=224)
    # Reserve exact signal colors: the much larger neutral photo must not merge
    # the small red/orange indicators into one approximate brown palette entry.
    signals = [(20, 152, 91), (206, 118, 8), (214, 64, 64)]
    reserved = signals + [(255, 255, 255), (246, 247, 244), (27, 48, 35)]
    for color in signals:
        for neutral in (130, 170, 210, 245):
            reserved.append(tuple(round(value * .56 + neutral * .44) for value in color))
    colors = palette.getpalette()[:224 * 3] + [channel for color in reserved for channel in color]
    palette.putpalette(colors + [0] * (768 - len(colors)))
    frames = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    destination = ROOT / "docs/assets/battery-sequence.gif"
    frames[0].save(destination, save_all=True, append_images=frames[1:],
                   duration=[entry["duration"] for entry in manifest],
                   loop=0, optimize=False, disposal=2)
    print(destination)
