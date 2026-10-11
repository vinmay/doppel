import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import calibrate  # noqa: E402


def synthetic(n_prompts=15, n_photos=30, margin=0.12, wrong_every=5, seed=1):
    rng = np.random.default_rng(seed)
    sims = rng.normal(0.55, 0.02, size=(n_photos, n_prompts))
    labels = []
    for i in range(n_photos):
        lab = i % n_prompts
        labels.append(lab)
        if i % wrong_every == 0:
            sims[i, (lab + 1) % n_prompts] += margin  # a wrong prompt wins
        else:
            sims[i, lab] += margin
    labels += [None, None]
    sims = np.vstack([sims, rng.normal(0.55, 0.02, size=(2, n_prompts))])
    return sims, labels


def test_softmax0():
    p = calibrate.softmax0(np.array([[0.6, 0.5, 0.5]]), 0.05)
    assert 0.5 < p[0] < 1


def test_sweep_monotonic_in_T():
    sims, labels = synthetic()
    rows = calibrate.sweep(sims, labels)
    correct = [r["correct_mean"] for r in rows]
    # Higher T flattens the softmax, so correct-match scores fall.
    assert correct[0] > correct[-1]
    assert all(r["wrong_mean"] < r["correct_mean"] for r in rows)


def test_choose_meets_constraints_and_writes(tmp_path):
    sims, labels = synthetic()
    res = tmp_path / "results.json"
    res.write_text(json.dumps({"sims": sims.tolist(), "labels": labels, "model": "fake"}))
    out = tmp_path / "scoring.json"
    assert calibrate.main(["--results", str(res), "--out", str(out)]) == 0
    s = json.loads(out.read_text())
    assert s["constraints_met"] is True
    assert 70 <= s["metrics"]["correct_mean"] <= 95
    assert s["metrics"]["wrong_mean"] < 40
    assert s["temperature"] in calibrate.GRID
    assert s["great"] == 75 and s["close"] == 40
