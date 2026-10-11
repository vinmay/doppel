"""Generate daily Sense Hunt prompt packs with Gemma 4 E4B.

Each pack has 5 target prompts with 10 decoys each (schema: data/prompt-packs,
PLAN.md Appendix B). Packs with duplicate or near-duplicate prompts are
rejected and regenerated; "near-duplicate" means EmbeddingGemma 2 text cosine
> 0.9.

Usage:
  python gen_prompts.py --dry-run                       # stub model, runs anywhere
  python gen_prompts.py --backend ollama                # needs `ollama pull gemma4:e4b`
  python gen_prompts.py --backend transformers          # HF google/gemma-4-E4B-it
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import random
import re
import sys
import urllib.request
from pathlib import Path
from typing import Callable

import jsonschema
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "prompt-packs"
REGION = "Charlotte, NC, autumn"
N_PROMPTS = 5
N_DECOYS = 10
DUP_THRESHOLD = 0.9
MAX_ATTEMPTS = 8

PACK_SCHEMA = {
    "type": "object",
    "required": ["date", "model", "region", "prompts"],
    "additionalProperties": False,
    "properties": {
        "date": {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}$"},
        "model": {"type": "string"},
        "region": {"type": "string"},
        "prompts": {
            "type": "array",
            "minItems": N_PROMPTS,
            "maxItems": N_PROMPTS,
            "items": {
                "type": "object",
                "required": ["id", "text", "hint", "decoys"],
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "string"},
                    "text": {"type": "string", "minLength": 3, "maxLength": 80},
                    "hint": {"type": "string", "minLength": 3, "maxLength": 80},
                    "decoys": {
                        "type": "array",
                        "minItems": N_DECOYS,
                        "maxItems": N_DECOYS,
                        "items": {"type": "string", "minLength": 3, "maxLength": 80},
                    },
                },
            },
        },
    },
}

# What we ask the model for (no ids/date; we add those). "kind" is a one-word
# object category used only for validation; it isn't written to the pack.
MODEL_OUTPUT_SCHEMA = {
    "type": "object",
    "required": ["prompts"],
    "properties": {
        "prompts": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["text", "kind", "hint", "decoys"],
                "properties": {
                    "text": {"type": "string"},
                    "kind": {"type": "string"},
                    "hint": {"type": "string"},
                    "decoys": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["text", "kind"],
                            "properties": {"text": {"type": "string"}, "kind": {"type": "string"}},
                        },
                    },
                },
            },
        }
    },
}

MAX_KIND_REPEATS = 3  # a target kind may appear at most this often across all days

SYSTEM_PROMPT = f"""You write prompts for an outdoor photo scavenger hunt in {REGION}.
Players walk around their neighbourhood or a public park for 15 to 30 minutes and
photograph each prompt. A vision model scores each photo against the prompt
text, so a prompt must describe what is literally visible in the photo.

Rules for every target prompt ("text"):
- Common and easy to find: something most people could find on a short walk
  through a US suburb or park in October. Avoid rare or specialist things.
- Literal and visual: one object, plus a colour, texture or setting.
  4 to 8 everyday words. Plain vocabulary (say "orange", not "ochre" or "russet").
  Good: "an orange leaf lying on pavement", "a pine cone on grass",
  "a red fire hydrant", "a wooden park bench", "a mushroom growing in grass".
  Bad: "autumn's fire", "an oxidized dull copper patch", "a cluster of burnt red river stones".
  The good examples only show the style: write your own prompts, don't copy them.
- No animals (they need luck), no people or faces, no private property.
- Lowercase, starting with "a", "an" or "some".
- "kind": the object category as ONE lowercase noun, e.g. "leaf", "mushroom",
  "bench", "hydrant", "bark", "berries". The 5 targets in a pack must all have
  different kinds.

Each target also gets:
- "hint": where to look, under 80 characters, e.g. "Sidewalks under maples, mornings after wind".
- "decoys": exactly {N_DECOYS} objects {{"text", "kind"}}: other common outdoor
  things, same style as the target, visually DISTINCT from it and from each other.
  A decoy must NEVER be the same kind as its target, not even in another colour,
  state or setting: if the target kind is "leaf", no decoy may be a leaf; if
  it is "wood", no planks, posts, logs or sticks. A decoy must also not contain
  the target as a part (target "bark" means no tree trunks; target "berries"
  means no berry bushes). Every decoy has its own kind.

Respond with JSON only:
{{"prompts": [{{"text": ..., "kind": ..., "hint": ..., "decoys": [{{"text": ..., "kind": ...}}, ...]}}, ...]}}
with exactly {N_PROMPTS} prompts."""


def user_prompt(date: dt.date, avoid: list[str], used_up_kinds: list[str] = ()) -> str:
    s = f"Write the pack for {date:%A %B %d, %Y}."
    if avoid:
        s += " Do not reuse or closely paraphrase any of these earlier targets: " + "; ".join(avoid) + "."
    if used_up_kinds:
        s += " These target kinds are used up, pick other kinds: " + ", ".join(used_up_kinds) + "."
    return s


# ---------------------------------------------------------------- generators

Generator = Callable[[str, str], str]  # (system, user) -> raw JSON text


def stub_generator(seed: int = 0) -> Generator:
    """Deterministic fake model for --dry-run and tests."""
    objects = [
        "leaf lying on pavement", "fire hydrant", "pine cone on grass", "mushroom in mulch",
        "park bench", "pumpkin on a porch step", "stop sign", "puddle on asphalt",
        "storm drain grate", "picket fence", "recycling bin", "mailbox", "bicycle rack",
        "basketball hoop", "gravel path", "berry bush", "brick wall", "flower in a lawn",
        "garden hose", "street lamp", "playground slide", "door on a shed",
        "kayak on a rack", "umbrella", "traffic cone", "rock in a creek",
    ]
    colours = ["a red", "a yellow", "a brown", "a green", "a white", "a blue", "an orange", "a black"]
    things = [f"{c} {o}" for o in objects for c in colours]
    rng = random.Random(seed)

    def gen(system: str, user: str) -> str:
        # Avoid earlier targets (listed in the user prompt) and reuse of an object.
        used_up = re.search(r"used up, pick other kinds: ([^.]*)\.", user)
        banned = set(used_up.group(1).split(", ")) if used_up else set()
        kind = lambda t: t.split(" ", 2)[2].split()[0]  # noqa: E731  first word of the object
        # Targets: not used before, kind not used up. Decoys: any other object.
        pool = [t for t in things if t not in user and kind(t) not in banned]
        rng.shuffle(pool)
        pick, used = [], set()
        for t in pool:
            if kind(t) not in used:
                pick.append(t)
                used.add(kind(t))
            if len(pick) == N_PROMPTS:
                break
        rest = [t for t in things if kind(t) not in used]
        rng.shuffle(rest)
        for t in rest:
            if kind(t) not in used:
                pick.append(t)
                used.add(kind(t))
            if len(pick) == N_PROMPTS + N_DECOYS:
                break
        prompts = []
        for i in range(N_PROMPTS):
            decoys = [t for t in pick if t != pick[i]][:N_DECOYS]
            prompts.append({
                "text": pick[i], "kind": kind(pick[i]), "hint": "Look along sidewalks and park paths",
                "decoys": [{"text": d, "kind": kind(d)} for d in decoys],
            })
        return json.dumps({"prompts": prompts})

    return gen


def ollama_generator(model: str, host: str) -> Generator:
    def gen(system: str, user: str) -> str:
        body = json.dumps({
            "model": model,
            "stream": False,
            "format": MODEL_OUTPUT_SCHEMA,
            "options": {"temperature": 0.9, "num_ctx": 8192},  # default 4096 truncates the JSON
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }).encode()
        req = urllib.request.Request(f"{host}/api/chat", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=900) as r:
            return json.load(r)["message"]["content"]

    return gen


def transformers_generator(model_id: str) -> Generator:
    import torch
    from transformers import pipeline

    # No float16 (NaN risk); bf16 only on Ampere+.
    dtype = torch.float32
    if torch.cuda.is_available() and torch.cuda.get_device_capability()[0] >= 8:
        dtype = torch.bfloat16
    pipe = pipeline("text-generation", model=model_id, torch_dtype=dtype, device_map="auto")

    def gen(system: str, user: str) -> str:
        msgs = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        out = pipe(msgs, max_new_tokens=2048, do_sample=True, temperature=0.9)
        return out[0]["generated_text"][-1]["content"]

    return gen


# ---------------------------------------------------------------- findability check

MIN_RATING = 3  # reject 1s and 2s; at 4, Gemma flagged 28 of 70 good-looking targets, inconsistently

RATER_SYSTEM = f"""You review prompts for an outdoor photo scavenger hunt played in {REGION}.
A player has about 20 minutes to walk around an ordinary suburb or public park
in October and photograph each prompt. For each prompt, rate 1 to 5:
5 = almost everyone will find it on a short walk
4 = most people will find it
3 = maybe half will find it, or it is vague/hard to recognise in a photo
2 = rare, needs luck, or unpleasant to look for (e.g. mould, slime, litter)
1 = practically impossible, private property, or not something you can photograph
Judge findability AND whether a photo would clearly show it. Be strict.
Respond with JSON only: {{"ratings": [{{"text": ..., "rating": 1-5, "reason": "<= 12 words"}}, ...]}}
in the same order as the input."""

RATER_SCHEMA = {
    "type": "object",
    "required": ["ratings"],
    "properties": {
        "ratings": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["text", "rating", "reason"],
                "properties": {
                    "text": {"type": "string"},
                    "rating": {"type": "integer", "minimum": 1, "maximum": 5},
                    "reason": {"type": "string"},
                },
            },
        }
    },
}

Rater = Callable[[list[str]], list[dict]]  # target texts -> [{text, rating, reason}] in order


def stub_rater(texts: list[str]) -> list[dict]:
    """Deterministic stand-in: flags a few words we know are bad prompts."""
    bad = ("slime", "mold", "mould", "puffball")
    return [{"text": t, "rating": 2 if any(b in t for b in bad) else 5, "reason": "stub"} for t in texts]


def ollama_rater(model: str, host: str) -> Rater:
    def rate(texts: list[str]) -> list[dict]:
        body = json.dumps({
            "model": model,
            "stream": False,
            "format": RATER_SCHEMA,
            "options": {"temperature": 0, "num_ctx": 8192},  # deterministic ratings
            "messages": [
                {"role": "system", "content": RATER_SYSTEM},
                {"role": "user", "content": "Rate these prompts:\n" + "\n".join(f"- {t}" for t in texts)},
            ],
        }).encode()
        req = urllib.request.Request(f"{host}/api/chat", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=900) as r:
            ratings = json.loads(json.load(r)["message"]["content"])["ratings"]
        if len(ratings) != len(texts):
            raise ValueError(f"rater returned {len(ratings)} ratings for {len(texts)} prompts")
        # Trust our order and text, not the model's echo of it.
        return [{"text": t, "rating": int(r["rating"]), "reason": r["reason"].strip()} for t, r in zip(texts, ratings)]

    return rate


def rating_problems(texts: list[str], rater: Rater) -> list[str]:
    return [
        f"target {r['text']!r} rated {r['rating']}/5 for findability ({r['reason']})"
        for r in rater(texts) if r["rating"] < MIN_RATING
    ]


# ---------------------------------------------------------------- similarity

Embedder = Callable[[list[str]], np.ndarray]  # -> (n, d) L2-normalised


def trigram_embedder(texts: list[str]) -> np.ndarray:
    """Cheap stand-in for EmbeddingGemma 2 in --dry-run: hashed char trigrams."""
    d = 2048
    out = np.zeros((len(texts), d), dtype=np.float32)
    for i, t in enumerate(texts):
        t = f"  {norm(t)}  "
        for j in range(len(t) - 2):
            out[i, hash(t[j:j + 3]) % d] += 1
    out /= np.linalg.norm(out, axis=1, keepdims=True) + 1e-9
    return out


def gemma_embedder(device: str = "cpu") -> Embedder:
    """Text-only EmbeddingGemma 2. Defaults to CPU so it doesn't fight the
    generator for VRAM; the text encoder is small enough for that."""
    from sentence_transformers import SentenceTransformer
    import torch

    dtype = torch.float32
    if device.startswith("cuda") and torch.cuda.get_device_capability()[0] >= 8:
        dtype = torch.bfloat16
    model = SentenceTransformer(
        "google/embeddinggemma-2",
        device=device,
        model_kwargs={"torch_dtype": dtype},
        config_kwargs={"vision_config": None, "audio_config": None},
    )

    def emb(texts: list[str]) -> np.ndarray:
        return np.asarray(model.encode(texts, prompt_name="SearchQuery", normalize_embeddings=True), dtype=np.float32)

    return emb


# ---------------------------------------------------------------- validation

def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", s.lower()).strip()


def fix_article(s: str) -> str:
    """'an bright' -> 'a bright', 'a orange' -> 'an orange' (first word only)."""
    m = re.match(r"^(a|an) (\S+)(.*)$", s)
    if not m:
        return s
    word = m.group(2)
    art = "an" if word[0] in "aeiou" else "a"
    return f"{art} {word}{m.group(3)}"


def clean(s: str) -> str:
    return fix_article(re.sub(r"\s+", " ", s.strip().lower()))


def parse_model_output(raw: str) -> list[dict]:
    """Prompts with private _kind/_decoy_kinds fields (stripped in build_pack)."""
    raw = raw.strip()
    m = re.search(r"\{.*\}", raw, re.S)  # tolerate ```json fences
    if not m:
        raise ValueError("no JSON object in model output")
    out = []
    for p in json.loads(m.group(0))["prompts"]:
        decoys = [d if isinstance(d, dict) else {"text": d, "kind": ""} for d in p["decoys"]]
        out.append({
            "text": clean(p["text"]),
            "hint": p["hint"].strip(),
            "decoys": [clean(d["text"]) for d in decoys],
            "_kind": p.get("kind", "").strip().lower(),
            "_decoy_kinds": [d.get("kind", "").strip().lower() for d in decoys],
        })
    return out


def word_forms(w: str) -> set[str]:
    """Singular and plural spellings of a noun: leaf/leaves, berry/berries, cone/cones."""
    w = w.strip().lower()
    if not w:
        return set()
    sing = {w}
    if w.endswith("ies"):
        sing.add(w[:-3] + "y")
    elif w.endswith("ves"):
        sing |= {w[:-3] + "f", w[:-3] + "fe"}
    elif w.endswith("es"):
        sing |= {w[:-2], w[:-1]}
    elif w.endswith("s") and not w.endswith("ss"):
        sing.add(w[:-1])
    forms = set(sing)
    for s in sing:
        forms |= {s + "s", s + "es"}
        if s.endswith("y"):
            forms.add(s[:-1] + "ies")
        if s.endswith("fe"):
            forms.add(s[:-2] + "ves")
        elif s.endswith("f"):
            forms.add(s[:-1] + "ves")
    return forms


# Targets nobody should be sent to photograph: unpleasant, litter, or on private
# property. A fixed list, because the Gemma self-rating let some of these through.
BANNED_WORDS = ("mold", "mould", "slime", "wrapper", "trash", "litter", "bottle", "can",
                "planter", "porch", "yard", "garbage", "cigarette", "dog poop")


def banned_problems(targets: list[str]) -> list[str]:
    problems = []
    for t in targets:
        words = set(re.findall(r"[a-z]+", t.lower()))
        hits = [b for b in BANNED_WORDS if (" " in b and b in t.lower()) or word_forms(b) & words]
        if hits:
            problems.append(f"target {t!r} uses a banned word ({', '.join(hits)}): pick something pleasant and public")
    return problems


def kind_problems(prompts: list[dict], kind_counts: dict[str, int]) -> list[str]:
    """Same-kind decoys, duplicate kinds within a pack, overused kinds across days."""
    problems = []
    kinds = [p.get("_kind") for p in prompts]
    if not all(kinds):
        return []  # no kind info (e.g. hand-built packs in tests)
    if len(set(kinds)) != len(kinds):
        problems.append(f"repeated target kinds in pack: {kinds}")
    for p in prompts:
        k = p["_kind"]
        if kind_counts.get(k, 0) >= MAX_KIND_REPEATS:
            problems.append(f"kind {k!r} already used {kind_counts[k]}x")
        forms = word_forms(k)
        for d, dk in zip(p["decoys"], p["_decoy_kinds"]):
            if word_forms(dk) & forms or forms & set(re.findall(r"[a-z]+", d)):
                problems.append(f"decoy {d!r} is the same kind ({k}) as target {p['text']!r}")
    return problems


def build_pack(date: dt.date, model: str, prompts: list[dict]) -> dict:
    return {
        "date": date.isoformat(),
        "model": model,
        "region": REGION,
        "prompts": [
            {"id": f"{date.isoformat()}-{i + 1}", **{k: v for k, v in p.items() if not k.startswith("_")}}
            for i, p in enumerate(prompts)
        ],
    }


def pack_problems(pack: dict, embed: Embedder, earlier_targets: list[str]) -> list[str]:
    """Empty list if the pack is acceptable."""
    try:
        jsonschema.validate(pack, PACK_SCHEMA)
    except jsonschema.ValidationError as e:
        return [f"schema: {e.message}"]

    problems = []
    targets = [p["text"] for p in pack["prompts"]]
    # Exact duplicates within the pack (targets + all decoys per prompt).
    if len({norm(t) for t in targets}) != len(targets):
        problems.append("duplicate target prompts")
    for p in pack["prompts"]:
        items = [p["text"], *p["decoys"]]
        if len({norm(x) for x in items}) != len(items):
            problems.append(f"duplicate decoys for {p['id']}")

    # Near-duplicates by embedding similarity.
    all_targets = targets + earlier_targets
    e = embed(all_targets)
    sims = e[: len(targets)] @ e.T
    for i in range(len(targets)):
        for j in range(len(all_targets)):
            if j != i and sims[i, j] > DUP_THRESHOLD:
                where = "in this pack" if j < len(targets) else "from an earlier pack"
                problems.append(f"near-duplicate target {targets[i]!r} ~ {all_targets[j]!r} ({where}, {sims[i, j]:.2f})")
    for p in pack["prompts"]:
        e = embed([p["text"], *p["decoys"]])
        s = e[0] @ e[1:].T
        for d, v in zip(p["decoys"], s):
            if v > DUP_THRESHOLD:
                problems.append(f"decoy {d!r} too close to target {p['text']!r} ({v:.2f})")
    return problems


def generate_pack(date: dt.date, model_name: str, gen: Generator, embed: Embedder,
                  earlier_targets: list[str], log=print, kind_counts: dict[str, int] | None = None,
                  rater: Rater | None = None) -> dict:
    """Returns the pack; also updates kind_counts in place."""
    kind_counts = {} if kind_counts is None else kind_counts
    used_up = sorted(k for k, n in kind_counts.items() if n >= MAX_KIND_REPEATS)
    feedback: list[str] = []  # specific reasons from rejected attempts, fed into the next one
    for attempt in range(1, MAX_ATTEMPTS + 1):
        user = user_prompt(date, earlier_targets, used_up)
        if feedback:
            user += " Your previous attempt was rejected: " + "; ".join(feedback[-6:]) + ". Choose clearly different objects."
        try:
            prompts = parse_model_output(gen(SYSTEM_PROMPT, user))
            pack = build_pack(date, model_name, prompts)
            problems = (pack_problems(pack, embed, earlier_targets) + kind_problems(prompts, kind_counts)
                        + banned_problems([p["text"] for p in prompts]))
            if not problems and rater:  # only spend a rating call on otherwise-valid packs
                problems = rating_problems([p["text"] for p in prompts], rater)
        except (ValueError, KeyError, TypeError, AttributeError, json.JSONDecodeError) as e:
            problems = [f"unparseable output: {e}"]
        except (TimeoutError, OSError) as e:  # slow or dropped model server: retry
            problems = [f"generator error: {e!r}"]
        if not problems:
            for p in prompts:
                if p.get("_kind"):
                    kind_counts[p["_kind"]] = kind_counts.get(p["_kind"], 0) + 1
            return pack
        log(f"  {date} attempt {attempt} rejected: {'; '.join(problems[:3])}")
        feedback += [re.sub(r" \([^)]*\d\.\d\d\)$", "", p) for p in problems if not p.startswith(("unparseable", "generator error"))]
    raise RuntimeError(f"{date}: no valid pack after {MAX_ATTEMPTS} attempts")


def rate_existing(out: Path, rater: Rater) -> int:
    """Rate every target in existing packs; print weak ones; save .gen/ratings.json."""
    files = sorted(out.glob("*.json"))
    if not files:
        print(f"no packs in {out}")
        return 1
    all_ratings: dict[str, list[dict]] = {}
    for f in files:
        texts = [p["text"] for p in json.loads(f.read_text())["prompts"]]
        all_ratings[f.stem] = rater(texts)
        for r in all_ratings[f.stem]:
            flag = "LOW" if r["rating"] < MIN_RATING else "   "
            print(f"{flag} {f.stem} {r['rating']}/5  {r['text']:<50} {r['reason']}")
    (out / ".gen").mkdir(exist_ok=True)
    (out / ".gen" / "ratings.json").write_text(json.dumps(all_ratings, indent=1) + "\n")
    low_days = sorted(d for d, rs in all_ratings.items() if any(r["rating"] < MIN_RATING for r in rs))
    print(f"days with a target rated < {MIN_RATING}: {', '.join(low_days) or 'none'}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", default="2026-10-08")
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    ap.add_argument("--dry-run", action="store_true", help="stub model + trigram similarity")
    ap.add_argument("--backend", choices=["ollama", "transformers"], default="ollama")
    ap.add_argument("--ollama-model", default="gemma4:e4b")
    ap.add_argument("--ollama-host", default="http://localhost:11434")
    ap.add_argument("--hf-model", default="google/gemma-4-E4B-it")
    ap.add_argument("--validate-only", action="store_true", help="schema-check existing packs and exit")
    ap.add_argument("--resume", action="store_true", help="keep packs already in --out and continue after them")
    ap.add_argument("--rate", action="store_true", help="rate existing packs' targets for findability and exit")
    ap.add_argument("--no-rating", action="store_true", help="skip the findability check while generating")
    args = ap.parse_args(argv)

    if args.validate_only:
        files = sorted(args.out.glob("*.json"))
        for f in files:
            jsonschema.validate(json.loads(f.read_text()), PACK_SCHEMA)
        print(f"{len(files)} pack(s) valid")
        return 0 if files else 1

    rater: Rater = stub_rater if args.dry_run else ollama_rater(args.ollama_model, args.ollama_host)
    if args.rate:
        return rate_existing(args.out, rater)
    if args.no_rating:
        rater = None

    if args.dry_run:
        gen, embed, model_name = stub_generator(), trigram_embedder, "stub (dry-run)"
    elif args.backend == "ollama":
        gen, embed, model_name = ollama_generator(args.ollama_model, args.ollama_host), gemma_embedder(), "gemma-4-e4b"
    else:
        gen, embed, model_name = transformers_generator(args.hf_model), gemma_embedder(), "gemma-4-e4b"

    args.out.mkdir(parents=True, exist_ok=True)
    start = dt.date.fromisoformat(args.start)
    # Target kinds per day live in a sidecar (packs follow the Appendix B schema,
    # which has no "kind"), so --resume can restore the per-kind limits.
    kinds_file = args.out / ".gen" / "kinds.json"
    kinds_by_date: dict[str, list[str]] = json.loads(kinds_file.read_text()) if args.resume and kinds_file.exists() else {}
    earlier: list[str] = []
    kind_counts: dict[str, int] = {}
    if args.resume:
        # Avoid every existing pack, before and after, so a day regenerated in
        # the middle of the range can't duplicate a later one.
        for path in sorted(args.out.glob("*.json")):
            earlier += [p["text"] for p in json.loads(path.read_text())["prompts"]]
            for k in kinds_by_date.get(path.stem, []):
                kind_counts[k] = kind_counts.get(k, 0) + 1
    for i in range(args.days):
        date = start + dt.timedelta(days=i)
        path = args.out / f"{date.isoformat()}.json"
        if args.resume and path.exists():
            print(f"kept {path.name}")
            continue
        before = dict(kind_counts)
        pack = generate_pack(date, model_name, gen, embed, earlier, kind_counts=kind_counts, rater=rater)
        kinds_by_date[date.isoformat()] = [k for k in kind_counts for _ in range(kind_counts[k] - before.get(k, 0))]
        earlier += [p["text"] for p in pack["prompts"]]
        path.write_text(json.dumps(pack, indent=2) + "\n")
        kinds_file.parent.mkdir(exist_ok=True)
        kinds_file.write_text(json.dumps(kinds_by_date, indent=1) + "\n")
        print(f"wrote {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
