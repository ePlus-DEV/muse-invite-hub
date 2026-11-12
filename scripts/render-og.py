#!/usr/bin/env python3
"""Render OG PNG from site-matched SVG and the repository's mascot poster."""
import base64
import io
from pathlib import Path
import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
source = (ROOT / "assets/social-preview-source.svg").read_text(encoding="utf-8")
with Image.open(ROOT / "assets/muse-mascot-poster.webp") as mascot:
    png = io.BytesIO()
    mascot.convert("RGB").save(png, format="PNG", optimize=True)
uri = "data:image/png;base64," + base64.b64encode(png.getvalue()).decode("ascii")
assert source.count("__MASCOT_DATA_URI__") == 1, "OG SVG must reference one mascot poster"
source = source.replace("__MASCOT_DATA_URI__", uri)
output = ROOT / "assets/social-preview.png"
cairosvg.svg2png(bytestring=source.encode(), write_to=str(output),
                 output_width=1200, output_height=630)
with Image.open(output) as rendered:
    assert rendered.size == (1200, 630)
print(f"Rendered {output.name}: {output.stat().st_size:,} bytes (1200x630)")
