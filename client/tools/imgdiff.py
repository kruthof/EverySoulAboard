#!/usr/bin/env python3
"""Channel-tolerance image diff for the render-parity harness (client/tools/shot.mjs).

Compares two PNGs (canvas2d = reference, webgl2 = candidate) and reports how close they are.
Parity is deliberately NOT pixel-perfect: the WebGL2 backend rasterizes the SAME procedural
painters + sprite images into an atlas, then samples it with nearest-neighbour magnify and
mipmapped minify under premultiplied-alpha blending — so tile positions, sprite choice, facing
and colours match, but antialiased edges and minified (zoomed-out) tiles differ by a few levels.

A pixel "matches" when its max per-channel absolute difference is <= --tol (default 40 / 255).
We report: image size, mean channel diff, max channel diff, and the match fraction. The
documented parity bar (see client/README.md) is match >= 0.90; the script exits 0 when met,
1 when not, and 2 on an error (missing file / size mismatch). It is a REPORT tool — the numbers
matter more than the exit code.

Dependency: Pillow (already a spritegen dependency). Usage:
    python3 client/tools/imgdiff.py REF.png CAND.png [--tol 40] [--bar 0.90]
"""
import argparse
import sys

try:
    from PIL import Image
except ImportError:
    print("imgdiff: Pillow (PIL) not installed — `pip install pillow`", file=sys.stderr)
    sys.exit(2)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("ref")
    ap.add_argument("cand")
    ap.add_argument("--tol", type=int, default=40, help="per-channel match tolerance (0-255)")
    ap.add_argument("--bar", type=float, default=0.90, help="min match fraction to PASS")
    args = ap.parse_args()

    try:
        a = Image.open(args.ref).convert("RGB")
        b = Image.open(args.cand).convert("RGB")
    except FileNotFoundError as e:
        print(f"imgdiff: missing file: {e.filename}", file=sys.stderr)
        return 2

    if a.size != b.size:
        print(f"imgdiff: SIZE MISMATCH ref={a.size} cand={b.size} — cannot compare", file=sys.stderr)
        return 2

    ap_ = a.load()
    bp_ = b.load()
    w, h = a.size
    total = w * h
    matched = 0
    sum_diff = 0
    max_diff = 0

    for y in range(h):
        for x in range(w):
            ra, ga, ba = ap_[x, y]
            rb, gb, bb = bp_[x, y]
            dr, dg, db = abs(ra - rb), abs(ga - gb), abs(ba - bb)
            m = dr if dr > dg else dg
            if db > m:
                m = db
            sum_diff += dr + dg + db
            if m > max_diff:
                max_diff = m
            if m <= args.tol:
                matched += 1

    mean_diff = sum_diff / (total * 3)
    frac = matched / total
    ok = frac >= args.bar

    print(f"  size          : {w} x {h}  ({total} px)")
    print(f"  mean chan diff : {mean_diff:6.3f} / 255")
    print(f"  max  chan diff : {max_diff:6d} / 255")
    print(f"  match (<= {args.tol:3d}) : {frac * 100:6.2f}%   (bar {args.bar * 100:.0f}%)")
    print(f"  parity         : {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
