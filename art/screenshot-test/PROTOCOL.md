# PERILUNE screenshot test — the art bar, held over time (WS-ART X1)

The vision (docs/VISION.md, "Art ambition") commits us to a screen that is *strictly better than
RimWorld on a narrower surface*. This directory is the instrument that keeps us honest about it:
a **repeatable slice frame**, three **advisory metrics**, and a **blind 3-viewer A/B ritual**.

Nothing here can fail CI (art is a judgement call, not a unit test). It exists to make drift
*visible* — a number that slid, a frame that stopped looking like the last one — early.

---

## 1. The repeatable frame

```
node art/screenshot-test/slice-shot.mjs
```

What it does, deterministically:

1. Boots the **authored 8-crew slice** host: `hosts/web --port 8341 --ship slice`
   (seed `AuthoredShips.SliceSeed = 20260721`).
2. Serves the static client and drives **headless Chrome + WebGL2** (SwiftShader, software GL).
3. Switches the global session to **deck 1** over the wire (`{"cmd":"deck","dz":1}`) — see the
   lighting recipe below.
4. Freezes animation with `?t=0` and pins the camera, then screenshots **2560×1440** at two zooms:
   - `candidate.png` — zoom 72, the **near hero** framing (the quarters: lit hall under dark cabins).
   - `candidate_far.png` — zoom 32, the **establishing** framing (the whole deck's lighting range).
5. Scrapes `window.__renderStats` off the console into `renderstats.json`, runs the advisory
   gates (`art/spritegen/metrics.py`) and builds the A/B sheet (`sheet.py`).

### The lighting recipe (why deck 1, and why no "brownout command")

The brief asked to *force* a dead/brownout region via a MOSS or door/vent command. **The sim cannot
do that**, and this is load-bearing, so it is written down:

- The slice is **one ship-wide power network** — `AuthoredShips.AddConduits` lays a conduit tray
  under every walkable tile, and vertical risers join the decks. There is no per-wing grid.
- **No command reduces power to a region.** `SetDeviceStateCommand` / `SetDoorStateCommand` mutate
  only `IsOpen`/`Rate`/`IsLocked` (`Commands.cs`); the MOSS device adapters bind no `Light`,
  `Conduit`, or `Battery` (`DeviceAdapters.cs` / `MossBindings.cs`); generation is summed
  unconditionally by network, never gated by a device toggle (`PowerSystem.cs`). A demand-driven
  brownout would need 35 kWh of battery to drain and would then darken the **whole ship**, not a wing.

So the recipe uses the **deterministic boot state**, which is strictly more repeatable (no command,
no timing window):

- The four crew **cabins** (deck 1, x42–60, y1–4) have **no `Light` device** → `LightMapper`
  projects them as `Dead(1)` → the client paints a near-black overlay (`palette.LIGHT[1]`).
- One row south, the quarters **hall** has `light_quarters (51,6,1)` → `Powered(4)` → bright.
- The sealed **bridge / observatory / aft** add dark *fog* (rendered as hull silhouette, `Unknown`).

A single `deck` command puts the lit hall and the dead cabins in the same frame. That IS a scripted
wire command driving the lighting variety — just a `deck` command, because no power command exists.

### Repeatability & drift tolerance (the C2 caveat)

The sim keeps **ticking** while the host is up, so in principle two runs can drift: once a crew
member has an unmet need it wanders, the HUD clock and needs advance. What is stable regardless:
the map, the lighting/cabins (boot state), the palette, and `?t=0` freezing the reticle/animation.

In practice, at the harness's early settle the shot lands at **DAY 0.00** — before any need is unmet,
so the crew are still on their deterministic start tiles and the frame is boot-static. **Measured on
this lane's two back-to-back runs: `imgdiff` match = 100.00 % (0 byte diff)** on BOTH the
establishing and the near frames. Drift only appears if you raise `--settle-ms` past the point where
crew begin moving; then treat frames as **parity-comparable** (`client/tools/imgdiff.py`, match
≳ 0.90 on the map-dominated establishing shot), never hash-identical. Either way the advisory gates
read the **establishing** shot, which is map-dominated (the pawn is ~1 % of pixels) and thus the
most run-stable. If a run drops below ~0.95, suspect a real change, not drift.

---

## 2. The three advisory gates (`art/spritegen/metrics.py`)

| gate | what | bar | this baseline |
|------|------|-----|---------------|
| **sprite coverage** | fraction of drawn entities using real sprite art (not the procedural fallback), off `window.__renderStats` | ≥ 60 % | **86.9 %** |
| **lighting dynamic range** | mean-luma ratio, brightest lit content vs dimmest lit (dead) content in one frame; void/fog excluded | ≥ 2.5× | **2.80×** (establishing) |
| **style lock** | hue-histogram (sat·val-weighted) Bhattacharyya distance vs `accepted.png` | ≤ 0.20 | **0.000** (baseline) |

`accepted.png` is committed **from this first run** (a copy of the establishing frame). It is the
style anchor: as the palette drifts, the style-lock number climbs off 0. To re-baseline after an
*intended* art change, re-run the rig and `cp candidate_far.png accepted.png`.

CI runs one advisory line (`ci.sh`) that scores the committed `accepted.png` against itself +
`renderstats.json` — Chrome-free, so it works on any box, and never fails the gate.

Self-test the metrics without a browser: `python3 art/spritegen/metrics.py --selftest`.

---

## 3. The blind 3-viewer A/B ritual

`sheet.py` composes the slice frames beside a **reference** into `ab_sheet.png`. We ship **no
RimWorld image** (no asset rights, no reliable source): the reference panel renders a labeled
**placeholder** until you drop your own screenshot in as `art/screenshot-test/reference-rimworld.png`
and re-run `sheet.py`.

**The ritual** (run when judging an art milestone, not every commit):

1. Put a genuine RimWorld interior screenshot at `reference-rimworld.png`; rebuild the sheet.
2. Recruit **three** viewers who are *not* on the art lane. Do not tell them which panel is ours.
3. Ask each, independently, one question: **"Which colony looks like the more expensive game, and
   why in one sentence?"** Record the pick + the one sentence.
4. **Bar:** the slice frame wins **≥ 2 of 3**, and no viewer calls it "the cheap one". A loss is not
   a CI failure — it is a work order for the art lane (docs/VISION.md: *WS-ART/WS-CLIENT stop
   feature work until it does*).
5. File the three sentences next to the date. Verbatim beats a rating.

The blind viewing is the real gate; the three numbers above just tell us *when* it is worth
convening one.

---

## Files

- `slice-shot.mjs` — the repeatable frame harness (boot → deck → freeze → shoot → scrape → score).
- `../spritegen/metrics.py` — the three advisory gates (+ `--selftest`).
- `sheet.py` — the A/B sheet builder (handles a missing reference with a placeholder panel).
- `accepted.png` — the committed style anchor (establishing frame, this baseline).
- `renderstats.json` — the committed `window.__renderStats` snapshot (CI coverage gate input).
- `reference-rimworld.png` — **you provide this**; git-ignored, never shipped.
- `candidate.png` / `candidate_far.png` / `ab_sheet.png` — regenerated each run (git-ignored).
