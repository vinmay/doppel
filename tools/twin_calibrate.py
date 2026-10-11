"""D1 calibration for Doppel, on browser (LiteRT, WebGPU) embeddings.

Inputs (local only, never committed):
  data/eval/photo-vectors.json   {"eval/<name>.jpg": [768 floats], "fx/<set>/<file>.jpg": [...]}
  data/eval/vocab-full-768.bin   Float32 rows of data/vocab.json, 768-d
Outputs:
  data/twin-scoring.json         score mapping, uncertainty margin, attribute stats + threshold
  data/eval/twin-candidates/     top-10 different-label eval pairs as side-by-side thumbnails (local)
  stdout                         the numbers for LOG.md

Usage: python tools/twin_calibrate.py [--dim 256] [--write]
"""
import argparse
import itertools
import json
import re
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
EVAL = ROOT / "data" / "eval"


def unit(m):
    return m / np.linalg.norm(m, axis=-1, keepdims=True)


def load(dim):
    photos = json.loads((EVAL / "photo-vectors.json").read_text())
    names = sorted(photos)
    P = unit(np.array([photos[n] for n in names], dtype=np.float64)[:, :dim])
    vocab = json.loads((ROOT / "data" / "vocab.json").read_text())
    V = np.fromfile(EVAL / "vocab-full-768.bin", dtype=np.float32).reshape(vocab["count"], -1)
    V = unit(V[:, :dim].astype(np.float64))
    return names, P, vocab["items"], V


def eval_label(name):
    """eval/01_leaf2.jpg -> '01' (V named same-subject photos with the same number); x_* are singletons."""
    stem = name.split("/")[-1]
    m = re.match(r"(\d+)_", stem)
    return m.group(1) if m else stem


def pct(a, q):
    return float(np.percentile(a, q))


def score(sim, lo, hi):
    return float(np.clip(np.round(100 * (sim - lo) / (hi - lo)), 0, 100))


def save_candidates(pairs, lo, hi):
    """Side-by-side thumbnails of the top different-label eval pairs (local only, for V to eyeball)."""
    from PIL import Image, ImageOps

    out = EVAL / "twin-candidates"
    out.mkdir(exist_ok=True)
    for f in out.glob("*.jpg"):
        f.unlink()
    for k, (s, x, y) in enumerate(pairs, 1):
        ims = []
        for n in (x, y):
            stem = n.split("/")[-1].removesuffix(".jpg")
            src = next(p for p in (EVAL / "photos").iterdir() if p.name.split(".")[0] == stem)
            im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
            im.thumbnail((360, 360))
            ims.append(im)
        sheet = Image.new("RGB", (sum(i.width for i in ims) + 8, max(i.height for i in ims)), "white")
        sheet.paste(ims[0], (0, 0))
        sheet.paste(ims[1], (ims[0].width + 8, 0))
        name = f"{k:02d}-{score(s, lo, hi):03.0f}-{x.split('/')[-1][:-4]}--{y.split('/')[-1][:-4]}.jpg"
        sheet.save(out / name, quality=85)
        print(f"  saved data/eval/twin-candidates/{name}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dim", type=int, default=768)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    names, P, items, V = load(a.dim)
    idx = {n: i for i, n in enumerate(names)}
    S = P @ P.T

    # ---- 1. photo<->photo on V's eval photos
    ev = [n for n in names if n.startswith("eval/")]
    same, diff, diff_pairs = [], [], []
    for x, y in itertools.combinations(ev, 2):
        s = S[idx[x], idx[y]]
        if eval_label(x) == eval_label(y):
            same.append(s)
        else:
            diff.append(s)
            diff_pairs.append((s, x, y))
    allp = np.array(same + diff)
    lo, hi = pct(allp, 10), pct(allp, 95)
    print(f"dim={a.dim} eval photos={len(ev)} pairs={len(allp)} (same-label {len(same)}, different-label {len(diff)})")
    for nm, arr in (("all", allp), ("same-label", np.array(same)), ("different-label", np.array(diff))):
        print(f"  {nm:16s} min {arr.min():.3f}  p10 {pct(arr,10):.3f}  median {np.median(arr):.3f}  p90 {pct(arr,90):.3f}  p95 {pct(arr,95):.3f}  max {arr.max():.3f}")
    print(f"  mapping: 0 = p10 = {lo:.4f}, 100 = p95 = {hi:.4f}  (band width {hi - lo:.4f})")
    diff_pairs.sort(reverse=True)
    print("  top-10 different-label pairs (twin candidates):")
    for s, x, y in diff_pairs[:10]:
        print(f"    {s:.3f} -> {score(s, lo, hi):3.0f}  {x[5:]} <-> {y[5:]}")

    # ---- 2. labels: top-1 kind + margin
    kinds = np.array([i["kind"] for i in items])
    labels = [i["label"] for i in items]
    cls = np.where(kinds != "attr")[0]
    att = np.where(kinds == "attr")[0]
    L = P @ V[cls].T
    order = np.argsort(-L, axis=1)
    top1 = cls[order[:, 0]]
    margin = L[np.arange(len(names)), order[:, 0]] - L[np.arange(len(names)), order[:, 1]]
    print("\n  top labels (photo: top1 [kind] margin | top2):")
    for i, n in enumerate(names):
        print(f"    {n:34s} {labels[top1[i]]:22s} [{kinds[top1[i]]}] m={margin[i]:.4f} | {labels[cls[order[i,1]]]}")
    ok = np.array([kinds[top1[i]] == "thing" for i in range(len(names))])
    ev_mask = np.array([n.startswith("eval/") for n in names])
    print(f"  margin over eval photos with a 'thing' top label: p5 {pct(margin[ev_mask & ok],5):.4f} p10 {pct(margin[ev_mask & ok],10):.4f} median {np.median(margin[ev_mask & ok]):.4f}")

    # label text similarity (same-kind rule)
    T = V[cls] @ V[cls].T
    np.fill_diagonal(T, -1)
    hiT = [(T[i, j], labels[cls[i]], labels[cls[j]]) for i, j in zip(*np.where(np.triu(T) >= 0.85))]
    hiT.sort(reverse=True)
    print(f"\n  label pairs with text sim >= 0.85: {len(hiT)}; first 15:")
    for s, x, y in hiT[:15]:
        print(f"    {s:.3f} {x} ~ {y}")
    tw = [("tire", "donut"), ("cloud", "cotton"), ("moss", "broccoli"), ("pinecone", "artichoke"), ("zebra", "striped awning"),
          ("brick wall", "chocolate bar"), ("honeycomb", "hexagonal tiles"), ("tree bark", "elephant skin"), ("rock", "boulder"),
          ("leaf", "pile of leaves"), ("tree", "tree trunk"), ("bench", "picnic table")]
    li = {l: k for k, l in enumerate(labels)}
    print("  selected label text sims:", ", ".join(f"{x}~{y} {float(V[li[x]] @ V[li[y]]):.3f}" for x, y in tw))

    # ---- 3. attributes: z-scores per attribute over all photos
    A = P @ V[att].T
    mu, sd = A.mean(0), A.std(0)
    Z = (A - mu) / sd
    print(f"\n  attributes: {len(att)}, raw sim mean {A.mean():.3f}, per-attr sd median {np.median(sd):.4f}")

    def shared(x, y, k=3):
        z = np.minimum(Z[idx[x]], Z[idx[y]])
        o = np.argsort(-z)[:k]
        return [(labels[att[j]], float(z[j])) for j in o]

    # ---- 4. fixtures preview with this mapping
    def pairs(setname):
        fs = sorted(n for n in names if n.startswith(f"fx/{setname}/"))
        by = {}
        for f in fs:
            by.setdefault(f.split("/")[-1].split("-")[0], []).append(f)
        return [tuple(v) for v in by.values()]

    print("\n  fixtures (sim -> score | shared attributes z):")
    for setname in ("twins", "strangers", "same-kind"):
        sc = []
        for x, y in pairs(setname):
            s = S[idx[x], idx[y]]
            sc.append(score(s, lo, hi))
            sh = ", ".join(f"{l} {z:.2f}" for l, z in shared(x, y))
            print(f"    {setname:9s} {x.split('/')[-1]:22s} {y.split('/')[-1]:24s} {s:.3f} -> {sc[-1]:3.0f} | {sh}")
        print(f"    {setname} mean score {np.mean(sc):.1f}")

    if a.write:
        out = {
            "dim": a.dim,
            "lo": round(lo, 5),
            "hi": round(hi, 5),
            "date": date.today().isoformat(),
            "source": f"browser (LiteRT, Edge WebGPU, amd gcn-5) embeddings of {len(ev)} local eval photos (data/eval/photos, not committed); "
            f"0 = p10 and 100 = p95 of all {len(allp)} photo-photo cosines at {a.dim}-d (tools/twin_calibrate.py)",
            "attr": {"labels": [labels[j] for j in att], "mu": [round(float(x), 5) for x in mu], "sd": [round(float(x), 5) for x in sd],
                     "source": f"mean/sd of each attribute's cosine over {len(names)} photos (eval + fixtures)"},
        }
        # G1: per-label mean/sd of photo->label cosine over all photos, for "Try:" suggestions ranked by
        # how unusually close a label is to this photo (generic scene labels like "field" sit near everything).
        LL = P @ V.T
        out["labelStats"] = {"mu": [round(float(x), 5) for x in LL.mean(0)], "sd": [round(float(x), 5) for x in LL.std(0)],
                             "source": f"per vocab row, over {len(names)} photos (eval + fixtures)"}
        # Rule thresholds, chosen from the numbers printed above (see LOG.md D1 for the reasoning).
        out["bands"] = {"uncanny": 80, "cousins": 50, "distant": 30}  # cousins 55 -> 50 after the D7 model eval (LOG.md)
        out["duplicateSim"] = 0.97  # photo-photo cosine above this = the same thing twice (max seen between different objects: 0.919)
        out["sameKindTextSim"] = 0.90  # label text cosine; honeycomb~hexagonal tiles is 0.869 (a twin), rock~boulder 0.946 (same kind)
        out["margin"] = 0.003  # top-1 minus best label of a different kind (text sim < synonymTextSim)
        out["synonymTextSim"] = 0.85  # labels this close are near-synonyms: shown together ("cloud / sky"), never rivals (F1)
        out["minTopSim"] = 0.67  # uncertain needs a small margin AND a top-label sim below this; lowest clear photo: 0.681 (F1)
        out["attrZ"] = 1.0  # an attribute is shared when both photos are >= 1.0 sd above its mean
        save_candidates(diff_pairs[:10], lo, hi)
        (ROOT / "data" / "twin-scoring.json").write_text(json.dumps(out, indent=1) + "\n")
        print("wrote data/twin-scoring.json")

    return names, S, lo, hi, diff_pairs


if __name__ == "__main__":
    main()
