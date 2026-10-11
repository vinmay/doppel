"""Build the Warmer vocabulary: ~400 short outdoor concept phrases.

Sources, in priority order:
  1. every daily secret (pack targets) and the go/no-go eval prompts: always kept
  2. every decoy in data/prompt-packs/*.json
  3. TOP_UP below: common outdoor things a player is likely to photograph,
     so a random shot (a car, a house, the sky) has somewhere to land

Near-duplicates (EmbeddingGemma 2 text cosine > 0.9) are dropped greedily in
that order, so a pinned phrase is never dropped in favour of a decoy.

Usage:
  python build_vocab.py                     # real model (CPU is fine, text only)
  python build_vocab.py --dry-run           # trigram stand-in, runs anywhere
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np

import gen_prompts as gp

ROOT = Path(__file__).resolve().parent.parent
DUP_THRESHOLD = 0.9

# Hand-curated: everyday outdoor things in a US suburb or park, phrased like
# the packs (literal, visual, article + noun).
TOP_UP = [
    "a parked car", "a pickup truck", "a bicycle", "a motorcycle", "a school bus",
    "a house with a front door", "a brick wall", "a wooden fence", "a chain-link fence",
    "a white picket fence", "a garage door", "a mailbox", "a street lamp", "a traffic light",
    "a crosswalk", "a speed limit sign", "a street name sign", "a parking meter",
    "a utility pole with wires", "a manhole cover", "a curb", "an asphalt road",
    "a concrete sidewalk", "a gravel path", "a dirt trail", "a wooden boardwalk",
    "a bridge over a creek", "a staircase outdoors", "a handrail", "a brick chimney",
    "a roof with shingles", "a window with shutters", "a porch light",
    "a trash can", "a recycling bin", "a park sign", "a picnic table",
    "a playground slide", "a swing set", "a basketball hoop", "a soccer goal",
    "a water fountain", "a flag on a pole", "a bird feeder", "a garden hose",
    "a lawn mower", "a wheelbarrow", "a shovel", "a rake", "a flower pot",
    "a green lawn", "a tall tree", "a pine tree", "an oak tree", "a palm tree",
    "a bush with red berries", "a hedge", "tall grass", "a dandelion",
    "a sunflower", "a rose", "a clover patch", "ivy climbing a wall", "a vine on a fence",
    "a cactus", "a fern", "a log", "a tree stump", "a fallen branch", "a stick",
    "a large boulder", "a pile of rocks", "sand", "mud", "a creek", "a pond", "a lake",
    "a waterfall", "snow", "ice", "a blue sky", "white clouds", "a sunset", "the moon",
    "a shadow on the ground", "a rainbow", "a hill", "a field of grass",
    "a dog", "a cat", "a squirrel", "a bird on a branch", "a duck", "a butterfly",
    "a bee on a flower", "an ant", "a spider web", "a snail", "a feather",
    "a bird nest", "a sneaker", "a ball", "a kite", "graffiti on a wall", "a mural",
    "a painted door", "a bench in the sun", "a gazebo", "a statue", "a church steeple",
    "a store front", "a parking lot", "a gas station", "a construction cone",
]


def load_packs(packs_dir: Path) -> list[dict]:
    return [json.loads(f.read_text()) for f in sorted(packs_dir.glob("*.json"))]


def candidates(packs: list[dict], eval_prompts: list[str]) -> list[tuple[str, str, bool]]:
    """(text, source, pinned), highest priority first, exact duplicates removed."""
    out: list[tuple[str, str, bool]] = []
    for p in packs:
        out += [(q["text"], "secret", True) for q in p["prompts"]]
    out += [(t, "eval", True) for t in eval_prompts]
    for p in packs:
        out += [(d, "decoy", False) for q in p["prompts"] for d in q["decoys"]]
    out += [(t, "top-up", False) for t in TOP_UP]
    seen: set[str] = set()
    uniq = []
    for text, src, pinned in out:
        text = gp.clean(text)
        key = gp.norm(text)
        if key in seen:
            continue
        seen.add(key)
        uniq.append((text, src, pinned))
    return uniq


def dedupe(cands: list[tuple[str, str, bool]], embed: gp.Embedder, threshold: float = DUP_THRESHOLD):
    """Greedy: keep a candidate unless it's within `threshold` of a kept one.
    Pinned candidates are always kept. Returns (kept, dropped) where dropped
    items are (text, source, nearest kept text, cosine)."""
    vecs = embed([c[0] for c in cands])
    kept_idx: list[int] = []
    dropped = []
    for i, (text, src, pinned) in enumerate(cands):
        if kept_idx and not pinned:
            sims = vecs[kept_idx] @ vecs[i]
            j = int(np.argmax(sims))
            if sims[j] > threshold:
                dropped.append((text, src, cands[kept_idx[j]][0], float(sims[j])))
                continue
        kept_idx.append(i)
    return [cands[i] for i in kept_idx], dropped


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--packs", type=Path, default=ROOT / "data/prompt-packs")
    ap.add_argument("--eval-prompts", type=Path, default=ROOT / "data/eval/prompts.txt")
    ap.add_argument("--out", type=Path, default=ROOT / "data/vocab.json")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--dry-run", action="store_true", help="trigram embedder instead of EmbeddingGemma 2")
    args = ap.parse_args(argv)

    packs = load_packs(args.packs)
    eval_prompts = [s.strip() for s in args.eval_prompts.read_text().splitlines() if s.strip()]
    cands = candidates(packs, eval_prompts)
    embed = gp.trigram_embedder if args.dry_run else gp.gemma_embedder(args.device)
    kept, dropped = dedupe(cands, embed)

    secrets = {gp.clean(q["text"]) for p in packs for q in p["prompts"]}
    texts = [k[0] for k in kept]
    missing = secrets - set(texts)
    if missing:
        print(f"ERROR: secrets missing from vocab: {sorted(missing)}", file=sys.stderr)
        return 1
    if len(set(texts)) != len(texts):
        print("ERROR: duplicate texts in vocab", file=sys.stderr)
        return 1

    by_src: dict[str, int] = {}
    for _, src, _ in kept:
        by_src[src] = by_src.get(src, 0) + 1
    print(f"candidates {len(cands)} (exact dups removed) -> kept {len(kept)}, dropped {len(dropped)} at cosine > {DUP_THRESHOLD}")
    print(f"kept by source: {by_src}")
    for text, src, near, s in dropped[:40]:
        print(f"  drop [{src}] {text!r} ~ {near!r} ({s:.3f})")
    if len(dropped) > 40:
        print(f"  ... {len(dropped) - 40} more")

    args.out.write_text(json.dumps({
        "model": "stub (dry-run)" if args.dry_run else "google/embeddinggemma-2 (text, SearchQuery prompt)",
        "dedupe_threshold": DUP_THRESHOLD,
        "date": dt.date.today().isoformat(),
        "count": len(kept),
        "items": [{"text": t, "source": s} for t, s, _ in kept],
    }, indent=1) + "\n")
    print(f"wrote {args.out} ({len(kept)} items)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
