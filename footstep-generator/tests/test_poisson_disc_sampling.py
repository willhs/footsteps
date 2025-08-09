#!/usr/bin/env python3
"""Tests for Poisson-disc sampling in LODProcessor."""

import math
import sys
import os

import pytest

# Add package path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lod_processor import LODProcessor
from models import LODConfiguration, SettlementContinuityConfig


@pytest.mark.parametrize("enable_continuity", [True, False])
def test_min_spacing_and_population_conservation(enable_continuity):
    """Verify minimum spacing and population conservation for both modes."""
    config = LODConfiguration(min_dot_spacing_degrees=0.02)
    continuity_config = SettlementContinuityConfig(enable_continuity=enable_continuity)
    processor = LODProcessor(config=config, continuity_config=continuity_config)

    population = 900
    lat, lon = 10.0, 20.0
    cellsize = 0.2
    people_per_dot = 100

    dots = processor.create_density_aware_dots(population, lat, lon, cellsize, people_per_dot)

    # Should produce multiple dots
    assert len(dots) > 1

    # Check minimum spacing
    for i in range(len(dots)):
        for j in range(i + 1, len(dots)):
            d = math.hypot(dots[i][0] - dots[j][0], dots[i][1] - dots[j][1])
            assert d >= config.min_dot_spacing_degrees - 1e-9

    # Population conservation
    total_pop = sum(dot[2] for dot in dots)
    assert abs(total_pop - population) < 1e-6
