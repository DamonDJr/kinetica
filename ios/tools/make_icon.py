#!/usr/bin/env python3
"""Generate the Iron & Chalk app icon set.

The old Kinetica mark belongs to the previous (purple/teal) design language, so
the icon is drawn here from the same tokens as the app: chalk-fog ground, an
ochre chalk ring, an iron K set in Fraunces. Re-run after changing the palette.

    python3 ios/tools/make_icon.py
"""

import os
import random

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONT = os.path.join(ROOT, "Kinetica", "Resources", "Fonts", "Fraunces-SemiBold.ttf")
ICONSET = os.path.join(ROOT, "Kinetica", "Resources", "Assets.xcassets", "AppIcon.appiconset")

CHALK_FOG = (232, 228, 220)
IRON = (43, 40, 37)
ROPE_OCHRE = (184, 134, 59)

# (size in px, filename) — the full iPhone set Xcode 13 still expects.
SIZES = [
    (40, "icon-20@2x.png"),
    (60, "icon-20@3x.png"),
    (58, "icon-29@2x.png"),
    (87, "icon-29@3x.png"),
    (80, "icon-40@2x.png"),
    (120, "icon-40@3x.png"),
    (120, "icon-60@2x.png"),
    (180, "icon-60@3x.png"),
    (1024, "icon-1024.png"),
]


def render(side=1024):
    image = Image.new("RGB", (side, side), CHALK_FOG)
    draw = ImageDraw.Draw(image)

    # Chalk ring: an open arc, the same gesture as the in-app progress ring.
    inset = side * 0.13
    width = int(side * 0.075)
    box = [inset, inset, side - inset, side - inset]
    draw.arc(box, start=-90, end=190, fill=ROPE_OCHRE, width=width)

    # Grain over the ring only, so it reads as chalk dust on iron rather than a
    # printed band. Drawn as sparse specks masked to the stroke.
    grain = Image.new("L", (side, side), 0)
    mask = Image.new("L", (side, side), 0)
    ImageDraw.Draw(mask).arc(box, start=-90, end=190, fill=255, width=width)
    speck = ImageDraw.Draw(grain)
    random.seed(7)
    for _ in range(int(side * 26)):
        x = random.randrange(side)
        y = random.randrange(side)
        speck.point((x, y), fill=random.randrange(40, 190))
    grain.putalpha = None
    dust = Image.new("RGB", (side, side), (255, 255, 255))
    combined = Image.composite(grain, Image.new("L", (side, side), 0), mask)
    image.paste(dust, (0, 0), combined.point(lambda v: int(v * 0.5)))

    # The K, set in the display face.
    font = ImageFont.truetype(FONT, int(side * 0.46))
    left, top, right, bottom = draw.textbbox((0, 0), "K", font=font)
    draw.text(
        ((side - (right - left)) / 2 - left, (side - (bottom - top)) / 2 - top),
        "K",
        font=font,
        fill=IRON,
    )
    return image


def main():
    os.makedirs(ICONSET, exist_ok=True)
    master = render(1024)
    for size, name in SIZES:
        resized = master if size == 1024 else master.resize((size, size), Image.LANCZOS)
        # App icons must not carry an alpha channel.
        resized.convert("RGB").save(os.path.join(ICONSET, name), "PNG")
        print("wrote", name, size)


if __name__ == "__main__":
    main()
