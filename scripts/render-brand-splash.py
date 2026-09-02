#!/usr/bin/env python3
"""Deterministically render the native splash from the approved brand mark."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SIZE = 2732

source = Image.open(ROOT / "design/assets/app-icon-generated-source.png").convert("RGB")
background = Image.new("RGB", (SIZE, SIZE), (0, 43, 38))
pixels = background.load()

for y in range(SIZE):
    dy = (y - SIZE * 0.48) / SIZE
    for x in range(SIZE):
        dx = (x - SIZE * 0.5) / SIZE
        distance = min(1.0, (dx * dx + dy * dy) ** 0.5 / 0.72)
        pixels[x, y] = (
            int(5 * (1 - distance)),
            int(66 - 39 * distance),
            int(56 - 34 * distance),
        )

mark = source.resize((1050, 1050), Image.Resampling.LANCZOS)
mark_mask = Image.new("L", mark.size, 0)
ImageDraw.Draw(mark_mask).rounded_rectangle((0, 0, 1049, 1049), radius=220, fill=255)
mark.putalpha(mark_mask)
shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
shadow.paste((0, 14, 12, 150), (841, 956, 1891, 2006))
shadow = shadow.filter(ImageFilter.GaussianBlur(55))
composite = Image.alpha_composite(background.convert("RGBA"), shadow)
composite.alpha_composite(mark, (841, 900))

draw = ImageDraw.Draw(composite)
draw.rounded_rectangle((1080, 2050, 1652, 2062), radius=6, fill=(185, 138, 62, 210))

output = composite.convert("RGB")
destination = ROOT / "ios/App/App/Assets.xcassets/Splash.imageset"
for name in (
    "splash-2732x2732.png",
    "splash-2732x2732-1.png",
    "splash-2732x2732-2.png",
):
    output.save(destination / name, optimize=True)
