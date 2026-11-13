"""Validate the research priors without implying demographic calibration."""

from pathlib import Path
import math

import yaml


def validate() -> None:
    root = Path(__file__).resolve().parents[3]
    path = root / "footstep-generator/anthropology/demography.yaml"
    data = yaml.safe_load(path.read_text())
    note = Path(__file__).with_name("research.md").read_text()
    frontmatter = yaml.safe_load(note.split("---", 2)[1])
    assert all(frontmatter[key] for key in ("id", "type", "purpose"))
    assert data["schema_version"] == 1
    assert data["evidence"] == "modelled"
    assert (root / data["research"]).is_file()
    assert "remaining" in data["definitions"]["e15"]
    assert "births per woman" in data["definitions"]["tfr"]
    assert set(data["profiles"]) == {"forager", "early_farmer", "agrarian", "urban"}
    sources = data["sources"]
    for source in sources.values():
        assert all(source[key] for key in ("citation", "url", "locator"))
    bands = {"0-4", "5-14", "15-29", "30-49", "50+"}
    for name, profile in data["profiles"].items():
        assert profile["era"] and profile["way_of_life"]
        ages = profile["age_structure"]
        assert set(ages) == bands, name
        assert math.isclose(sum(m["value"] for m in ages.values()), 1), name
        assert sum(m["range"][0] for m in ages.values()) <= 1
        assert sum(m["range"][1] for m in ages.values()) >= 1
        for key, metric in {**ages, **{k: profile[k] for k in ("e0", "e15", "tfr")}}.items():
            lo, hi = metric["range"]
            value = metric["value"]
            assert all(isinstance(x, (int, float)) and math.isfinite(x) for x in (lo, value, hi))
            assert 0 <= lo <= value <= hi, (name, key)
            assert metric["sources"] and set(metric["sources"]) <= sources.keys()
            if key in bands:
                assert hi <= 1 and "EDITORIAL2026" in metric["sources"]
            else:
                assert metric["basis"]
        # e15 denotes additional years, never the expected attained age.
        assert profile["e15"]["value"] + 15 > profile["e0"]["value"]
    print("PASS: four modelled profiles; normalized age shares, ranges and source references valid")
    print("No life-table calibration or runtime integration is claimed.")


if __name__ == "__main__":
    validate()
