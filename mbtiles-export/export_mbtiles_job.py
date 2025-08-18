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
  TMP_DIR        (default: /tmp)            Directory for temp files
  DOWNLOAD_CHUNK_MB        (default: 8)     Per-chunk read size from GCS when downloading MBTiles
  LOG_PROGRESS_EVERY_MB    (default: 100)   Log download progress every N MB
  LOG_EXPORT_EVERY_TILES   (default: 50000) Log export progress every N tiles

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
import time
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
        "TMP_DIR": os.environ.get("TMP_DIR", "/tmp"),
        "DOWNLOAD_CHUNK_MB": int(os.environ.get("DOWNLOAD_CHUNK_MB", "8")),
        "LOG_PROGRESS_EVERY_MB": int(os.environ.get("LOG_PROGRESS_EVERY_MB", "100")),
        "LOG_EXPORT_EVERY_TILES": int(os.environ.get("LOG_EXPORT_EVERY_TILES", "50000")),
        # Cloud Run Jobs task sharding
        "TASK_INDEX": int(os.environ.get("CLOUD_RUN_TASK_INDEX", "0")),
        "TASK_COUNT": int(os.environ.get("CLOUD_RUN_TASK_COUNT", "1")),
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
    tmp_dir: str,
    download_chunk_mb: int,
    log_progress_every_mb: int,
    log_export_every_tiles: int,
) -> tuple[int, int, int]:
    """Download src_blob (MBTiles) to /tmp, iterate tiles, and upload to dst_bucket.
    Returns (total_tiles, uploaded, skipped).
    """
    year = parse_year_from_blob_name(src_blob.name)
    if year is None:
        raise RuntimeError(f"Could not parse year from {src_blob.name}")

    # Download MBTiles to local tmp (streamed with progress)
    basename = os.path.basename(src_blob.name)
    # Prefer configured TMP_DIR, else fall back to system temp dir
    tmp_base = tmp_dir or tempfile.gettempdir()
    tmp_path = os.path.join(tmp_base, basename)

    # Ensure we know the size for progress logs
    size_bytes = src_blob.size
    if size_bytes is None:
        try:
            src_blob.reload()
            size_bytes = src_blob.size
        except Exception:
            size_bytes = None

    chunk_bytes = max(1, download_chunk_mb) * 1024 * 1024
    log_every = max(1, log_progress_every_mb) * 1024 * 1024
    LOG.info(
        "Downloading %s (%.1f MB) -> %s in %d MB chunks",
        src_blob.name,
        (size_bytes or 0) / 1_000_000.0,
        tmp_path,
        download_chunk_mb,
    )
    t0 = time.time()
    read_bytes = 0
    last_log_at = 0
    # Use blob.open to stream without buffering whole object in memory
    with src_blob.open("rb") as reader, open(tmp_path, "wb") as out:
        while True:
            buf = reader.read(chunk_bytes)
            if not buf:
                break
            out.write(buf)
            read_bytes += len(buf)
            if read_bytes - last_log_at >= log_every:
                dt = max(time.time() - t0, 1e-6)
                mbps = (read_bytes / 1_000_000.0) / dt
                if size_bytes:
                    LOG.info(
                        "Downloading %s: %.1f / %.1f MB (%.2f MB/s)",
                        basename,
                        read_bytes / 1_000_000.0,
                        size_bytes / 1_000_000.0,
                        mbps,
                    )
                else:
                    LOG.info(
                        "Downloading %s: %.1f MB (%.2f MB/s)",
                        basename,
                        read_bytes / 1_000_000.0,
                        mbps,
                    )
                last_log_at = read_bytes
    LOG.info("Finished download %s in %.1fs", basename, time.time() - t0)

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

        LOG.info("Exporting tiles from %s -> %s", basename, out_base)
        with futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
            pending: Set[futures.Future] = set()
            t_export_start = time.time()
            log_every_tiles = max(1, int(log_export_every_tiles))

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
                # Periodic progress logging
                if (total % log_every_tiles) == 0:
                    dt = max(time.time() - t_export_start, 1e-6)
                    rate = total / dt
                    LOG.info(
                        "Export progress %s: read=%d uploaded=%d skipped=%d pending=%d (%.0f tiles/s)",
                        basename,
                        total,
                        uploaded,
                        skipped,
                        len(pending),
                        rate,
                    )
            # Drain remaining
            for d in futures.as_completed(pending):
                if d.exception() is None and d.result() is False:
                    skipped += 1
                elif d.exception() is None and d.result() is True:
                    uploaded += 1
                else:
                    LOG.warning(f"Upload error: {d.exception()}")
            LOG.info(
                "Finished export %s: tiles=%d uploaded=%d skipped=%d in %.1fs",
                basename,
                total,
                uploaded,
                skipped,
                time.time() - t_export_start,
            )
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

    # Materialize and deterministically order blobs for sharding
    blobs_all = list(list_mbtiles(client, cfg["SRC_BUCKET"], cfg["SRC_PREFIX"]))
    blobs_all.sort(key=lambda b: b.name)

    # Apply year filter if provided
    if years_filter is not None:
        blobs_all = [b for b in blobs_all if (parse_year_from_blob_name(b.name) in years_filter)]

    # Shard across tasks using modulo index
    ti = cfg["TASK_INDEX"]
    tc = cfg["TASK_COUNT"]
    if tc < 1:
        tc = 1
    selected = [b for i, b in enumerate(blobs_all) if (i % tc) == ti]

    LOG.info(
        "Sharding: task %d/%d selected %d of %d files (filter=%s)",
        ti + 1,
        tc,
        len(selected),
        len(blobs_all),
        sorted(list(years_filter)) if years_filter else "<none>",
    )

    total_files = exported_files = 0
    for blob in selected:
        year = parse_year_from_blob_name(blob.name)
        if year is None:
            LOG.info("Skipping non-year blob: %s", blob.name)
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
            tmp_dir=cfg["TMP_DIR"],
            download_chunk_mb=cfg["DOWNLOAD_CHUNK_MB"],
            log_progress_every_mb=cfg["LOG_PROGRESS_EVERY_MB"],
            log_export_every_tiles=cfg["LOG_EXPORT_EVERY_TILES"],
        )
        exported_files += 1
        LOG.info("Completed %s: tiles=%d uploaded=%d skipped=%d", blob.name, t, up, sk)

    LOG.info("All done: processed=%d of %d files", exported_files, total_files)


if __name__ == "__main__":
    main()
