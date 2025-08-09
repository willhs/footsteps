#!/usr/bin/env python3
"""Lightweight land/sea mask utilities using Natural Earth polygons."""
from __future__ import annotations

import geopandas as gpd
from shapely.geometry import Point
from shapely.prepared import prep
import io
import requests

response = requests.get(
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson",
    timeout=30,
)
response.raise_for_status()
_LAND_GEOMETRY = prep(gpd.read_file(io.BytesIO(response.content)).unary_union)

def is_land(lat: float, lon: float) -> bool:
    """Return True if the given latitude/longitude lies on land."""
    return _LAND_GEOMETRY.contains(Point(lon, lat))
