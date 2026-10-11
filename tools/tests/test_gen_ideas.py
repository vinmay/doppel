import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import gen_ideas as g  # noqa: E402


def test_problems():
    assert g.problems("Something round and dark") == []
    assert g.problems("A round thing")  # must start with Something
    assert g.problems("Something")  # too short
    assert g.problems("Something that looks like a person")  # people
    assert g.problems("Something on a phone screen")  # screens
    assert g.problems("Something round 🍩")  # emoji
    assert g.problems("Something silvery sheen, dull gray")  # fussy wording


def test_near_duplicates():
    assert g.near_duplicate("Something round and dark", "Something dark and round")
    assert g.near_duplicate("Something with stripes", "Something with black stripes")
    assert not g.near_duplicate("Something fluffy and white", "Something cracked like old paint")


def test_accept_dedupes_and_reports():
    kept, rej = g.accept(["something round and dark.", "Something dark and round", "Pizza"], [])
    assert kept == ["Something round and dark"]
    assert len(rej) == 2


def test_dry_run_writes_valid_file(tmp_path):
    out = tmp_path / "ideas.json"
    g.main(["--dry-run", "--out", str(out)])
    d = json.loads(out.read_text())
    texts = [i["text"] for i in d["ideas"]]
    assert texts and all(not g.problems(t) for t in texts)
    assert len(set(t.lower() for t in texts)) == len(texts)
