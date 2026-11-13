"""The ground-view picture generator: prompts, scene table, response parsing (no network, no key)."""

import base64
import io
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ground_images as gi  # noqa: E402

META = json.loads((gi.ROOT / "footsteps-web" / "public" / "habitat_meta.json").read_text())
SCENES = gi.load_scenes()


def test_every_scene_names_a_known_landscape_and_era():
    ids = [gi.scene_id(s) for s in SCENES["scenes"]]
    assert len(ids) == len(set(ids)), "duplicate scene"
    for s in SCENES["scenes"]:
        assert s["landscape"] in SCENES["landscapes"]
        assert s["era"] in SCENES["eras"]
    # the task asks for a first batch of roughly 10-20 pictures
    assert 10 <= len(ids) <= 20


def test_every_land_biome_belongs_to_exactly_one_landscape():
    owner: dict[str, str] = {}
    for name, landscape in SCENES["landscapes"].items():
        for biome in landscape.get("biomes", []):
            assert biome not in owner, f"{biome} is in {owner[biome]} and {name}"
            owner[biome] = name
    land = {name for bid, name in META["biomes"].items() if int(bid) != META["iceBiome"]}
    assert set(owner) == land


def test_prompts_fill_the_template_and_keep_people_and_animals_out():
    for s in SCENES["scenes"]:
        p = gi.build_prompt(SCENES, s)
        assert "{" not in p and "}" not in p
        assert SCENES["landscapes"][s["landscape"]]["place"] in p
        assert s["detail"] in p
        assert "no people, no animals" in p
        assert "animal" not in s["detail"].lower() and "herd" not in s["detail"].lower()


def test_extract_image_reads_the_data_url():
    raw = b"\x89PNG-bytes"
    url = "data:image/png;base64," + base64.b64encode(raw).decode()
    resp = {"choices": [{"message": {"images": [{"image_url": {"url": url}}]}}]}
    assert gi.extract_image(resp) == raw


@pytest.mark.parametrize(
    "resp",
    [{}, {"choices": [{"message": {"content": "sorry"}}]}, {"choices": [{"message": {"images": [{"image_url": {"url": "https://x/y.png"}}]}}]}],
)
def test_extract_image_rejects_a_response_without_an_image(resp):
    with pytest.raises(ValueError):
        gi.extract_image(resp)


def test_to_webp_crops_to_16_9_at_card_size():
    Image = pytest.importorskip("PIL.Image")
    src = io.BytesIO()
    Image.new("RGB", (1000, 1000), (90, 120, 60)).save(src, "PNG")
    out = Image.open(io.BytesIO(gi.to_webp(src.getvalue())))
    assert out.size == (gi.WIDTH, gi.HEIGHT) and out.format == "WEBP"


def test_index_lists_only_pictures_that_exist_and_bumps_version_when_they_change(tmp_path):
    first = SCENES["scenes"][0]
    (tmp_path / f"{gi.scene_id(first)}.webp").write_bytes(b"x" * 10)
    a = gi.write_index(SCENES, tmp_path)
    assert a["scenes"] == [gi.scene_id(first)] and a["version"] == 1 and a["bytes"] == 10
    assert gi.write_index(SCENES, tmp_path)["version"] == 1  # unchanged set, same version
    (tmp_path / f"{gi.scene_id(SCENES['scenes'][1])}.webp").write_bytes(b"y")
    b = gi.write_index(SCENES, tmp_path)
    assert len(b["scenes"]) == 2 and b["version"] == 2
    assert b["kind"] == "imagined" and b["model"] == gi.MODEL


def test_generate_without_a_key_stops_before_touching_anything(monkeypatch, capsys):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    assert gi.generate([], False) == 2
    assert "OPENROUTER_API_KEY" in capsys.readouterr().err
