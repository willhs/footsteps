#!/usr/bin/env python3
"""
Test the combined generate_footstep_tiles.py script.

Validates that the combined script provides the expected CLI interface
and integrates correctly with the underlying processing functions.
"""

import subprocess
import tempfile
import os
import pathlib
from typing import List


def test_combined_script_help():
    """Test that the combined script shows help correctly."""
    result = subprocess.run(
        ["python", "generate_footstep_tiles.py", "--help"],
        capture_output=True,
        text=True,
        cwd=pathlib.Path(__file__).parent.parent
    )
    
    assert result.returncode == 0, f"Help command failed: {result.stderr}"
    assert "Footsteps Tile Generator" in result.stdout
    assert "Generate MBTiles from HYDE data" in result.stdout
    assert "--years" in result.stdout
    assert "--single-layer" in result.stdout
    assert "--force" in result.stdout


def test_combined_script_discovery():
    """Test that the script can discover HYDE files correctly."""
    result = subprocess.run(
        ["python", "generate_footstep_tiles.py", "--year", "2000"],  # Non-existent year
        capture_output=True,
        text=True,
        cwd=pathlib.Path(__file__).parent.parent
    )
    
    # Should fail with year not found or data directory not found
    assert result.returncode != 0
    output = result.stdout + result.stderr
    
    # In CI environment, data directory may not exist
    # In local environment with data, should show year not found
    data_dir_missing = "Raw data directory not found" in output
    year_not_found = "Years not found" in output
    
    assert data_dir_missing or year_not_found, f"Expected data directory missing or year not found, got: {output}"
    
    # If data directory exists, should show discovery worked
    if not data_dir_missing:
        assert "Found" in output  # Should show it found some HYDE files


def test_combined_script_imports():
    """Test that the combined script imports work correctly."""
    # This is a basic import test
    try:
        import sys
        sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
        
        # Test that we can import the main functions
        from generate_footstep_tiles import generate_year_tiles_combined, main
        
        # Test that the functions are callable
        assert callable(generate_year_tiles_combined)
        assert callable(main)
        
        print("✓ Combined script imports work correctly")
        
    except ImportError as e:
        assert False, f"Import failed: {e}"


def run_combined_script_tests():
    """Run all combined script tests."""
    print("🧪 Testing combined generate_footstep_tiles.py script...")
    
    try:
        test_combined_script_help()
        print("  ✓ Help output test passed")
        
        test_combined_script_discovery()
        print("  ✓ HYDE discovery test passed (handles both local and CI environments)")
        
        test_combined_script_imports()
        print("  ✓ Import test passed")
        
        print("✅ All combined script tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Combined script test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("🚀 Testing combined script functionality...")
    success = run_combined_script_tests()
    
    if success:
        print("\n🎉 Combined script tests completed successfully!")
        print("📝 The combined script provides a unified interface.")
        print("📝 Use: python generate_footstep_tiles.py [options]")
    else:
        print("\n❌ Some tests failed!")
        exit(1)