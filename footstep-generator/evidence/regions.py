"""Regions for the Homo sapiens arrival table: read from `prehistory/arrivals.yaml`, the model's own file.

Evidence (p3k14c dates, AADR samples) is grouped by the same regions, boxes and first-match
rule the population model uses (`prehistory_population.assign_regions`), so "region X" means the
same cells on both sides of a comparison. Nothing is copied here: edit the yaml and every
consumer follows. A point inside no box goes to the nearest box, as the model's cells do, so
there is no "other" bucket.

Data shape: `REGIONS` is the yaml's `regions:` list, in file order (order is the rule: the first
box holding the point wins, so the small islands come before the continents).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import yaml

ARRIVALS = Path(__file__).resolve().parents[1] / "prehistory" / "arrivals.yaml"


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    bbox: tuple[float, float, float, float]  # west, south, east, north
    # Arrival in ka BP: `central` drives the model, `early` and `late` bracket the credible range.
    central: float
    early: float
    late: float
    ramp_ka: float
    verification: str  # "checked" or "memory" (see the yaml header)
    notes: str

    @property
    def arrival_text(self) -> str:
        """'50 ka (47-120 ka, memory)': the model's central arrival, its late-early range, how well sourced."""
        return f"{self.central:g} ka ({self.late:g}-{self.early:g} ka, {self.verification})"


def load_regions(path: Path = ARRIVALS) -> tuple[Region, ...]:
    table = yaml.safe_load(path.read_text())
    return tuple(
        Region(r["id"], r["name"], tuple(r["bbox"]), r["arrival_ka_bp"]["central"], r["arrival_ka_bp"]["early"],
               r["arrival_ka_bp"]["late"], r["ramp_ka"], r["verification"], r.get("notes", ""))
        for r in table["regions"]
    )


REGIONS: tuple[Region, ...] = load_regions()
REGION_IDS: tuple[str, ...] = tuple(r.id for r in REGIONS)


def assign(regions: tuple[Region, ...] | list[Region], lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Index into `regions` per point: the first box holding the point, else the nearest box
    (the model's rule; ties, at distance 0, go to the first region)."""
    lat, lon = np.asarray(lat, dtype=float), np.asarray(lon, dtype=float)
    dist = []
    for r in regions:
        west, south, east, north = r.bbox
        dx = np.maximum(np.maximum(west - lon, lon - east), 0.0)
        dy = np.maximum(np.maximum(south - lat, lat - north), 0.0)
        dist.append(dx * dx + dy * dy)
    return np.argmin(np.stack(dist), axis=0)


def assign_regions(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Region id for each point (object array of str)."""
    return np.array(REGION_IDS, dtype=object)[assign(REGIONS, lat, lon)]
