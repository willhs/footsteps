#!/usr/bin/env python3
"""
Bulk download all HYDE 3.3 zip files from UU repository.
"""

import requests
import pathlib
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin, quote

BASE_URL = "https://geo.public.data.uu.nl/vault-hyde/HYDE%203.3%5B1710493486%5D/original/hyde33_c7_base_mrt2023/zip/"

def get_file_list():
    """Get list of all zip files in the directory."""
    print("🔍 Scanning directory for files...")
    
    try:
        response = requests.get(BASE_URL)
        response.raise_for_status()
        
        # Extract zip file links from HTML
        zip_files = re.findall(r'href="([^"]*\.zip)"', response.text)
        
        print(f"📁 Found {len(zip_files)} zip files")
        return zip_files
        
    except Exception as e:
        print(f"❌ Error scanning directory: {e}")
        return []

def download_file(filename):
    """Download a single file."""
    url = urljoin(BASE_URL, quote(filename))
    output_path = pathlib.Path("data/raw") / filename
    
    try:
        print(f"⬇️  Downloading {filename}...")
        
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=1024*1024):  # 1MB chunks
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
        
        print(f"✅ {filename} ({downloaded / 1024 / 1024:.1f} MB)")
        return filename, True
        
    except Exception as e:
        print(f"❌ Failed {filename}: {e}")
        return filename, False

def main():
    """Main download routine."""
    print("🌍 HYDE 3.3 Bulk Downloader")
    print("=" * 40)
    
    # Create output directory
    pathlib.Path("data/raw").mkdir(parents=True, exist_ok=True)
    
    # Get file list
    files = get_file_list()
    if not files:
        print("No files found to download.")
        return
    
    # Filter for population files (we only need these)
    pop_files = [f for f in files if '_pop.zip' in f]
    print(f"📊 Focusing on {len(pop_files)} population files (popd_*.asc)")
    
    # Download in parallel (4 concurrent downloads)
    successful = 0
    failed = 0
    
    with ThreadPoolExecutor(max_workers=4) as executor:
        # Submit all download tasks
        future_to_file = {executor.submit(download_file, filename): filename 
                         for filename in pop_files}
        
        # Process completed downloads
        for future in as_completed(future_to_file):
            filename, success = future.result()
            if success:
                successful += 1
            else:
                failed += 1
    
    print("\n" + "=" * 40)
    print(f"✅ Downloaded: {successful} files")
    print(f"❌ Failed: {failed} files")
    
    if successful > 0:
        print(f"\n📂 Files saved to: data/raw/")
        print(f"\nNext steps:")
        print(f"1. Extract zip files: cd data/raw && unzip '*.zip'")
        print(f"2. Run processing: poetry run process-hyde")

if __name__ == "__main__":
    main()