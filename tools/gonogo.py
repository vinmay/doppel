"""Go/no-go test: can EmbeddingGemma 2 match V's outdoor photos to text prompts?

Each photo is scored against every prompt. Photos named NN_*.jpg match prompt
line NN (1-based) of the prompts file; any other photo counts as a distractor.

Usage:
  python gonogo.py --photos ../data/eval/photos --prompts ../data/eval/prompts.txt \
      --json ../data/eval/results.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import tempfile
from pathlib import Path

import numpy as np

MODEL_ID = "google/embeddinggemma-2"
SOFTMAX_T = 0.02
GO_THRESHOLD = 0.70
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def label_for(path: Path, n_prompts: int) -> int | None:
    """0-based prompt index for NN_*.jpg, or None for distractors."""
    m = re.match(r"^(\d+)_", path.name)
    if not m:
        return None
    idx = int(m.group(1)) - 1
    return idx if 0 <= idx < n_prompts else None


def softmax(x: np.ndarray, t: float) -> np.ndarray:
    z = (x - x.max(axis=-1, keepdims=True)) / t
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)


def top1_accuracy(sims: np.ndarray, labels: list[int | None]) -> tuple[int, int]:
    """(correct, total) over labelled photos only."""
    correct = total = 0
    for row, lab in zip(sims, labels):
        if lab is None:
            continue
        total += 1
        correct += int(int(np.argmax(row)) == lab)
    return correct, total


def as_decodable(photos: list[Path], tmp: Path) -> list[Path]:
    """Phones often save HEIC under a .jpg name, which torchvision can't decode.
    Convert anything that isn't really JPEG/PNG/WebP/GIF to a temp JPEG."""
    from PIL import Image
    from pillow_heif import register_heif_opener

    register_heif_opener()
    out = []
    for p in photos:
        with Image.open(p) as im:
            if im.format in ("JPEG", "PNG", "WEBP", "GIF"):
                out.append(p)
                continue
            dst = tmp / f"{p.stem}.jpg"
            im.convert("RGB").save(dst, "JPEG", quality=92)
            print(f"note: {p.name} is really {im.format}; using a JPEG copy")
            out.append(dst)
    return out


def pick_dtype():
    import torch

    # No float16: it overflows and returns NaN silently. bf16 only on Ampere+
    # (Turing cards like the 1660 Ti report bf16 "support" via slow emulation).
    if torch.cuda.is_available():
        major, _ = torch.cuda.get_device_capability()
        if major >= 8 and torch.cuda.is_bf16_supported():
            return "cuda", torch.bfloat16
        return "cuda", torch.float32
    return "cpu", torch.float32


def embed(prompts: list[str], photos: list[Path]):
    from sentence_transformers import SentenceTransformer

    device, dtype = pick_dtype()
    model = SentenceTransformer(
        MODEL_ID,
        device=device,
        model_kwargs={"torch_dtype": dtype},
        config_kwargs={"audio_config": None},
    )
    text = model.encode(prompts, prompt_name="SearchQuery", normalize_embeddings=True)
    imgs = np.stack([
        model.encode({"text": "<|image|>", "image": [str(p)]}, normalize_embeddings=True)
        for p in photos
    ])
    text = np.asarray(text, dtype=np.float32)
    imgs = np.asarray(imgs, dtype=np.float32)
    if np.isnan(text).any() or np.isnan(imgs).any():
        sys.exit("NaN in embeddings; check dtype (never use float16)")
    return text, imgs, str(dtype).replace("torch.", "")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--photos", required=True, type=Path)
    ap.add_argument("--prompts", required=True, type=Path)
    ap.add_argument("--json", type=Path, help="write {prompts, photos, sims, labels, accuracy, ...}")
    args = ap.parse_args(argv)

    prompts = [ln.strip() for ln in args.prompts.read_text().splitlines() if ln.strip()]
    photos = sorted(p for p in args.photos.iterdir() if p.suffix.lower() in IMAGE_EXTS)
    if not photos:
        sys.exit(f"no photos in {args.photos}")
    labels = [label_for(p, len(prompts)) for p in photos]

    with tempfile.TemporaryDirectory() as tmp:
        text, imgs, dtype = embed(prompts, as_decodable(photos, Path(tmp)))
    print(f"embedding dim: {text.shape[1]}, dtype: {dtype}")
    sims = imgs @ text.T  # (n_photos, n_prompts), cosine since normalized
    probs = softmax(sims, SOFTMAX_T)

    for i, p in enumerate(photos):
        best = int(np.argmax(sims[i]))
        lab = labels[i]
        mark = "  " if lab is None else ("OK" if best == lab else "XX")
        print(f"{mark} {p.name:40s} -> [{best + 1:2d}] {prompts[best][:40]:40s} "
              f"cos={sims[i, best]:.3f} conf={probs[i, best] * 100:5.1f}")

    print(f"cosine range: {sims.min():.3f} .. {sims.max():.3f}")
    correct, total = top1_accuracy(sims, labels)
    acc = correct / total if total else 0.0
    print(f"top-1 accuracy: {correct}/{total} = {acc:.1%}")
    print("GO" if acc >= GO_THRESHOLD else "NO-GO", f"(threshold {GO_THRESHOLD:.0%})")

    if args.json:
        args.json.write_text(json.dumps({
            "prompts": prompts,
            "photos": [p.name for p in photos],
            "sims": sims.round(6).tolist(),
            "labels": labels,
            "accuracy": acc,
            "correct": correct,
            "total": total,
            "model": MODEL_ID,
            "dtype": dtype,
            "date": dt.date.today().isoformat(),
        }, indent=1))
        print(f"wrote {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
