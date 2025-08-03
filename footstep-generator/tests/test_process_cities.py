import sys
import os
import pandas as pd
import numpy as np
import pytest

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from process_cities import load_reba_cities, population_to_dots, add_rural_population


def test_load_reba_cities(tmp_path):
    data = pd.DataFrame({
        'name': ['A', 'B', 'C'],
        'latitude': [10.0, 95.0, 20.0],
        'longitude': [20.0, 30.0, 40.0],
        'pop': [1000, 2000, 0],
        'date': [1990, 1990, 1990]
    })
    csv_path = tmp_path / 'sample_hup_data.csv'
    data.to_csv(csv_path, index=False)

    df = load_reba_cities(str(tmp_path))

    assert set(['lat', 'lon', 'year', 'population']).issubset(df.columns)
    assert not {'latitude', 'longitude', 'pop', 'date'}.intersection(df.columns)
    assert len(df) == 1
    row = df.iloc[0]
    assert row['lat'] == pytest.approx(10.0)
    assert row['lon'] == pytest.approx(20.0)
    assert row['population'] == 1000
    assert row['year'] == 1990


def test_population_to_dots_seeded():
    np.random.seed(42)
    dots = population_to_dots(250, 1990, 10.0, 20.0, 'Metropolis')

    assert len(dots) == 2
    expected = [
        (10.016557138433708, 19.995391189960962),
        (10.021589617936689, 20.05076766188027)
    ]
    for dot, (exp_lat, exp_lon) in zip(dots, expected):
        assert dot['lat'] == pytest.approx(exp_lat)
        assert dot['lon'] == pytest.approx(exp_lon)
        assert dot['year'] == 1990
        assert dot['population'] == 100
        assert dot['city'] == 'Metropolis'
        assert dot['type'] == 'urban'
        assert -90 <= dot['lat'] <= 90
        assert -180 <= dot['lon'] <= 180


def test_add_rural_population_ratio_and_limit():
    urban_dots = [
        {'lat': 0.0, 'lon': 0.0, 'year': 2000, 'population': 100, 'city': 'A', 'type': 'urban'},
        {'lat': 1.0, 'lon': 1.0, 'year': 2000, 'population': 100, 'city': 'B', 'type': 'urban'}
    ]

    np.random.seed(42)
    dots = add_rural_population(urban_dots.copy(), 2000, 1000)
    rural_dots = [d for d in dots if d['type'] == 'rural']
    assert len(rural_dots) == 8
    for dot in rural_dots:
        assert dot['city'] == 'rural'
        assert dot['population'] == 100
        assert -90 <= dot['lat'] <= 90
        assert -180 <= dot['lon'] <= 180

    np.random.seed(0)
    dots_limit = add_rural_population(urban_dots.copy(), 2000, 600000)
    rural_limit = [d for d in dots_limit if d['type'] == 'rural']
    assert len(rural_limit) == 5000

