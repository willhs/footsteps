from __future__ import annotations

import os
import shutil
import subprocess
from typing import Optional


def have_pmtiles_cli() -> bool:
    return shutil.which("pmtiles") is not None


def convert_mbtiles_to_pmtiles(in_mbtiles: str, out_pmtiles: str) -> bool:
    """Convert an MBTiles file to a PMTiles file.

    Preference order:
    1) Use `pmtiles` CLI if available (fast and robust)
    2) Try Python package `pmtiles` if installed

    Returns True on success, False otherwise.
    """
    # 1) Prefer CLI
    if have_pmtiles_cli():
        try:
            subprocess.run(["pmtiles", "convert", in_mbtiles, out_pmtiles], check=True)
            return True
        except subprocess.CalledProcessError:
            return False

    # 2) Python fallback
    try:
        # Lazy import to avoid hard dependency in environments without pmtiles
        from pmtiles.convert import mbtiles_to_pmtiles  # type: ignore

        mbtiles_to_pmtiles(in_mbtiles, out_pmtiles)
        return True
    except Exception:
        return False


def ensure_pmtiles_for_year(tiles_dir: str, year: int) -> Optional[str]:
    """Create humans_{year}.pmtiles next to humans_{year}.mbtiles if source exists.

    Returns the PMTiles path on success, or None on failure.
    """
    mb = os.path.join(tiles_dir, f"humans_{year}.mbtiles")
    pm = os.path.join(tiles_dir, f"humans_{year}.pmtiles")
    if not os.path.exists(mb):
        return None
    # Skip if exists
    if os.path.exists(pm):
        return pm
    ok = convert_mbtiles_to_pmtiles(mb, pm)
    return pm if ok else None

