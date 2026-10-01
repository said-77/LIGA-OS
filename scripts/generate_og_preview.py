"""Regenerate LIGA OS social preview images from the clean, reviewed base artwork.

Requires Pillow for this optional asset-authoring task only; the app itself has no
Python or image-processing runtime dependency.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "icons" / "og-preview-base.jpg"
OUTPUT_JPG = ROOT / "icons" / "og-preview.jpg"
OUTPUT_PNG = ROOT / "icons" / "og-preview.png"
SCALE = 3


def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = (
        [r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf"]
        if bold
        else [r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf"]
    )
    candidates += ["DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"]
    for name in candidates:
        try:
            return ImageFont.truetype(name, size * SCALE)
        except OSError:
            continue
    return ImageFont.load_default(size=size * SCALE)


def mix(a: tuple[int, ...], b: tuple[int, ...], t: float) -> tuple[int, ...]:
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def main() -> None:
    base = Image.open(BASE).convert("RGB")
    width, height = base.size
    high = Image.new("RGBA", (width * SCALE, height * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(high)

    # Repaint only the shield's inner face. The existing gold rim, light rays,
    # shadow, layout, and brand seal remain intact.
    shield_points = [
        (688, 282), (779, 309), (766, 418), (747, 484),
        (688, 535), (629, 484), (610, 418), (597, 309),
    ]
    mask = Image.new("L", high.size, 0)
    ImageDraw.Draw(mask).polygon([(x * SCALE, y * SCALE) for x, y in shield_points], fill=255)

    gold = Image.new("RGBA", high.size, (0, 0, 0, 0))
    gold_draw = ImageDraw.Draw(gold)
    top, mid, bottom = (255, 228, 151, 255), (226, 174, 74, 255), (145, 91, 26, 255)
    for y in range(282 * SCALE, 536 * SCALE):
        progress = (y / SCALE - 282) / (535 - 282)
        color = mix(top, mid, progress * 2) if progress < 0.5 else mix(mid, bottom, (progress - 0.5) * 2)
        gold_draw.line((590 * SCALE, y, 786 * SCALE, y), fill=color)
    # A restrained center highlight keeps the gold face dimensional without
    # reintroducing technical wording or a fixed pressure promise.
    highlight = Image.new("RGBA", high.size, (0, 0, 0, 0))
    highlight_draw = ImageDraw.Draw(highlight)
    highlight_draw.line((688 * SCALE, 295 * SCALE, 688 * SCALE, 522 * SCALE), fill=(255, 246, 205, 54), width=2 * SCALE)
    gold = Image.alpha_composite(gold, highlight)
    high.alpha_composite(Image.composite(gold, Image.new("RGBA", high.size, (0, 0, 0, 0)), mask))

    # Engraved brand mark: the shield stays recognizable while pressure remains
    # selected per object in the actual engineering record.
    d = ImageDraw.Draw(high)
    d.text((688 * SCALE + 2 * SCALE, 410 * SCALE + 3 * SCALE), "LIGA", font=get_font(50, True),
           anchor="mm", fill=(71, 43, 13, 210), stroke_width=1 * SCALE, stroke_fill=(75, 48, 18, 180))
    d.text((688 * SCALE, 407 * SCALE), "LIGA", font=get_font(50, True), anchor="mm",
           fill=(255, 247, 208, 255), stroke_width=1 * SCALE, stroke_fill=(163, 112, 36, 240))
    d.text((688 * SCALE, 453 * SCALE), "МАСТЕР", font=get_font(13, True), anchor="mm",
           fill=(104, 66, 20, 255), stroke_width=1 * SCALE, stroke_fill=(255, 228, 151, 160))

    # Repair the first bullet line using the original local background colors.
    # Sampling above and below avoids a visible solid rectangle over the glow.
    for x in range(58, 570):
        top_rgb = tuple(round(sum(base.getpixel((x, y))[c] for y in range(572, 577)) / 5) for c in range(3))
        bottom_rgb = tuple(round(sum(base.getpixel((x, y))[c] for y in range(629, 634)) / 5) for c in range(3))
        for y in range(578, 627):
            t = (y - 578) / 48
            rgba = (*mix(top_rgb, bottom_rgb, t), 255)
            draw.line((x * SCALE, y * SCALE, x * SCALE, (y + 1) * SCALE), fill=rgba, width=SCALE)

    bullet_y = 604
    d = ImageDraw.Draw(high)
    d.text((72 * SCALE, bullet_y * SCALE), "•", font=get_font(22, True), anchor="mm", fill=(251, 191, 36, 255))
    d.text((91 * SCALE, bullet_y * SCALE), "Контроль гидравлики и герметичности",
           font=get_font(24), anchor="lm", fill=(248, 250, 252, 255))

    overlay = high.resize((width, height), Image.Resampling.LANCZOS)
    final = Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")
    final.save(OUTPUT_JPG, "JPEG", quality=94, optimize=True, progressive=True)
    final.save(OUTPUT_PNG, "PNG", optimize=True)


if __name__ == "__main__":
    main()
