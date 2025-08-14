#!/usr/bin/env python3
"""Lightweight land/sea mask utilities.

Offline-friendly with graceful fallback: if dependencies (geopandas/shapely)
or network access are unavailable, treats all points as land.
"""
from __future__ import annotations

from typing import Optional

_LAND_GEOMETRY = None  # type: Optional[object]

def _try_load_landmask() -> Optional[object]:
    """Attempt to load a Natural Earth landmask; return prepared geometry or None."""
    try:
        import io  # local import
        import requests  # type: ignore
        import geopandas as gpd  # type: ignore
        from shapely.prepared import prep  # type: ignore

        url = (
            "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
            "ne_110m_land.geojson"
        )
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        return prep(gpd.read_file(io.BytesIO(resp.content)).unary_union)
    except Exception:
        # Any failure (network or deps) -> fallback
        return None


# Try to load at import time, but silently allow fallback
_LAND_GEOMETRY = _try_load_landmask()


def is_land(lat: float, lon: float) -> bool:
    """Return True if the given latitude/longitude lies on land.

    Falls back to always True if landmask is not available.
    """
    if _LAND_GEOMETRY is None:
        return True
    try:
        from shapely.geometry import Point  # type: ignore

        return _LAND_GEOMETRY.contains(Point(lon, lat))
    except Exception:
        return True
