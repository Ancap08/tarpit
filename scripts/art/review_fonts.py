"""Fonts for review plates, with fallbacks for machines without macOS fonts."""

from functools import lru_cache

from PIL import ImageFont

FONTS = {
    "serif": ("Georgia.ttf", "DejaVuSerif.ttf"),
    "serif-bold": ("Georgia Bold.ttf", "DejaVuSerif-Bold.ttf"),
    "sans": ("Arial.ttf", "DejaVuSans.ttf"),
    "sans-bold": ("Arial Bold.ttf", "DejaVuSans-Bold.ttf"),
    "mono": ("Menlo.ttc", "DejaVuSansMono.ttf"),
    "mono-bold": ("Courier New Bold.ttf", "DejaVuSansMono-Bold.ttf"),
}


@lru_cache(maxsize=None)
def review_font(style, size):
    preferred, portable = FONTS[style]
    for name in (
        f"/System/Library/Fonts/Supplemental/{preferred}",
        f"/System/Library/Fonts/{preferred}",
        portable,
    ):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)
