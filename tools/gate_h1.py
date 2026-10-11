"""GATE H1 (is "warmer" real?) and Warmr scoring calibration.

Inputs, all from the in-browser embedder (the runtime the app uses):
  --vocab-full   768-d vocab vectors (Float32, count x 768), from vocab-pack.mjs --full-out
  --photos       eval photo vectors {filename: [768 floats]}, local only (V's photos)
Labels come from the filenames (NN_*.jpg -> line NN of data/eval/prompts.txt;
anything else is a distractor), as in gonogo.py.

For each labelled photo: rank of its true prompt among the whole vocab, and
the temperature gap between the true prompt and random unrelated vocab items.
Then calibrates c_cold, c_hot and the "found" threshold and writes
data/scoring.json.

Pass if: true-prompt rank <= 10 for >= 70% of photos AND mean gap >= 30 deg.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent


def unit(m: np.ndarray) -> np.ndarray:
    return m / np.linalg.norm(m, axis=-1, keepdims=True)


def temperature(sim, c_cold: float, c_hot: float):
    return np.clip(np.round(100 * (np.asarray(sim) - c_cold) / (c_hot - c_cold)), 0, 100)


def rank_of(sims_row: np.ndarray, j: int) -> int:
    return 1 + int(np.sum(sims_row > sims_row[j]))


def analyse(V: np.ndarray, P: np.ndarray, names: list[str], vocab: list[str], prompts: list[str],
            n_unrelated: int = 20, related_cos: float = 0.8, seed: int = 0, quiet: bool = False):
    S = P @ V.T  # photos x vocab
    TT = V @ V.T  # text x text
    vidx = {t: i for i, t in enumerate(vocab)}
    eval_j = [vidx[p] for p in prompts]
    labels = []
    for n in names:
        m = re.match(r"^(\d+)_", n)
        labels.append(int(m.group(1)) - 1 if m else None)

    # calibration on eval prompts only (as the spec: matching vs non-matching
    # photo/text sims from the eval data), at this dimension
    match, nonmatch = [], []
    for i, lab in enumerate(labels):
        for k, j in enumerate(eval_j):
            (match if lab == k else nonmatch).append(S[i, j])
    c_cold = float(np.percentile(nonmatch, 10))
    c_hot = float(np.median(match))

    rng = np.random.default_rng(seed)
    rows = []
    for i, lab in enumerate(labels):
        if lab is None:
            continue
        j = eval_j[lab]
        unrelated = [u for u in range(len(vocab)) if TT[j, u] < related_cos]
        pick = rng.choice(unrelated, size=n_unrelated, replace=False)
        t_true = float(temperature(S[i, j], c_cold, c_hot))
        t_unrel = float(np.mean(temperature(S[i, pick], c_cold, c_hot)))
        rows.append({"photo": names[i], "prompt": prompts[lab], "rank": rank_of(S[i], j),
                     "sim": float(S[i, j]), "temp": t_true, "unrelated_temp": t_unrel, "gap": t_true - t_unrel,
                     "top": vocab[int(np.argmax(S[i]))]})

    # "found" threshold: wrong = each photo against every eval prompt that is
    # not its own (distractors against all of them)
    def wins(i, j, found):
        return rank_of(S[i], j) == 1 or temperature(S[i, j], c_cold, c_hot) >= found
    correct_pairs = [(i, eval_j[l]) for i, l in enumerate(labels) if l is not None]
    wrong_pairs = [(i, j) for i, l in enumerate(labels) for k, j in enumerate(eval_j) if l != k]
    sweep = []
    for found in range(50, 101):
        cw = np.mean([wins(i, j, found) for i, j in correct_pairs])
        ww = np.mean([wins(i, j, found) for i, j in wrong_pairs])
        sweep.append((found, float(cw), float(ww)))
    ok = [s for s in sweep if s[1] >= 0.7 and s[2] <= 0.10]
    chosen = min(ok, key=lambda s: s[0]) if ok else min(sweep, key=lambda s: (s[2] > 0.10, -s[1] + s[2]))
    rank1_only = (float(np.mean([rank_of(S[i], j) == 1 for i, j in correct_pairs])),
                  float(np.mean([rank_of(S[i], j) == 1 for i, j in wrong_pairs])))
    return {"c_cold": c_cold, "c_hot": c_hot, "rows": rows, "found": chosen, "found_ok": bool(ok),
            "rank1_only": rank1_only, "n_match": len(match), "n_nonmatch": len(nonmatch)}


def report(dim: int, r: dict) -> dict:
    rows = r["rows"]
    ranks = np.array([x["rank"] for x in rows])
    gaps = np.array([x["gap"] for x in rows])
    top10 = float(np.mean(ranks <= 10))
    print(f"\n=== {dim}-d: c_cold {r['c_cold']:.4f} (p10 of {r['n_nonmatch']} non-matching), "
          f"c_hot {r['c_hot']:.4f} (median of {r['n_match']} matching)")
    print(f"{'photo':22s} {'rank':>5s} {'sim':>6s} {'temp':>5s} {'unrel':>6s} {'gap':>5s}  nearest vocab item")
    for x in rows:
        print(f"{x['photo']:22s} {x['rank']:5d} {x['sim']:6.3f} {x['temp']:5.0f} {x['unrelated_temp']:6.1f} {x['gap']:5.1f}  {x['top']}")
    print(f"rank <= 10: {np.sum(ranks <= 10)}/{len(ranks)} = {top10:.0%}   rank 1: {np.sum(ranks == 1)}/{len(ranks)}   "
          f"median rank {np.median(ranks):.0f}   mean gap {gaps.mean():.1f} deg (min {gaps.min():.1f})")
    f, cw, ww = r["found"]
    print(f"found threshold {f}: correct win {cw:.0%}, wrong win {ww:.0%} "
          f"({'meets' if r['found_ok'] else 'CANNOT meet'} >=70% / <=10%); rank-1 alone: correct {r['rank1_only'][0]:.0%}, wrong {r['rank1_only'][1]:.0%}")
    passed = top10 >= 0.7 and gaps.mean() >= 30
    print(f"GATE H1: {'PASS' if passed else 'FAIL'} (rank<=10 for {top10:.0%} >= 70%? mean gap {gaps.mean():.1f} >= 30?)")
    return {"top10": top10, "mean_gap": float(gaps.mean()), "pass": passed}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--vocab-full", type=Path, required=True)
    ap.add_argument("--photos", type=Path, required=True)
    ap.add_argument("--dims", default="768,256")
    ap.add_argument("--app-dim", type=int, default=256, help="dimension the app ships; its numbers go to scoring.json")
    ap.add_argument("--write", type=Path, help="write the app-dim calibration here (data/scoring.json)")
    args = ap.parse_args(argv)

    vocab = [x["text"] for x in json.loads((ROOT / "data/vocab.json").read_text())["items"]]
    prompts = [s.strip() for s in (ROOT / "data/eval/prompts.txt").read_text().splitlines() if s.strip()]
    full = np.fromfile(args.vocab_full, dtype="<f4").reshape(len(vocab), -1)
    photos = json.loads(args.photos.read_text())
    names = sorted(photos)
    Pfull = np.array([photos[n] for n in names], dtype=np.float32)
    print(f"vocab {full.shape}, photos {Pfull.shape}")

    out = {}
    for d in map(int, args.dims.split(",")):
        r = analyse(unit(full[:, :d]), unit(Pfull[:, :d]), names, vocab, prompts)
        out[d] = (r, report(d, r))

    if args.write:
        r, g = out[args.app_dim]
        f, cw, ww = r["found"]
        args.write.write_text(json.dumps({
            "dim": args.app_dim,
            "c_cold": round(r["c_cold"], 5),
            "c_hot": round(r["c_hot"], 5),
            "found": f,
            "metrics": {"correct_win": round(cw, 3), "wrong_win": round(ww, 3),
                        "rank_le_10": round(g["top10"], 3), "mean_gap": round(g["mean_gap"], 1),
                        "gate_h1": "PASS" if g["pass"] else "FAIL"},
            "source": "browser (LiteRT, Edge WebGPU) embeddings of data/eval/photos (local only) "
                      "vs data/vocab.json; c_cold = p10 of non-matching eval prompt sims, "
                      "c_hot = median matching sim (tools/gate_h1.py)",
            "computed": dt.date.today().isoformat(),
        }, indent=1) + "\n")
        print(f"\nwrote {args.write}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
