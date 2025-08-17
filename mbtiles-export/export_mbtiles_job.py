#!/usr/bin/env python3
"""
Cloud Run Job: Export MBTiles (in GCS) to z/x/y .pbf (to GCS) within region.

Environment variables:
  SRC_BUCKET     (required)  Source GCS bucket containing *.mbtiles
  SRC_PREFIX     (default: tiles/mbtiles/)  Prefix to find MBTiles under SRC_BUCKET
  DST_BUCKET     (default: SRC_BUCKET)      Destination bucket for PBF tiles
  OUT_PREFIX     (default: tiles/humans)    Base prefix, job writes: {OUT_PREFIX}/{year}/single/{z}/{x}/{y}.pbf
  CONCURRENCY    (default: 8)               Parallel uploads per instance
  OVERWRITE      (default: false)           If false, skip existing objects (uses if_generation_match=0)
  YEARS          (optional)                 Comma-separated list to restrict years, e.g. "-1000,0,100"

Notes:
- Expects MBTiles named like humans_{year}.mbtiles to parse {year}
- Sets headers: Content-Type application/x-protobuf, Content-Encoding gzip, Cache-Control public,max-age=31536000,immutable
- Uses in-region GCS bandwidth; minimize egress
"""
from __future__ import annotations

import os
import re
import sys
import sqlite3
import logging
import tempfile
import concurrent.futures as futures
from typing import Iterable, Optional, Set

from google.cloud import storage
from google.api_core import exceptions as gexc


LOG = logging.getLogger("mbtiles-export-job")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s",
)


YEAR_RE = re.compile(r"humans_(-?\d+)\.mbtiles$")


def parse_year_from_blob_name(name: str) -> Optional[int]:
    m = YEAR_RE.search(os.path.basename(name))
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def env_bool(name: str, default: bool = False) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.lower() in {"1", "true", "t", "yes", "y"}


def get_env() -> dict:
    src_bucket = os.environ.get("SRC_BUCKET")
    if not src_bucket:
        LOG.error("SRC_BUCKET is required")
        sys.exit(2)
    return {
        "SRC_BUCKET": src_bucket,
        "SRC_PREFIX": os.environ.get("SRC_PREFIX", "tiles/mbtiles/"),
        "DST_BUCKET": os.environ.get("DST_BUCKET", src_bucket),
        "OUT_PREFIX": os.environ.get("OUT_PREFIX", "tiles/humans"),
        "CONCURRENCY": int(os.environ.get("CONCURRENCY", "8")),
        "OVERWRITE": env_bool("OVERWRITE", False),
        "YEARS": set(filter(None, (s.strip() for s in os.environ.get("YEARS", "").split(",")))) or None,
    }


def list_mbtiles(client: storage.Client, bucket_name: str, prefix: str) -> Iterable[storage.Blob]:
    for blob in client.list_blobs(bucket_name, prefix=prefix):
        if not blob.name.endswith(".mbtiles"):
            continue
        if "/" in blob.name and blob.name.rsplit("/", 1)[-1].startswith("."):
            # skip hidden
            continue
        yield blob


def upload_tile(
    dst_bucket: storage.Bucket,
    out_path: str,
    data: bytes,
    overwrite: bool,
) -> bool:
    """Upload a single tile. Returns True if uploaded, False if skipped."""
    blob = dst_bucket.blob(out_path)
    blob.cache_control = "public, max-age=31536000, immutable"
    blob.content_encoding = "gzip"
    try:
        if overwrite:
            blob.upload_from_string(data, content_type="application/x-protobuf")
            return True
        else:
            blob.upload_from_string(
                data,
                content_type="application/x-protobuf",
                if_generation_match=0,  # only create if not exists
            )
            return True
    except gexc.PreconditionFailed:
        # Object exists; treat as skipped
        return False


def export_one_mbtiles(
    client: storage.Client,
    src_blob: storage.Blob,
    dst_bucket: storage.Bucket,
    out_prefix_base: str,
    overwrite: bool,
    concurrency: int,
) -> tuple[int, int, int]:
    """Download src_blob (MBTiles) to /tmp, iterate tiles, and upload to dst_bucket.
    Returns (total_tiles, uploaded, skipped).
    """
    year = parse_year_from_blob_name(src_blob.name)
    if year is None:
        raise RuntimeError(f"Could not parse year from {src_blob.name}")

    # Download MBTiles to local tmp
    basename = os.path.basename(src_blob.name)
    tmp_path = os.path.join(tempfile.gettempdir(), basename)
    LOG.info(f"Downloading {src_blob.name} -> {tmp_path}")
    src_blob.download_to_filename(tmp_path)

    # Open SQLite and export tiles
    total = uploaded = skipped = 0
    out_base = f"{out_prefix_base}/{year}/single"

    con = sqlite3.connect(tmp_path)
    try:
        cur = con.cursor()
        # Speed up reads
        cur.execute("PRAGMA journal_mode=OFF")
        cur.execute("PRAGMA synchronous=OFF")
        cur.execute("PRAGMA temp_store=MEMORY")
        cur.execute("SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles")

        with futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
            pending: Set[futures.Future] = set()

            def submit_row(z: int, x: int, y_tms: int, data: Optional[bytes]):
                nonlocal uploaded, skipped
                y_xyz = (1 << z) - 1 - y_tms
                out_path = f"{out_base}/{z}/{x}/{y_xyz}.pbf"
                if data is None:
                    return  # skip null tiles
                fut = pool.submit(upload_tile, dst_bucket, out_path, data, overwrite)
                pending.add(fut)

            for (z, x, y_tms, data) in cur:
                total += 1
                submit_row(int(z), int(x), int(y_tms), data)
                # Bound pending futures to avoid unbounded memory
                if len(pending) >= 1000:
                    done, pending = futures.wait(pending, return_when=futures.FIRST_COMPLETED)
                    for d in done:
                        if d.exception() is None and d.result() is False:
                            skipped += 1
                        elif d.exception() is None and d.result() is True:
                            uploaded += 1
                        else:
                            LOG.warning(f"Upload error: {d.exception()}")
            # Drain remaining
            for d in futures.as_completed(pending):
                if d.exception() is None and d.result() is False:
                    skipped += 1
                elif d.exception() is None and d.result() is True:
                    uploaded += 1
                else:
                    LOG.warning(f"Upload error: {d.exception()}")
    finally:
        con.close()
        try:
            os.remove(tmp_path)
        except OSError:
            pass
    return total, uploaded, skipped


def main() -> None:
    cfg = get_env()
    LOG.info(
        "Starting MBTiles→PBF export job with cfg: SRC_BUCKET=%s SRC_PREFIX=%s DST_BUCKET=%s OUT_PREFIX=%s CONCURRENCY=%s OVERWRITE=%s",
        cfg["SRC_BUCKET"], cfg["SRC_PREFIX"], cfg["DST_BUCKET"], cfg["OUT_PREFIX"], cfg["CONCURRENCY"], cfg["OVERWRITE"],
    )

    years_filter: Optional[Set[int]] = None
    if cfg["YEARS"]:
        years_filter = set()
        for y in cfg["YEARS"]:
            try:
                years_filter.add(int(y))
            except ValueError:
                LOG.warning("Ignoring invalid year in YEARS: %s", y)

    client = storage.Client()
    src_bucket = client.bucket(cfg["SRC_BUCKET"])
    dst_bucket = client.bucket(cfg["DST_BUCKET"])

    total_files = exported_files = 0
    for blob in list_mbtiles(client, cfg["SRC_BUCKET"], cfg["SRC_PREFIX"]):
        year = parse_year_from_blob_name(blob.name)
        if year is None:
            LOG.info("Skipping non-year blob: %s", blob.name)
            continue
        if years_filter and year not in years_filter:
            continue
        total_files += 1
        LOG.info("Processing %s (year=%s)", blob.name, year)
        t, up, sk = export_one_mbtiles(
            client=client,
            src_blob=blob,
            dst_bucket=dst_bucket,
            out_prefix_base=cfg["OUT_PREFIX"],
            overwrite=cfg["OVERWRITE"],
            concurrency=cfg["CONCURRENCY"],
        )
        exported_files += 1
        LOG.info("Completed %s: tiles=%d uploaded=%d skipped=%d", blob.name, t, up, sk)

    LOG.info("All done: processed=%d of %d files", exported_files, total_files)


if __name__ == "__main__":
    main()
