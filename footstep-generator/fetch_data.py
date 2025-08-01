#!/usr/bin/env python3
"""
Data fetching script for Globe-of-Humans project.
Downloads HYDE 3.3 population density data and Reba urban gazetteer.
"""

import requests
import pathlib
import zipfile
import tarfile
from typing import List, Tuple

# Data sources
DATASETS: List[Tuple[str, str, str]] = [
    (
        "https://themasites.pbl.nl/tridion/en/themasites/hyde/basicdrivingfactors/population/zip/popd_total.zip",
        "data/raw/hyde_popd.zip", 
        "HYDE 3.3 Population Density"
    ),
    (
        "https://sedac.ciesin.columbia.edu/downloads/data/historical-pop-urban/historical-urban-population-3700bc-ad2000/hup_3700bc_ad2000_csv.zip",
        "data/raw/hup_cities.zip",
        "Historical Urban Population 3700 BC - AD 2000"
    )
]

def download_file(url: str, filepath: str, description: str) -> bool:
    """Download a file with progress indication. Returns True if successful."""
    print(f"Downloading {description}...")
    print(f"  From: {url}")
    print(f"  To: {filepath}")
    
    # Create directory if it doesn't exist
    pathlib.Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        # Check if we got HTML instead of a file
        content_type = response.headers.get('content-type', '').lower()
        if 'text/html' in content_type:
            print(f"  ✗ URL returned HTML page instead of file")
            print(f"  This dataset may require manual download from the website")
            return False
        
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=1024*1024):  # 1MB chunks
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        percent = (downloaded / total_size) * 100
                        print(f"  Progress: {percent:.1f}%", end='\r')
        
        print(f"  ✓ Downloaded {description} ({downloaded / 1024 / 1024:.1f} MB)")
        return True
        
    except requests.RequestException as e:
        print(f"  ✗ Failed to download {description}: {e}")
        return False

def extract_archive(filepath: str, extract_to: str) -> None:
    """Extract zip or tar archives."""
    filepath = pathlib.Path(filepath)
    extract_to = pathlib.Path(extract_to)
    extract_to.mkdir(parents=True, exist_ok=True)
    
    print(f"Extracting {filepath.name}...")
    
    try:
        if filepath.suffix.lower() == '.zip':
            with zipfile.ZipFile(filepath, 'r') as zip_ref:
                zip_ref.extractall(extract_to)
        elif filepath.suffix.lower() in ['.tar', '.tgz', '.tar.gz']:
            with tarfile.open(filepath, 'r:*') as tar_ref:
                tar_ref.extractall(extract_to)
        else:
            print(f"  ✗ Unsupported archive format: {filepath.suffix}")
            return
            
        print(f"  ✓ Extracted to {extract_to}")
        
    except Exception as e:
        print(f"  ✗ Failed to extract {filepath.name}: {e}")
        raise

def main():
    """Main data fetching routine."""
    print("🌍 Globe-of-Humans Data Fetcher")
    print("=" * 40)
    
    # Create directories
    pathlib.Path("data/raw").mkdir(parents=True, exist_ok=True)
    pathlib.Path("data/processed").mkdir(parents=True, exist_ok=True)
    
    successful_downloads = []
    failed_downloads = []
    
    # Download datasets
    for url, filepath, description in DATASETS:
        success = download_file(url, filepath, description)
        
        if success:
            # Extract the archive
            extract_dir = pathlib.Path(filepath).parent / pathlib.Path(filepath).stem
            try:
                extract_archive(filepath, extract_dir)
                successful_downloads.append(description)
            except Exception as e:
                print(f"  ✗ Failed to extract {description}: {e}")
                failed_downloads.append(description)
        else:
            failed_downloads.append(description)
    
    print("\n" + "=" * 40)
    
    if successful_downloads:
        print(f"✓ Successfully downloaded: {', '.join(successful_downloads)}")
    
    if failed_downloads:
        print(f"✗ Failed to download: {', '.join(failed_downloads)}")
        print("\n📋 Manual Download Instructions:")
        print("\n1. HYDE 3.3 Population Density:")
        print("   - Visit: https://pbl.nl/en/hyde")
        print("   - Navigate to 'Download' section")
        print("   - Download one of: Baseline, Lower, or Upper estimate scenarios")
        print("   - Look for zip files containing population data (e.g., 10000BC_pop.zip, 1950AD_pop.zip)")
        print("   - Download files with 'popd_*.asc' (population density ASCII grids)")
        print("   - Extract all .asc files to: data/raw/hyde_popd/")
        
        print("\n2. Reba Urban Gazetteer:")
        print("   - Visit: https://sedac.ciesin.columbia.edu/data/set/historical-urban-population-3700-bc-ad-2000")
        print("   - Register for free account if needed")
        print("   - Download CSV file")
        print("   - Extract to: data/raw/hup_cities/")
        
        print("\n3. After manual download, run:")
        print("   poetry run process-hyde")
        print("   poetry run process-cities")
    else:
        print("\nNext steps:")
        print("1. Run: poetry run process-hyde")
        print("2. Run: poetry run process-cities")

if __name__ == "__main__":
    main()