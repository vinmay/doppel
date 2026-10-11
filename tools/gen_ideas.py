"""Generate data/twin-ideas.json ("Need an idea?" hints) with Gemma 4 E4B via Ollama.

Each idea is a short visual description of something you can photograph
outdoors that probably has a lookalike: "Something round and dark". Ideas are
validated (schema, length, starts with "Something", no people, no indoor
things, no emoji) and near-duplicates are removed (content-word Jaccard >= 0.5
or one idea's words contained in another's).

Usage:
  python tools/gen_ideas.py                    # Ollama at localhost:11434, gemma4:e4b
  python tools/gen_ideas.py --dry-run          # stub model, runs anywhere
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "twin-ideas.json"
TARGET = 64
MAX_ROUNDS = 12

OUTPUT_SCHEMA = {
    "type": "object",
    "required": ["ideas"],
    "properties": {"ideas": {"type": "array", "items": {"type": "string"}, "minItems": 10, "maxItems": 20}},
}

SYSTEM = (
    "You write hints for an outdoor photo game. The player photographs one thing outside, walks, "
    "then must find a DIFFERENT kind of thing that looks the same (tire and donut, moss and broccoli, "
    "bark and elephant skin, cloud and cotton). Each hint names a look, never a specific object, so it "
    "fits many things on any street, park or backyard."
)

USER = (
    "Write 16 new hints. Rules: each starts with 'Something', is 3 to 6 words, uses plain everyday "
    "words a ten-year-old knows, and reads like a little riddle. Describe only how it looks (shape, "
    "texture, pattern, color). At most two qualities per hint, joined by 'and' or 'with'. No comma "
    "lists, no art words like 'hue', 'luster', 'form', 'visible', 'tone'. No people, nothing indoors, "
    "no brand names, no emoji. Good examples: 'Something round and dark', 'Something with stripes', "
    "'Something that looks like skin', 'Something fluffy and white', 'Something full of tiny holes', "
    "'Something wrinkly like an old hand'. Avoid these, already used: {avoid}. "
    'Reply as JSON: {{"ideas": ["Something ...", ...]}}'
)

STOP = {"something", "and", "with", "a", "an", "the", "of", "that", "like", "looks", "in", "on", "or", "is", "it", "its", "but", "very", "all", "over"}
BANNED = re.compile(r"\b(person|people|face|man|woman|child|kid|selfie|screen|phone|room|kitchen|sofa|bed|book|logo|brand)\b", re.I)
# Art-school words that made the first run read like word salad.
FUSSY = re.compile(r"\b(hue|hues|luster|lustre|form|forms|visible|tone|tones|tint|pigments?|mass|formation|comprising|structured|uniform|appearance|intensely|sheen)\b", re.I)


# Game master's cut after reading the run of 2026-10-11: vague or garbled hints.
DROP = {
    "Something with small bumps and light", "Something wide and flat round", "Something straight and stark",
    "Something starry with lines", "Something slim and tightly grouped", "Something hard and oddly shaped",
    "Something small and uneven", "Something finely textured and dense", "Something coarse and deeply shaded",
    "Something hollow and gently shaped",
}


def norm(s: str) -> str:
    s = re.sub(r"\s+", " ", s.strip()).rstrip(".")
    return s[:1].upper() + s[1:]


def content_words(s: str) -> set[str]:
    words = re.findall(r"[a-z]+", s.lower())
    return {w.rstrip("s") if len(w) > 3 else w for w in words if w not in STOP}


def problems(idea: str) -> list[str]:
    p = []
    if not idea.startswith("Something "):
        p.append("doesn't start with 'Something'")
    n = len(idea.split())
    if not 3 <= n <= 7:
        p.append(f"{n} words")
    if len(idea) > 48:
        p.append("too long")
    if BANNED.search(idea):
        p.append("people/indoors/brand")
    if FUSSY.search(idea) or idea.count(",") >= 1:
        p.append("fussy wording")
    if not re.fullmatch(r"[A-Za-z ,'-]+", idea):
        p.append("odd characters")
    if not content_words(idea):
        p.append("empty")
    return p


def near_duplicate(a: str, b: str) -> bool:
    wa, wb = content_words(a), content_words(b)
    if not wa or not wb:
        return a.lower() == b.lower()
    j = len(wa & wb) / len(wa | wb)
    return j >= 0.5 or wa <= wb or wb <= wa


def accept(candidates: list[str], kept: list[str]) -> tuple[list[str], list[tuple[str, str]]]:
    rejected = []
    for raw in candidates:
        idea = norm(raw)
        if idea in DROP:
            rejected.append((idea, "game master's cut"))
        elif (why := problems(idea)):
            rejected.append((idea, ", ".join(why)))
        elif (dup := next((k for k in kept if near_duplicate(idea, k)), None)):
            rejected.append((idea, f"near-duplicate of '{dup}'"))
        else:
            kept.append(idea)
    return kept, rejected


def ollama(model: str, host: str, avoid: list[str]) -> list[str]:
    body = json.dumps({
        "model": model,
        "stream": False,
        "format": OUTPUT_SCHEMA,
        "options": {"temperature": 1.0, "num_ctx": 8192},
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": USER.format(avoid="; ".join(avoid[-40:]) or "none")}],
    }).encode()
    req = urllib.request.Request(f"{host}/api/chat", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        return json.loads(json.load(r)["message"]["content"])["ideas"]


def stub(_model: str, _host: str, avoid: list[str]) -> list[str]:
    looks = ["round", "striped", "spiky", "fluffy", "ridged", "spotted", "cracked", "wrinkled", "hexagonal", "wavy", "bumpy", "shiny"]
    return [f"Something {w} and {c}" for w in looks for c in ("dark", "white")]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="gemma4:e4b")
    ap.add_argument("--host", default="http://localhost:11434")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--curate", action="store_true", help="re-apply the rules and DROP to the existing file, no model")
    a = ap.parse_args(argv)
    if a.curate:
        d = json.loads(a.out.read_text())
        kept, rej = accept([i["text"] for i in d["ideas"]], [])
        d.update(count=len(kept), ideas=[{"text": t} for t in kept], curated=f"{len(rej)} removed by tools/gen_ideas.py --curate (DROP list)")
        a.out.write_text(json.dumps(d, indent=1) + "\n")
        print(f"curated: kept {len(kept)}, removed {len(rej)}")
        return 0 if len(kept) >= 60 else 1
    gen = stub if a.dry_run else ollama
    kept: list[str] = []
    all_rejected: list[tuple[str, str]] = []
    rounds = 0
    while len(kept) < TARGET and rounds < MAX_ROUNDS:
        rounds += 1
        kept, rej = accept(gen(a.model, a.host, kept), kept)
        all_rejected += rej
        print(f"round {rounds}: kept {len(kept)}, rejected {len(rej)}")
    out = {
        "source": "stub (dry run)" if a.dry_run else f"Gemma 4 E4B ({a.model}) via Ollama, tools/gen_ideas.py, validated and deduplicated",
        "date": date.today().isoformat(),
        "count": len(kept),
        "ideas": [{"text": t} for t in kept],
    }
    a.out.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {a.out}: {len(kept)} ideas in {rounds} rounds, {len(all_rejected)} rejected")
    for idea, why in all_rejected[:30]:
        print(f"  rejected: {idea!r}: {why}")
    return 0 if len(kept) >= 60 else 1


if __name__ == "__main__":
    raise SystemExit(main())
