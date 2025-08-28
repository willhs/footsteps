#!/usr/bin/env python3
"""Lightweight land/sea mask utilities.

Offline-friendly with graceful fallback: if dependencies (geopandas/shapely)
or network access are unavailable, treats all points as land.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

_LAND_GEOMETRY = None  # type: Optional[object]

_CACHE_DIR = Path(
    os.environ.get("FOOTSTEPS_CACHE_DIR", Path.home() / ".cache" / "footsteps")
).expanduser()
_CACHE_FILE = _CACHE_DIR / "ne_110m_land.geojson"

def _try_load_landmask(refresh: bool = False) -> Optional[object]:
    """Attempt to load a Natural Earth landmask; return prepared geometry or None.

    If ``refresh`` is True the file is re-downloaded.
    """
    try:
        import io  # local import
        import requests  # type: ignore
        import geopandas as gpd  # type: ignore
        from shapely.prepared import prep  # type: ignore

        if _CACHE_FILE.exists() and not refresh:
            gdf = gpd.read_file(_CACHE_FILE)
            return prep(gdf.union_all())

        url = (
            "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
            "ne_110m_land.geojson"
        )
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _CACHE_FILE.write_bytes(resp.content)
        gdf = gpd.read_file(io.BytesIO(resp.content))
        return prep(gdf.union_all())
    except Exception:
        # Any failure (network or deps) -> fallback
        return None


# Try to load at import time, but silently allow fallback
_LAND_GEOMETRY = _try_load_landmask()


def refresh_landmask_cache() -> bool:
    """Force refresh of cached landmask; return True on success."""

    global _LAND_GEOMETRY
    _LAND_GEOMETRY = _try_load_landmask(refresh=True)
    return _LAND_GEOMETRY is not None


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
