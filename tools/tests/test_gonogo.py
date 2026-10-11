import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import gonogo  # noqa: E402


def test_label_for():
    assert gonogo.label_for(Path("03_tree.jpg"), 15) == 2
    assert gonogo.label_for(Path("16_x.jpg"), 15) is None
    assert gonogo.label_for(Path("random.jpg"), 15) is None


def test_top1_accuracy_ignores_distractors():
    sims = np.array([[0.9, 0.1], [0.2, 0.8], [0.7, 0.3]])
    assert gonogo.top1_accuracy(sims, [0, 0, None]) == (1, 2)


def test_softmax_rows_sum_to_one():
    p = gonogo.softmax(np.array([[0.6, 0.55, 0.5]]), 0.02)
    assert np.isclose(p.sum(), 1.0) and p[0, 0] > p[0, 1] > p[0, 2]


def test_as_decodable_converts_heic(tmp_path):
    from PIL import Image
    from pillow_heif import register_heif_opener

    register_heif_opener()
    heic = tmp_path / "x_car.jpg"  # HEIC content under a .jpg name, like an iPhone export
    Image.new("RGB", (8, 8), "red").save(heic, format="HEIF")
    jpg = tmp_path / "01_ok.jpg"
    Image.new("RGB", (8, 8), "blue").save(jpg, format="JPEG")
    out_dir = tmp_path / "out"
    out_dir.mkdir()
    out = gonogo.as_decodable([jpg, heic], out_dir)
    assert out[0] == jpg
    assert out[1].parent == out_dir and Image.open(out[1]).format == "JPEG"
