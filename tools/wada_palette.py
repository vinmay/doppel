"""Pick Warmr's palette from Sanzo Wada's A Dictionary of Color Combinations.

Source: data/wada/colors.json (github.com/mattdesl/dictionary-of-colour-combinations,
MIT). Every color the app uses comes from that file; nothing is invented or tweaked.

1. Base: one numbered combination of 3 or 4 colors, used as given, for
   background / surface / text / accent. It must have a deep, muted ground
   (not near-black), text that passes WCAG AA on it, and a warm pigment accent.
2. Ramp: 6 stops from cold to hot (a thermal "iron" order: deep blue ->
   violet -> red -> orange -> yellow), rising in L*, where as many adjacent
   pairs as possible appear together in a Wada combination.

Prints its reasoning, writes web/src/wada.css and data/wada/palette.json.

Usage: python wada_palette.py
"""

from __future__ import annotations

import argparse
import itertools
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------- color math

def rel_luminance(hex_: str) -> float:
    rgb = [int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a: str, b: str) -> float:
    la, lb = sorted((rel_luminance(a), rel_luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def chroma(c: dict) -> float:
    return math.hypot(c["lab"][1], c["lab"][2])


def hue(c: dict) -> float:
    """CIELAB hue angle in degrees, 0..360."""
    return math.degrees(math.atan2(c["lab"][2], c["lab"][1])) % 360


def thermal_pos(c: dict) -> float:
    """Position along the cold->hot hue path. LAB hue: blue ~250-300,
    violet ~320, red ~30, orange ~60, yellow ~90. Starting the circle at 230
    makes that path increase monotonically."""
    return (hue(c) - 230) % 360


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def is_warm(c: dict) -> bool:
    return 15 <= hue(c) <= 95 and chroma(c) >= 30


# ---------------------------------------------------------------- base

def combos(colors: list[dict]) -> dict[int, list[int]]:
    out: dict[int, list[int]] = {}
    for i, c in enumerate(colors):
        for k in c["combinations"]:
            out.setdefault(k, []).append(i)
    return out


def assign_roles(colors: list[dict], idx: list[int]) -> dict | None:
    """bg = darkest; fg = best contrast on bg; accent = most chromatic warm
    color left; surface = the remaining color (4-color combos) or bg."""
    cs = sorted(idx, key=lambda i: colors[i]["lab"][0])
    bg = cs[0]
    rest = cs[1:]
    fg = max(rest, key=lambda i: contrast(colors[i]["hex"], colors[bg]["hex"]))
    warm = [i for i in rest if i != fg and is_warm(colors[i])]
    if not warm:
        return None
    accent = max(warm, key=lambda i: chroma(colors[i]))
    left = [i for i in rest if i not in (fg, accent)]
    surface = left[0] if left else bg
    return {"bg": bg, "surface": surface, "fg": fg, "accent": accent}


def base_score(colors: list[dict], roles: dict) -> tuple[float, list[str]]:
    """Higher is better; returns (score, reasons). -inf means rejected."""
    bg, fg, ac, sf = (colors[roles[k]] for k in ("bg", "fg", "accent", "surface"))
    why = []
    L, C = bg["lab"][0], chroma(bg)
    if L < 12:
        return -math.inf, ["ground too close to black"]
    if L > 35:
        return -math.inf, ["ground not deep"]
    if C > 30:
        return -math.inf, ["ground not muted"]
    if fg["lab"][0] > 97:
        return -math.inf, ["text is pure white"]
    c_fg = contrast(fg["hex"], bg["hex"])
    c_fg_sf = contrast(fg["hex"], sf["hex"])
    c_ac = contrast(ac["hex"], bg["hex"])
    if c_fg < 4.5 or c_fg_sf < 4.5:
        return -math.inf, [f"text contrast fails AA (bg {c_fg:.2f}, surface {c_fg_sf:.2f})"]
    if c_ac < 3:
        return -math.inf, [f"accent contrast {c_ac:.2f} < 3 for large text"]
    score = 0.0
    score += min(c_fg, 10) * 1.0; why.append(f"text {c_fg:.2f}:1")
    score += min(c_ac, 7) * 0.8; why.append(f"accent {c_ac:.2f}:1")
    score += (30 - C) / 10; why.append(f"ground L*{L:.0f} C*{C:.0f}")
    score += min(chroma(ac), 70) / 20; why.append(f"accent chroma {chroma(ac):.0f}")
    if roles["surface"] != roles["bg"]:
        score += 1.5; why.append("has a distinct surface color")
        if abs(sf["lab"][0] - L) > 25:
            score -= 2; why.append("surface far from ground")
    return score, why


def pick_base(colors, cmb, prefer: int | None = None):
    scored = []
    for k, idx in sorted(cmb.items()):
        if len(idx) not in (3, 4):
            continue
        roles = assign_roles(colors, idx)
        if not roles:
            continue
        s, why = base_score(colors, roles)
        if s > -math.inf:
            scored.append((s, k, roles, why))
    scored.sort(key=lambda t: -t[0])
    if prefer is not None:
        chosen = next(t for t in scored if t[1] == prefer)
    else:
        chosen = scored[0]
    return chosen, scored


# ---------------------------------------------------------------- ramp

def pair_combos(colors, a: int, b: int) -> list[int]:
    return sorted(set(colors[a]["combinations"]) & set(colors[b]["combinations"]))


def ramp_candidates(colors, n: int = 6):
    """All length-n sequences, L* strictly rising, thermal hue position
    rising, stops reasonably saturated. Searched as a DFS so neighbours that
    share a combination are explored first."""
    ok = [i for i, c in enumerate(colors) if chroma(c) >= 20 and 12 <= c["lab"][0] <= 92]
    ok.sort(key=lambda i: colors[i]["lab"][0])
    # the cold end must actually be cold (blue/violet) and the hot end yellow-ish
    start = [i for i in ok if 0 <= thermal_pos(colors[i]) <= 80 and colors[i]["lab"][0] <= 40]
    results = []

    def dfs(path):
        if len(path) == n:
            last = colors[path[-1]]
            if 60 <= hue(last) <= 100 and last["lab"][0] >= 70:
                results.append(list(path))
            return
        cur = colors[path[-1]]
        for j in ok:
            c = colors[j]
            if c["lab"][0] <= cur["lab"][0] + 6:  # visibly lighter each step
                continue
            dp = thermal_pos(c) - thermal_pos(cur)
            if not (10 <= dp <= 90):
                continue
            path.append(j)
            dfs(path)
            path.pop()

    for s in start:
        dfs([s])
    return results


def ramp_score(colors, path, base_idx: set[int] = frozenset()) -> tuple[float, int]:
    """Linked pairs dominate; then even L* steps, a wide L* span, and reuse of
    base-combination colors (so the ramp and the chrome read as one print)."""
    links = sum(1 for a, b in zip(path, path[1:]) if pair_combos(colors, a, b))
    Ls = [colors[i]["lab"][0] for i in path]
    steps = [b - a for a, b in zip(Ls, Ls[1:])]
    evenness = -float(sum((s - (Ls[-1] - Ls[0]) / (len(Ls) - 1)) ** 2 for s in steps)) ** 0.5
    span = Ls[-1] - Ls[0]
    shared = sum(1 for i in path if i in base_idx)
    return links * 10 + evenness * 0.3 + span * 0.1 + shared * 1.0, links


# ---------------------------------------------------------------- output

def write_css(path: Path, colors, base, ramp, combo_no: int):
    names = []
    for i in list(base.values()) + ramp:
        if i not in names:
            names.append(i)
    lines = [
        "/* Generated by tools/wada_palette.py. Do not edit by hand.",
        f" * Every color is from Sanzo Wada, A Dictionary of Color Combinations (1933),",
        " * via github.com/mattdesl/dictionary-of-colour-combinations (MIT).",
        f" * Base: Wada combination no. {combo_no}. Ramp: cold -> hot. */",
        ":root {",
    ]
    for i in names:
        lines.append(f"  --wada-{slug(colors[i]['name'])}: {colors[i]['hex']}; /* {colors[i]['name']} */")
    for role, var in (("bg", "--bg"), ("surface", "--surface"), ("fg", "--fg"), ("accent", "--accent")):
        lines.append(f"  {var}: var(--wada-{slug(colors[base[role]]['name'])});")
    for k, i in enumerate(ramp):
        lines.append(f"  --temp-{k}: var(--wada-{slug(colors[i]['name'])});")
    lines.append("}")
    path.write_text("\n".join(lines) + "\n")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--colors", type=Path, default=ROOT / "data/wada/colors.json")
    ap.add_argument("--css", type=Path, default=ROOT / "web/src/wada.css")
    ap.add_argument("--json", type=Path, default=ROOT / "data/wada/palette.json")
    ap.add_argument("--combo", type=int, help="force a base combination number")
    ap.add_argument("--top", type=int, default=8)
    args = ap.parse_args(argv)

    colors = json.loads(args.colors.read_text())
    cmb = combos(colors)
    print(f"{len(colors)} colors, {len(cmb)} combinations")
    name = lambda i: f"{colors[i]['name']} {colors[i]['hex']}"

    (s, k, roles, why), scored = pick_base(colors, cmb, args.combo)
    print(f"\nBase candidates passing the rules: {len(scored)}. Top {args.top}:")
    for sc, kk, rr, ww in scored[: args.top]:
        print(f"  #{kk:3d} score {sc:5.2f}  bg {name(rr['bg'])} | fg {name(rr['fg'])} | accent {name(rr['accent'])} | surface {name(rr['surface'])}")
        print(f"         {'; '.join(ww)}")
    print(f"\nChosen base: combination #{k} ({len(cmb[k])} colors)")
    for role in ("bg", "surface", "fg", "accent"):
        print(f"  {role:8s} {name(roles[role])}  L*{colors[roles[role]]['lab'][0]:.0f}")

    paths = ramp_candidates(colors)
    base_idx = set(cmb[k])
    ranked = sorted(paths, key=lambda p: -ramp_score(colors, p, base_idx)[0])
    best_links = max(ramp_score(colors, p)[1] for p in paths)
    print(f"\nMost linked pairs any ramp reaches: {best_links}/5")
    print(f"\nRamp candidates (6 stops, L* and hue rising): {len(paths)}. Top 5:")
    for p in ranked[:5]:
        sc, links = ramp_score(colors, p, base_idx)
        print(f"  score {sc:6.2f} linked pairs {links}/5: " + " -> ".join(colors[i]["name"] for i in p))
    ramp = ranked[0]
    print("\nChosen ramp (cold -> hot):")
    pairs = []
    for n, i in enumerate(ramp):
        c = colors[i]
        print(f"  temp-{n} {name(i)}  L*{c['lab'][0]:.0f} hue {hue(c):.0f} C*{chroma(c):.0f}  on bg {contrast(c['hex'], colors[roles['bg']]['hex']):.2f}:1")
    for a, b in zip(ramp, ramp[1:]):
        pc = pair_combos(colors, a, b)
        pairs.append({"from": colors[a]["name"], "to": colors[b]["name"], "combinations": pc})
        print(f"  {colors[a]['name']} + {colors[b]['name']}: {'combinations ' + ', '.join(map(str, pc)) if pc else 'NOT together in any combination'}")

    bg = colors[roles["bg"]]["hex"]
    contrasts = {
        "fg/bg": contrast(colors[roles["fg"]]["hex"], bg),
        "fg/surface": contrast(colors[roles["fg"]]["hex"], colors[roles["surface"]]["hex"]),
        "accent/bg": contrast(colors[roles["accent"]]["hex"], bg),
        **{f"temp-{n}/bg": contrast(colors[i]["hex"], bg) for n, i in enumerate(ramp)},
    }
    write_css(args.css, colors, roles, ramp, k)
    pick = lambda i: {"name": colors[i]["name"], "slug": slug(colors[i]["name"]), "hex": colors[i]["hex"], "lab": colors[i]["lab"]}
    args.json.write_text(json.dumps({
        "source": "data/wada/colors.json (mattdesl/dictionary-of-colour-combinations, MIT)",
        "base_combination": k,
        "base": {r: pick(i) for r, i in roles.items()},
        "ramp": [pick(i) for i in ramp],
        "ramp_pairs": pairs,
        "contrast": {k2: round(v, 2) for k2, v in contrasts.items()},
    }, indent=1) + "\n")
    print(f"\nwrote {args.css} and {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
