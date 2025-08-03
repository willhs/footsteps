import json
import os
import shutil
import sys
from pathlib import Path
import numpy as np

def test_redistribute_coordinates(tmp_path):
    sys.path.append(str(Path(__file__).resolve().parents[1] / "footstep-generator"))
    from redistribute_coords import redistribute_coordinates

    processed = tmp_path / "processed"
    processed.mkdir()
    fixture = Path(__file__).parent / "fixtures" / "multi_year_sample.geojson"
    shutil.copy(fixture, processed / "hyde_human_dots_backup.geojson")
    expected_count = len(json.load(open(fixture))['features'])

    cwd = os.getcwd()
    try:
        os.chdir(tmp_path)
        np.random.seed(0)
        output_relative = redistribute_coordinates()
    finally:
        os.chdir(cwd)

    output_path = tmp_path / output_relative
    assert output_path.exists()

    data = json.load(open(output_path))
    assert len(data['features']) == expected_count
    for feature in data['features']:
        lon, lat = feature['geometry']['coordinates']
        assert -180 <= lon <= 180
        assert -85 <= lat <= 85

