import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build_vocab as bv  # noqa: E402


def test_pinned_items_survive_dedupe_and_decoys_drop():
    cands = [("a red hydrant", "secret", True), ("a red hydrant!", "decoy", False),
             ("a red  hydrant", "eval", True), ("a blue bench", "decoy", False)]
    embed = lambda texts: bv.np.array([[1.0, 0.0] if "hydrant" in t else [0.0, 1.0] for t in texts])
    kept, dropped = bv.dedupe(cands, embed)
    assert [k[0] for k in kept] == ["a red hydrant", "a red  hydrant", "a blue bench"]
    assert dropped[0][0] == "a red hydrant!" and dropped[0][3] > 0.9


def test_candidates_remove_exact_duplicates_keep_priority(tmp_path):
    packs = [{"prompts": [{"text": "A Pine Cone", "decoys": ["a pine cone", "a rock"]}]}]
    c = bv.candidates(packs, ["a rock"])
    assert c[0] == ("a pine cone", "secret", True)
    assert ("a rock", "eval", True) in c
    assert sum(1 for t, *_ in c if t == "a rock") == 1


def test_dry_run_writes_vocab_with_every_secret(tmp_path):
    out = tmp_path / "vocab.json"
    assert bv.main(["--dry-run", "--out", str(out)]) == 0
    v = json.loads(out.read_text())
    texts = [i["text"] for i in v["items"]]
    assert v["count"] == len(texts) == len(set(texts))
    packs = bv.load_packs(bv.ROOT / "data/prompt-packs")
    assert {bv.gp.clean(q["text"]) for p in packs for q in p["prompts"]} <= set(texts)
