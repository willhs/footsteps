#!/usr/bin/env python3
"""
Tests for dynamic HYDE ASC file discovery.
"""

import tempfile
import pathlib


def test_find_hyde_files_dynamic():
    from hyde_tile_processor import find_hyde_files

    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        # Create a nested directory structure with some ASC files
        (root / "sub").mkdir()
        (root / "popd_1000AD.asc").write_text("ncols 1\nnrows 1\nxllcorner 0\nyllcorner 0\ncellsize 1\nNODATA_value -9999\n0\n")
        (root / "sub" / "popd_3700BC.asc").write_text("ncols 1\nnrows 1\nxllcorner 0\nyllcorner 0\ncellsize 1\nNODATA_value -9999\n0\n")
        # Non-matching file should be ignored
        (root / "popd_invalid.asc").write_text("dummy")

        mapping = find_hyde_files(str(root))
        assert 1000 in mapping
        assert -3700 in mapping
        assert len(mapping) == 2

