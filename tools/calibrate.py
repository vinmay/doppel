"""Pick the softmax temperature T for Sense Hunt scores from go/no-go results.

The app scores a photo as softmax over (target + 10 decoys) at temperature T,
shown as 0..100. Here we simulate that with the eval data: for each labelled
photo, the true prompt is the target and 10 other eval prompts (random subsets,
repeated) are the decoys. For each T in a grid we measure:
  - mean score when the true prompt is the top-1 match ("correct")
  - mean score when it isn't ("wrong")
and pick the T whose correct mean lands near 85 (inside 70..95) while the wrong
mean stays below 40.

Usage:
  python calibrate.py --results ../data/eval/results.json --out ../data/scoring.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np

GRID = np.round(np.concatenate([np.arange(0.005, 0.02, 0.0025), np.arange(0.02, 0.1001, 0.005)]), 4)
N_DECOYS = 10
SUBSETS = 200
CORRECT_RANGE = (70.0, 95.0)
CORRECT_TARGET = 85.0
WRONG_MAX = 40.0
GREAT, CLOSE = 75, 40


def softmax0(x: np.ndarray, t: float) -> np.ndarray:
    """Probability of column 0 for each row of x."""
    z = (x - x.max(axis=-1, keepdims=True)) / t
    e = np.exp(z)
    return e[..., 0] / e.sum(axis=-1)


def simulated_scores(sims: np.ndarray, labels: list, t: float, rng: np.random.Generator):
    """(scores, top1_correct) for every labelled photo x decoy subset."""
    n_prompts = sims.shape[1]
    scores, correct = [], []
    for row, lab in zip(sims, labels):
        if lab is None:
            continue
        others = np.array([j for j in range(n_prompts) if j != lab])
        k = min(N_DECOYS, len(others))
        top1 = int(np.argmax(row)) == lab  # against the full eval prompt set
        for _ in range(SUBSETS if len(others) > k else 1):
            decoys = rng.choice(others, size=k, replace=False)
            scores.append(100 * softmax0(row[np.concatenate([[lab], decoys])][None, :], t)[0])
            correct.append(top1)
    return np.array(scores), np.array(correct, dtype=bool)


def distractor_scores(sims: np.ndarray, labels: list, t: float, rng: np.random.Generator) -> np.ndarray:
    """Scores unlabelled photos would get if each prompt in turn were the target."""
    n_prompts = sims.shape[1]
    out = []
    for row, lab in zip(sims, labels):
        if lab is not None:
            continue
        for target in range(n_prompts):
            others = np.array([j for j in range(n_prompts) if j != target])
            decoys = rng.choice(others, size=min(N_DECOYS, len(others)), replace=False)
            out.append(100 * softmax0(row[np.concatenate([[target], decoys])][None, :], t)[0])
    return np.array(out)


def sweep(sims: np.ndarray, labels: list, seed: int = 0) -> list[dict]:
    rows = []
    for t in GRID:
        rng = np.random.default_rng(seed)
        s, c = simulated_scores(sims, labels, float(t), rng)
        d = distractor_scores(sims, labels, float(t), rng)
        rows.append({
            "T": float(t),
            "correct_mean": float(s[c].mean()) if c.any() else None,
            "wrong_mean": float(s[~c].mean()) if (~c).any() else None,
            "correct_great_frac": float((s[c] >= GREAT).mean()) if c.any() else None,
            "wrong_close_frac": float((s[~c] >= CLOSE).mean()) if (~c).any() else None,
            "distractor_mean": float(d.mean()) if d.size else None,
        })
    return rows


def choose(rows: list[dict]) -> tuple[dict, bool]:
    """Best row and whether it met both constraints."""
    def ok(r):
        cm, wm = r["correct_mean"], r["wrong_mean"]
        return cm is not None and CORRECT_RANGE[0] <= cm <= CORRECT_RANGE[1] and (wm is None or wm < WRONG_MAX)

    good = [r for r in rows if ok(r)]
    pool = good or [r for r in rows if r["correct_mean"] is not None]
    if not pool:
        raise SystemExit("no labelled photos in results")
    return min(pool, key=lambda r: abs(r["correct_mean"] - CORRECT_TARGET)), bool(good)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--results", type=Path, required=True)
    ap.add_argument("--out", type=Path, help="write data/scoring.json")
    ap.add_argument("--source", default=None, help="label stored in scoring.json (default: results path)")
    args = ap.parse_args(argv)

    res = json.loads(args.results.read_text())
    sims = np.asarray(res["sims"], dtype=np.float64)
    labels = res["labels"]
    n_lab = sum(lab is not None for lab in labels)
    print(f"{len(labels)} photos ({n_lab} labelled), {sims.shape[1]} prompts; "
          f"simulating 1 target + {N_DECOYS} decoys, {SUBSETS} subsets each")

    rows = sweep(sims, labels)
    fmt = lambda v: "   -" if v is None else f"{v:5.1f}"  # noqa: E731
    print("     T  correct  wrong  great%  wrong>=close%  distractor")
    for r in rows:
        print(f"{r['T']:6.4f}  {fmt(r['correct_mean'])}  {fmt(r['wrong_mean'])}  "
              f"{fmt(None if r['correct_great_frac'] is None else 100 * r['correct_great_frac'])}  "
              f"{fmt(None if r['wrong_close_frac'] is None else 100 * r['wrong_close_frac'])}         "
              f"{fmt(r['distractor_mean'])}")

    best, met = choose(rows)
    print(f"chosen T = {best['T']} (correct mean {best['correct_mean']:.1f}, "
          f"wrong mean {fmt(best['wrong_mean']).strip()}){'' if met else '  WARNING: constraints not met'}")

    if args.out:
        args.out.write_text(json.dumps({
            "temperature": best["T"],
            "great": GREAT,
            "close": CLOSE,
            "n_decoys": N_DECOYS,
            "constraints_met": met,
            "metrics": best,
            "source": args.source or str(args.results),
            "model": res.get("model"),
            "computed": dt.date.today().isoformat(),
        }, indent=2) + "\n")
        print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
