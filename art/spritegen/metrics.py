#!/usr/bin/env python3
"""PERILUNE screenshot-test advisory gates (WS-ART X1).

Three numbers, computed off a committed slice frame, that tell us whether the art bar is
being HELD as the ship + sim evolve. All three are ADVISORY — this script prints numbers and
returns 0 unless invoked with --strict (CI never runs --strict; see ci.sh). The gates:

  1. sprite coverage     what fraction of drawn entities used real sprite art (not the
                         procedural fallback). Read off window.__renderStats, which the WebGL2
                         executor now exports and the shot harness scrapes to a small JSON
                         (art/screenshot-test/renderstats.json). No JSON ⇒ reported n/a.
  2. lighting dynamic    mean-luma ratio of the brightest lit content vs the dimmest lit
     range               ("brownout"/dead) content in the SAME frame. Pure black void/fog is
                         excluded (it is unexplored, not a dark room). The slice recipe forces
                         a dead wing so this ratio is meaningful; bar >= 2.5.
  3. style lock          hue-histogram distance between the candidate frame and a committed
                         accepted.png (saturation*value-weighted hue, Bhattacharyya distance).
                         0.0 on the first run (accepted == candidate); it climbs as the palette
                         drifts. Bar <= 0.20.

Self-contained (Pillow only). Usage:
    python3 art/spritegen/metrics.py CANDIDATE.png [--accepted ACCEPTED.png]
            [--renderstats RS.json] [--powered x,y,w,h] [--dead x,y,w,h]
            [--strict] [--json]
    python3 art/spritegen/metrics.py --selftest
"""
import argparse
import json
import math
import sys

try:
    from PIL import Image
except ImportError:
    print("metrics: Pillow (PIL) not installed — `pip install pillow`", file=sys.stderr)
    sys.exit(2)

COVERAGE_BAR = 0.60      # >= 60% of entities as real sprites
LUMA_RATIO_BAR = 2.5     # powered:dead mean-luma >= 2.5
HUE_DIST_BAR = 0.20      # <= 0.20 Bhattacharyya distance vs accepted
VOID_LUMA = 18           # a pixel dimmer than this is treated as void/fog, not a dark room


# ---------------------------------------------------------------- 1. sprite coverage
def gate_coverage(renderstats_path):
    """Return (coverage_fraction, detail_dict) or (None, reason) if unavailable."""
    if not renderstats_path:
        return None, "no --renderstats (harness did not scrape window.__renderStats)"
    try:
        rs = json.loads(open(renderstats_path).read())
    except (OSError, ValueError) as e:
        return None, f"renderstats unreadable: {e}"
    ent = rs.get("entities", 0)
    spr = rs.get("entitySprite", 0)
    if not ent:
        return None, "renderstats has zero entities (empty frame?)"
    return spr / ent, {"entities": ent, "entitySprite": spr,
                       "entityProc": rs.get("entityProc", 0),
                       "terrainTex": rs.get("terrainTex", 0),
                       "useSpr": rs.get("useSpr")}


# ------------------------------------------------------- 2. lighting dynamic range
def _luma_grid(img, cols, rows):
    """Mean luma per grid block, plus the block's non-void fill fraction. Blocks that are
    mostly void/fog are excluded from the powered/dead comparison (they are unexplored space)."""
    rgb = img.convert("RGB")
    W, H = rgb.size
    px = rgb.load()
    blocks = []
    for by in range(rows):
        for bx in range(cols):
            x0, x1 = bx * W // cols, (bx + 1) * W // cols
            y0, y1 = by * H // rows, (by + 1) * H // rows
            tot = 0.0
            lit = 0
            n = 0
            for y in range(y0, y1, 2):          # stride 2 for speed; plenty of samples
                for x in range(x0, x1, 2):
                    r, g, b = px[x, y]
                    l = 0.2126 * r + 0.7152 * g + 0.0722 * b
                    n += 1
                    if l >= VOID_LUMA:
                        tot += l
                        lit += 1
            if n:
                blocks.append({"fill": lit / n, "luma": (tot / lit) if lit else 0.0})
    return blocks


def _region_luma(img, rect):
    rgb = img.convert("RGB")
    x, y, w, h = rect
    px = rgb.load()
    W, H = rgb.size
    tot, n = 0.0, 0
    for yy in range(max(0, y), min(H, y + h), 2):
        for xx in range(max(0, x), min(W, x + w), 2):
            r, g, b = px[xx, yy]
            tot += 0.2126 * r + 0.7152 * g + 0.0722 * b
            n += 1
    return (tot / n) if n else 0.0


def gate_luma_ratio(img, powered_rect=None, dead_rect=None):
    """Ratio of powered mean-luma to dead mean-luma. If explicit rects are given, use them;
    otherwise auto-detect from a grid of lit content blocks (brightest vs dimmest quartile)."""
    if powered_rect and dead_rect:
        p = _region_luma(img, powered_rect)
        d = _region_luma(img, dead_rect)
        ratio = p / d if d > 0.5 else float("inf")
        return ratio, {"mode": "explicit", "powered_luma": round(p, 1), "dead_luma": round(d, 1)}
    # Auto: grid, keep blocks that are mostly real content (fill >= 0.5), rank by luma.
    blocks = [b for b in _luma_grid(img, 16, 9) if b["fill"] >= 0.5]
    if len(blocks) < 4:
        return None, {"mode": "auto", "reason": "not enough lit content blocks to compare"}
    lums = sorted(b["luma"] for b in blocks)
    k = max(1, len(lums) // 5)                  # top / bottom quintile
    dead = sum(lums[:k]) / k
    powered = sum(lums[-k:]) / k
    ratio = powered / dead if dead > 0.5 else float("inf")
    return ratio, {"mode": "auto", "blocks": len(blocks),
                   "powered_luma": round(powered, 1), "dead_luma": round(dead, 1)}


# ------------------------------------------------------------- 3. style lock (hue)
def _hue_hist(img, bins=36):
    """Saturation*value-weighted hue histogram (HSV). Near-grey / near-black pixels contribute
    little, so the histogram captures the palette's chromatic identity, not its lighting."""
    import colorsys
    rgb = img.convert("RGB")
    W, H = rgb.size
    px = rgb.load()
    hist = [0.0] * bins
    step = max(1, int(math.sqrt(W * H / 40000)))   # ~40k samples regardless of size
    for y in range(0, H, step):
        for x in range(0, W, step):
            r, g, b = (c / 255.0 for c in px[x, y])
            h, s, v = colorsys.rgb_to_hsv(r, g, b)
            w = s * v
            if w <= 0.02:
                continue
            hist[min(bins - 1, int(h * bins))] += w
    tot = sum(hist)
    return [c / tot for c in hist] if tot > 0 else hist


def _bhattacharyya(p, q):
    """Distance in [0,1]: 0 identical, 1 disjoint."""
    bc = sum(math.sqrt(a * b) for a, b in zip(p, q))
    return math.sqrt(max(0.0, 1.0 - bc))


def gate_style_lock(img, accepted_img):
    if accepted_img is None:
        return None, "no --accepted reference committed yet"
    return _bhattacharyya(_hue_hist(img), _hue_hist(accepted_img)), {}


# --------------------------------------------------------------------------- run
def _parse_rect(s):
    if not s:
        return None
    parts = [int(v) for v in s.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("rect must be x,y,w,h")
    return tuple(parts)


def run(args):
    img = Image.open(args.candidate)
    accepted = Image.open(args.accepted) if args.accepted else None

    cov, cov_detail = gate_coverage(args.renderstats)
    ratio, ratio_detail = gate_luma_ratio(img, _parse_rect(args.powered), _parse_rect(args.dead))
    dist, dist_detail = gate_style_lock(img, accepted)

    results = {
        "candidate": args.candidate,
        "sprite_coverage": {"value": cov, "bar": COVERAGE_BAR, "detail": cov_detail},
        "luma_ratio": {"value": ratio, "bar": LUMA_RATIO_BAR, "detail": ratio_detail},
        "style_lock_hue_dist": {"value": dist, "bar": HUE_DIST_BAR, "detail": dist_detail},
    }

    def status(val, bar, higher_is_better=True):
        if val is None:
            return "n/a"
        ok = (val >= bar) if higher_is_better else (val <= bar)
        return "PASS" if ok else "WARN"

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print(f"metrics: {args.candidate}")
        cv = f"{cov*100:5.1f}%" if cov is not None else str(cov_detail)
        print(f"  sprite coverage   : {cv:>8}  (bar >= {COVERAGE_BAR*100:.0f}%)  "
              f"{status(cov, COVERAGE_BAR)}")
        rv = f"{ratio:5.2f}x" if ratio is not None else str(ratio_detail.get('reason', ratio_detail))
        print(f"  lighting range    : {rv:>8}  (bar >= {LUMA_RATIO_BAR:.1f}x)  "
              f"{status(ratio, LUMA_RATIO_BAR)}   {ratio_detail}")
        dv = f"{dist:6.4f}" if dist is not None else str(dist_detail)
        print(f"  style-lock hue-d  : {dv:>8}  (bar <= {HUE_DIST_BAR:.2f})  "
              f"{status(dist, HUE_DIST_BAR, higher_is_better=False)}")

    if args.strict:
        bad = (cov is not None and cov < COVERAGE_BAR) \
            or (ratio is not None and ratio < LUMA_RATIO_BAR) \
            or (dist is not None and dist > HUE_DIST_BAR)
        return 1 if bad else 0
    return 0


# ---------------------------------------------------------------------- selftest
def _synth(color_rows):
    """Build a tiny RGB image from a list of (h_fraction_of_width, (r,g,b)) column bands stacked
    as full-height columns — handy for deterministic gate checks."""
    W = sum(int(f * 100) for f, _ in color_rows)
    H = 40
    im = Image.new("RGB", (W, H))
    px = im.load()
    x = 0
    for f, c in color_rows:
        w = int(f * 100)
        for xx in range(x, x + w):
            for y in range(H):
                px[xx, y] = c
        x += w
    return im


def selftest():
    ok = True

    # coverage parse
    import tempfile
    import os
    fd, path = tempfile.mkstemp(suffix=".json")
    os.write(fd, json.dumps({"entities": 10, "entitySprite": 8, "entityProc": 2}).encode())
    os.close(fd)
    cov, _ = gate_coverage(path)
    os.unlink(path)
    ok &= abs(cov - 0.8) < 1e-9
    print(f"  selftest coverage 0.8 == {cov}: {'OK' if abs(cov-0.8) < 1e-9 else 'FAIL'}")

    # luma ratio: a bright-white band beside a dim-grey band → ratio ~ 255/64 ≈ 4
    bright = (255, 255, 255)
    dim = (64, 64, 64)
    img = _synth([(0.5, bright), (0.5, dim)])
    ratio, det = gate_luma_ratio(img)
    ok &= ratio is not None and ratio >= LUMA_RATIO_BAR
    print(f"  selftest luma ratio {ratio:.2f} >= {LUMA_RATIO_BAR}: "
          f"{'OK' if ratio and ratio >= LUMA_RATIO_BAR else 'FAIL'}  {det}")

    # void excluded: pure black beside grey should NOT read as a huge ratio (black is void)
    img2 = _synth([(0.5, (100, 100, 100)), (0.5, (0, 0, 0))])
    r2, _ = gate_luma_ratio(img2)
    # only one content band survives → not enough blocks → None (or a modest ratio), never inf
    ok &= (r2 is None or r2 < 3.0)
    print(f"  selftest void-excluded (grey|black) ratio={r2}: "
          f"{'OK' if (r2 is None or r2 < 3.0) else 'FAIL'}")

    # hue distance: identical → 0; magenta vs cyan → large
    magenta = _synth([(1.0, (220, 30, 200))])
    cyan = _synth([(1.0, (30, 200, 220))])
    d_same, _ = gate_style_lock(magenta, magenta)
    d_diff, _ = gate_style_lock(magenta, cyan)
    ok &= d_same < 1e-6 and d_diff > 0.5
    print(f"  selftest hue-dist same={d_same:.4f} diff={d_diff:.4f}: "
          f"{'OK' if d_same < 1e-6 and d_diff > 0.5 else 'FAIL'}")

    print("selftest:", "OK" if ok else "FAIL")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("candidate", nargs="?", help="the slice frame PNG to score")
    ap.add_argument("--accepted", help="committed reference PNG for the style-lock gate")
    ap.add_argument("--renderstats", help="JSON of window.__renderStats scraped by the harness")
    ap.add_argument("--powered", help="explicit powered-region rect x,y,w,h (else auto)")
    ap.add_argument("--dead", help="explicit dead/brownout-region rect x,y,w,h (else auto)")
    ap.add_argument("--strict", action="store_true", help="exit 1 if any gate WARNs (CI never sets this)")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--selftest", action="store_true", help="run synthetic-image self checks and exit")
    args = ap.parse_args()

    if args.selftest:
        sys.exit(selftest())
    if not args.candidate:
        ap.error("candidate PNG required (or pass --selftest)")
    sys.exit(run(args))


if __name__ == "__main__":
    main()
