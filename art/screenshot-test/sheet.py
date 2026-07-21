#!/usr/bin/env python3
"""A/B contact sheet for the blind screenshot viewing (WS-ART X1).

Composes the PERILUNE slice frame(s) beside a reference screenshot into one labeled sheet, so
three viewers can rank them without knowing which is which (see PROTOCOL.md). We deliberately do
NOT ship a RimWorld image — no asset rights, no reliable source — so the reference SLOT renders a
labeled placeholder until Garvin drops his own screenshot in as `reference-rimworld.png` beside
this script. The sheet builder handles the missing reference gracefully (placeholder panel), so
the rig runs end-to-end today and gains the real comparison the moment the file appears.

Self-contained (Pillow only). Usage:
    python3 art/screenshot-test/sheet.py [--candidate candidate.png] [--far candidate_far.png]
            [--reference reference-rimworld.png] [--out ab_sheet.png]
"""
import argparse
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    import sys
    print("sheet: Pillow (PIL) not installed — `pip install pillow`", file=sys.stderr)
    sys.exit(2)

HERE = Path(__file__).resolve().parent
PANEL_W, PANEL_H = 1280, 720          # each panel; the sheet is a row of panels
BG = (16, 18, 24)
FG = (210, 214, 224)
DIM = (120, 126, 140)


def _fit(img, w, h):
    """Letterbox `img` into a w×h panel, preserving aspect."""
    panel = Image.new("RGB", (w, h), BG)
    im = img.convert("RGB")
    scale = min(w / im.width, h / im.height)
    nw, nh = max(1, int(im.width * scale)), max(1, int(im.height * scale))
    im = im.resize((nw, nh), Image.LANCZOS)
    panel.paste(im, ((w - nw) // 2, (h - nh) // 2))
    return panel


def _placeholder(w, h, label):
    panel = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(panel)
    d.rectangle([8, 8, w - 8, h - 8], outline=DIM, width=2)
    lines = [
        "REFERENCE SLOT — EMPTY",
        "",
        "Drop your own comparison screenshot in as",
        "art/screenshot-test/reference-rimworld.png",
        "(no image is shipped: no asset rights / no source)",
        "then re-run sheet.py for the blind A/B viewing.",
    ]
    y = h // 2 - 60
    for ln in lines:
        col = FG if ln and ln[0] not in " (" else DIM
        d.text((40, y), ln, fill=col)
        y += 22
    return panel


def _label(panel, text):
    d = ImageDraw.Draw(panel)
    d.rectangle([0, 0, panel.width, 26], fill=(0, 0, 0))
    d.text((10, 7), text, fill=FG)
    return panel


def build(candidate, far, reference, out):
    panels = []

    if candidate and Path(candidate).exists():
        panels.append(_label(_fit(Image.open(candidate), PANEL_W, PANEL_H), "A — perilune slice (near)"))
    else:
        panels.append(_label(_placeholder(PANEL_W, PANEL_H, "no candidate"), "A — perilune slice (near) [MISSING]"))

    if far and Path(far).exists():
        panels.append(_label(_fit(Image.open(far), PANEL_W, PANEL_H), "B — perilune slice (far)"))

    if reference and Path(reference).exists():
        panels.append(_label(_fit(Image.open(reference), PANEL_W, PANEL_H), "C — reference"))
    else:
        panels.append(_label(_placeholder(PANEL_W, PANEL_H, "no reference"), "C — reference [PLACEHOLDER]"))

    sheet = Image.new("RGB", (PANEL_W * len(panels), PANEL_H), BG)
    for i, p in enumerate(panels):
        sheet.paste(p, (i * PANEL_W, 0))
    sheet.save(out)
    print(f"sheet: {len(panels)} panels -> {out}"
          + ("" if (reference and Path(reference).exists()) else "  (reference is a PLACEHOLDER)"))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--candidate", default=str(HERE / "candidate.png"))
    ap.add_argument("--far", default=str(HERE / "candidate_far.png"))
    ap.add_argument("--reference", default=str(HERE / "reference-rimworld.png"))
    ap.add_argument("--out", default=str(HERE / "ab_sheet.png"))
    args = ap.parse_args()
    build(args.candidate, args.far, args.reference, args.out)


if __name__ == "__main__":
    main()
