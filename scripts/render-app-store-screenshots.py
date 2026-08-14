#!/usr/bin/env python3
"""Render the truthful iPhone App Store screenshot set from QA fixtures."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "release/app-store/source"
OUTPUT = ROOT / "release/app-store/screenshots"

SCREENS = (
    ("01-readable-board.png", "gameplay.png", "A board you can read", "Large, high-contrast 3D tiles"),
    ("02-match-flow.png", "home.png", "Match. Clear. Keep moving.", "One tap starts a calm, focused round"),
    ("03-visible-hints.png", "hint.png", "A hint you can actually see", "Paired highlights, never a forced ad"),
    ("04-personal-themes.png", "themes.png", "Make every board yours", "Distinct tile art and background themes"),
    ("05-progress.png", "complete.png", "Progress at your pace", "Clear boards. Build your level."),
    ("06-backgrounds.png", "backgrounds.png", "Set the mood", "Five original backgrounds, one familiar game"),
)


def font(path: str, size: int):
    return ImageFont.truetype(path, size)


DISPLAY = font("/System/Library/Fonts/Supplemental/Georgia Bold.ttf", 96)
BODY = font("/Library/Fonts/SF-Pro-Rounded-Semibold.otf", 47)
LABEL = font("/Library/Fonts/SF-Pro-Rounded-Heavy.otf", 36)


def rounded(image: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, image.width - 1, image.height - 1), radius, fill=255)
    result = image.convert("RGBA")
    result.putalpha(mask)
    return result


def render(output_dir: Path, size: tuple[int, int], output_name: str, source_name: str, headline: str, subhead: str) -> None:
    canvas = Image.new("RGB", size, "#001b18")
    draw = ImageDraw.Draw(canvas)

    scale = size[0] / 1290
    for y in range(size[1]):
        mix = y / size[1]
        draw.line((0, y, size[0], y), fill=(0, int(52 - 24 * mix), int(44 - 22 * mix)))
    for x, y, radius in ((120, 410, 150), (1110, 520, 210), (180, 2220, 240), (1080, 2380, 170)):
        x, y, radius = int(x * scale), int(y * scale), int(radius * scale)
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), outline=(16, 83, 69), width=3)

    icon_size = int(154 * scale)
    icon = Image.open(ROOT / "public/brand-mark.png").convert("RGB").resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    canvas.paste(rounded(icon, int(32 * scale)), (int(70 * scale), int(58 * scale)), rounded(icon, int(32 * scale)))
    draw.text((int(250 * scale), int(102 * scale)), "MAHJONG BRAIN", font=font("/Library/Fonts/SF-Pro-Rounded-Heavy.otf", int(36 * scale)), fill="#f5ecd5", anchor="lm")

    draw.text((size[0] // 2, int(300 * scale)), headline, font=font("/System/Library/Fonts/Supplemental/Georgia Bold.ttf", int(96 * scale)), fill="#fff7e5", anchor="mm", align="center")
    draw.text((size[0] // 2, int(415 * scale)), subhead, font=font("/Library/Fonts/SF-Pro-Rounded-Semibold.otf", int(47 * scale)), fill="#9ef0c7", anchor="mm", align="center")

    source_dir = SOURCE / ("ipad" if size[0] > 1500 else "iphone")
    source = Image.open(source_dir / source_name).convert("RGB")
    screen_w = int(size[0] * 0.753)
    screen_h = round(screen_w * source.height / source.width)
    source = source.resize((screen_w, screen_h), Image.Resampling.LANCZOS)
    source = rounded(source, 64)

    x = (size[0] - screen_w) // 2
    y = int(560 * scale)
    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x - 10, y + 18, x + screen_w + 10, y + screen_h + 42), 72, fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow)
    canvas.alpha_composite(source, (x, y))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((x - 4, y - 4, x + screen_w + 4, y + screen_h + 4), 68, outline="#d59a39", width=8)

    output_dir.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output_dir / output_name, optimize=True)


for screen in SCREENS:
    render(OUTPUT / "iphone-6.9", (1290, 2796), *screen)
    render(OUTPUT / "ipad-13", (2064, 2752), *screen)

print(f"Rendered {len(SCREENS) * 2} App Store screenshots to {OUTPUT}")
