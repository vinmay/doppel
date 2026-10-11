import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import gen_prompts as gp  # noqa: E402


def valid_pack(date="2026-10-08"):
    prompts = [
        {"text": f"a thing number {i}", "hint": "look around", "decoys": [f"decoy {i}-{j}" for j in range(10)]}
        for i in range(5)
    ]
    return gp.build_pack(gp.dt.date.fromisoformat(date), "test", prompts)


def test_dry_run_writes_14_valid_packs(tmp_path):
    assert gp.main(["--dry-run", "--out", str(tmp_path)]) == 0
    files = sorted(tmp_path.glob("*.json"))
    assert [f.stem for f in files][0] == "2026-10-08"
    assert [f.stem for f in files][-1] == "2026-10-21"
    assert len(files) == 14
    targets = []
    for f in files:
        pack = json.loads(f.read_text())
        gp.jsonschema.validate(pack, gp.PACK_SCHEMA)
        targets += [p["text"] for p in pack["prompts"]]
    assert len(set(targets)) == len(targets)
    assert gp.main(["--validate-only", "--out", str(tmp_path)]) == 0


def test_schema_rejects_wrong_counts_and_lengths():
    pack = valid_pack()
    assert gp.pack_problems(pack, gp.trigram_embedder, []) == []
    pack["prompts"][0]["decoys"].pop()
    assert any("schema" in p for p in gp.pack_problems(pack, gp.trigram_embedder, []))
    pack = valid_pack()
    pack["prompts"][1]["text"] = "x" * 81
    assert any("schema" in p for p in gp.pack_problems(pack, gp.trigram_embedder, []))


def test_duplicates_rejected():
    pack = valid_pack()
    pack["prompts"][1]["text"] = pack["prompts"][0]["text"]
    assert any("duplicate" in p for p in gp.pack_problems(pack, gp.trigram_embedder, []))
    pack = valid_pack()
    pack["prompts"][2]["decoys"][3] = pack["prompts"][2]["text"]
    assert gp.pack_problems(pack, gp.trigram_embedder, [])
    pack = valid_pack()
    probs = gp.pack_problems(pack, gp.trigram_embedder, ["a thing number 0"])
    assert any("earlier pack" in p for p in probs)


def test_regenerates_after_bad_output():
    calls = iter(["not json", json.dumps({"prompts": []}), json.dumps({"prompts": valid_pack()["prompts"]})])
    pack = gp.generate_pack(gp.dt.date(2026, 10, 8), "t", lambda s, u: next(calls), gp.trigram_embedder, [], log=lambda *_: None)
    assert pack["prompts"][0]["id"] == "2026-10-08-1"


def test_parse_tolerates_code_fences():
    raw = "```json\n" + json.dumps({"prompts": [{"text": " a ", "hint": "h", "decoys": ["d"]}]}) + "\n```"
    assert gp.parse_model_output(raw)[0]["text"] == "a"


def test_fix_article_and_clean():
    assert gp.fix_article("an bright yellow shard") == "a bright yellow shard"
    assert gp.fix_article("a orange leaf") == "an orange leaf"
    assert gp.fix_article("some moss") == "some moss"
    assert gp.clean("  An  Orange Leaf ") == "an orange leaf"


def _kp(text, kind, decoys):
    return {"text": text, "hint": "h", "decoys": [d for d, _ in decoys], "_kind": kind, "_decoy_kinds": [k for _, k in decoys]}


def test_kind_problems_catches_same_kind_decoys():
    ok = _kp("an orange leaf on pavement", "leaf", [("a pine cone", "cone"), ("a red hydrant", "hydrant")])
    assert gp.kind_problems([ok], {}) == []
    by_kind = _kp("an orange leaf on pavement", "leaf", [("a pine cone", "leaf")])
    assert gp.kind_problems([by_kind], {})
    by_word = _kp("an orange leaf on pavement", "leaf", [("a pile of brown leaves", "pile")])
    assert gp.kind_problems([by_word], {})
    assert gp.kind_problems([ok, ok], {})  # repeated target kind in a pack
    assert gp.kind_problems([ok], {"leaf": gp.MAX_KIND_REPEATS})  # overused across days


def test_parse_accepts_kinds_and_strips_them_from_pack():
    raw = json.dumps({"prompts": [{"text": "An Bright cone", "kind": "Cone", "hint": "h",
                                   "decoys": [{"text": "a rock", "kind": "rock"}]}]})
    prompts = gp.parse_model_output(raw)
    assert prompts[0]["text"] == "a bright cone" and prompts[0]["_kind"] == "cone"
    pack = gp.build_pack(gp.dt.date(2026, 10, 8), "m", prompts)
    assert "_kind" not in pack["prompts"][0] and pack["prompts"][0]["decoys"] == ["a rock"]


def test_word_forms():
    assert {"leaf", "leaves"} <= gp.word_forms("leaf")
    assert "leaf" in gp.word_forms("leaves")
    assert {"berry", "berries"} <= gp.word_forms("berries")
    assert "cones" in gp.word_forms("cone")
    assert "grass" in gp.word_forms("grass") and "gras" not in gp.word_forms("grass")


def test_resume_keeps_existing_packs(tmp_path):
    assert gp.main(["--dry-run", "--days", "3", "--out", str(tmp_path)]) == 0
    first = (tmp_path / "2026-10-08.json").read_text()
    (tmp_path / "2026-10-10.json").unlink()
    assert gp.main(["--dry-run", "--days", "4", "--resume", "--out", str(tmp_path)]) == 0
    assert (tmp_path / "2026-10-08.json").read_text() == first
    assert sorted(f.stem for f in tmp_path.glob("*.json")) == ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]
    kinds = json.loads((tmp_path / ".gen" / "kinds.json").read_text())
    assert set(kinds) == {"2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"}
    assert all(len(v) == 5 for v in kinds.values())


def test_timeout_is_retried():
    calls = iter([TimeoutError("timed out"), json.dumps({"prompts": valid_pack()["prompts"]})])

    def gen(s, u):
        v = next(calls)
        if isinstance(v, Exception):
            raise v
        return v

    pack = gp.generate_pack(gp.dt.date(2026, 10, 8), "t", gen, gp.trigram_embedder, [], log=lambda *_: None)
    assert len(pack["prompts"]) == 5


def test_rejection_reasons_are_fed_back():
    seen = []
    good = json.dumps({"prompts": valid_pack()["prompts"]})
    dup = valid_pack()["prompts"]
    dup[0]["text"] = "an earlier target"

    def gen(system, user):
        seen.append(user)
        return json.dumps({"prompts": dup}) if len(seen) == 1 else good

    gp.generate_pack(gp.dt.date(2026, 10, 8), "t", gen, gp.trigram_embedder, ["an earlier target"], log=lambda *_: None)
    assert "previous attempt was rejected" not in seen[0]
    assert "previous attempt was rejected" in seen[1] and "an earlier target" in seen[1]


def test_resume_gap_avoids_later_packs(tmp_path):
    assert gp.main(["--dry-run", "--days", "3", "--out", str(tmp_path)]) == 0
    later = [p["text"] for p in json.loads((tmp_path / "2026-10-10.json").read_text())["prompts"]]
    (tmp_path / "2026-10-09.json").unlink()
    assert gp.main(["--dry-run", "--days", "3", "--resume", "--out", str(tmp_path)]) == 0
    regenerated = [p["text"] for p in json.loads((tmp_path / "2026-10-09.json").read_text())["prompts"]]
    assert not set(regenerated) & set(later)


def test_low_rated_targets_are_rejected_with_feedback():
    seen = []
    bad = valid_pack()["prompts"]
    bad[2]["text"] = "a white puffball on needles"
    good = valid_pack()["prompts"]

    def gen(system, user):
        seen.append(user)
        return json.dumps({"prompts": bad if len(seen) == 1 else good})

    pack = gp.generate_pack(gp.dt.date(2026, 10, 8), "t", gen, gp.trigram_embedder, [], log=lambda *_: None, rater=gp.stub_rater)
    assert "puffball" not in json.dumps(pack)
    assert "rated 2/5" in seen[1]


def test_rate_existing_flags_low_days(tmp_path, capsys):
    assert gp.main(["--dry-run", "--days", "2", "--out", str(tmp_path)]) == 0
    p = json.loads((tmp_path / "2026-10-09.json").read_text())
    p["prompts"][0]["text"] = "a patch of dark gray mold"
    (tmp_path / "2026-10-09.json").write_text(json.dumps(p))
    assert gp.main(["--dry-run", "--rate", "--out", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "LOW 2026-10-09 2/5" in out
    assert f"days with a target rated < {gp.MIN_RATING}: 2026-10-09" in out
    assert (tmp_path / ".gen" / "ratings.json").exists()


def test_banned_words():
    assert gp.banned_problems(["a white mold patch on damp wood"])
    assert gp.banned_problems(["a blue plastic wrapper near the curb"])
    assert gp.banned_problems(["some crushed cans by a bench"])  # plural form
    assert gp.banned_problems(["a pumpkin on a front porch"])
    assert gp.banned_problems(["a red fire hydrant", "a pecan on grass", "a canopy of oak leaves"]) == []
