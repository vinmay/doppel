import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import gate_h1 as g  # noqa: E402


def test_temperature_clamps_and_scales():
    assert list(g.temperature([0.4, 0.5, 0.6, 0.7, 0.9], 0.5, 0.7)) == [0, 0, 50, 100, 100]


def test_rank_counts_strictly_greater():
    row = np.array([0.5, 0.7, 0.7, 0.2])
    assert g.rank_of(row, 1) == 1 and g.rank_of(row, 2) == 1 and g.rank_of(row, 0) == 3


def test_analyse_on_separable_toy_data():
    rng = np.random.default_rng(1)
    vocab = [f"w{i}" for i in range(40)]
    V = g.unit(rng.normal(size=(40, 16)))
    prompts = vocab[:3]
    P = g.unit(np.vstack([V[0] * 3 + rng.normal(size=16) * 0.1, V[2] * 3 + rng.normal(size=16) * 0.1, rng.normal(size=16)]))
    r = g.analyse(V, P, ["01_a.jpg", "03_b.jpg", "x.jpg"], vocab, prompts, n_unrelated=5)
    assert [x["rank"] for x in r["rows"]] == [1, 1]
    assert r["c_hot"] > r["c_cold"]
