#!/usr/bin/env python3
"""Tests for Poisson-disc sampling in LODProcessor."""

import math
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lod_processor import LODProcessor
from models import LODConfiguration, SettlementContinuityConfig


def _check_spacing(dots, min_distance):
    for i in range(len(dots)):
        for j in range(i + 1, len(dots)):
            lat1, lon1, _ = dots[i]
            lat2, lon2, _ = dots[j]
            dist = math.hypot(lat1 - lat2, lon1 - lon2)
            assert (
                dist >= min_distance - 1e-9
            ), f"Dots too close: {dist} < {min_distance}"


class TestPoissonDiscSampling:
    def setup_method(self):
        self.cellsize = 0.083333
        self.people_per_dot = 100
        self.population = 5000  # ensures multiple dots
        self.lat = 40.0
        self.lon = -70.0
        self.min_spacing = 0.01

    def test_deterministic_spacing_and_population(self):
        config = LODConfiguration(min_dot_spacing=self.min_spacing)
        continuity = SettlementContinuityConfig(enable_continuity=True)
        processor = LODProcessor(config=config, continuity_config=continuity)

        dots = processor.create_density_aware_dots(
            self.population, self.lat, self.lon, self.cellsize, self.people_per_dot
        )

        assert dots, "No dots generated"
        _check_spacing(dots, self.min_spacing)

        total = sum(p for _, _, p in dots)
        assert abs(total - self.population) < 1e-6

    def test_random_spacing_and_population(self):
        config = LODConfiguration(min_dot_spacing=self.min_spacing)
        continuity = SettlementContinuityConfig(enable_continuity=False)
        processor = LODProcessor(config=config, continuity_config=continuity)

        dots = processor.create_density_aware_dots(
            self.population, self.lat, self.lon, self.cellsize, self.people_per_dot
        )

        assert dots, "No dots generated"
        _check_spacing(dots, self.min_spacing)

        total = sum(p for _, _, p in dots)
        assert abs(total - self.population) < 1e-6
