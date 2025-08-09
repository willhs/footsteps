import os
import sys
import numpy as np

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from landmask import is_land
from lod_processor import LODProcessor
from settlement_registry import SettlementRegistry
from process_cities import add_rural_population


def test_random_dots_on_land():
    processor = LODProcessor()
    np.random.seed(0)
    for settlement_type in ['rural', 'town', 'city']:
        dots = processor._create_random_dots(1000, 51.5, 0.0, 1.0, 100, settlement_type)
        assert dots
        for lat, lon, _ in dots:
            assert is_land(lat, lon)


def test_deterministic_positions_on_land():
    registry = SettlementRegistry()
    for settlement_type in ['rural', 'town', 'city']:
        positions = registry._generate_deterministic_positions(51.5, 0.0, 1.0, 5, 'cell', settlement_type)
        for pos in positions:
            assert is_land(pos.coordinates.latitude, pos.coordinates.longitude)


def test_rural_population_on_land():
    np.random.seed(0)
    dots = add_rural_population([], 2000, 1000)
    rural_dots = [d for d in dots if d['type'] == 'rural']
    assert rural_dots
    for dot in rural_dots:
        assert is_land(dot['lat'], dot['lon'])
