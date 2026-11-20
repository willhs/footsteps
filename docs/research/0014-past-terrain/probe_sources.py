"""Probe public source headers without downloading large palaeogeography archives.

Run from any directory; stdout is JSON suitable for a workspace evidence file.
HTTP failures are observations, not a failed research verdict. This does not
validate payload checksums, scientific contents or redistribution permission.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


SOURCES = {
    "ice6g_present": "https://sharebox.lsce.ipsl.fr/index.php/s/1RSwVf7afj38cmG/download?path=%2F&files=I6_C.VM5a_10min.0.nc",
    "glac1d_deglaciation": "https://sharebox.lsce.ipsl.fr/index.php/s/yfuUw91ruuJXroC/download?path=%2F&files=TOPicemsk.GLACD26kN9894GE90227A6005GGrBgic.nc",
    "paleomist_archive": "https://hs.pangaea.de/Maps/Global_Ice_Sheets/Gowan_ice_reconstruction.zip",
    "sahara_sahel_text": "https://www.ncei.noaa.gov/pub/data/paleo/paleolimnology/africa/sahara-sahel2011hydro.txt",
    "crc806_metadata": "https://crc806db.uni-koeln.de/data/Z/Z2/InlandWaters_CRC806-Database%20%281%29.pdf",
}


def probe(item):
    """Return only non-sensitive provenance and transfer metadata from HEAD."""
    name, url = item
    result = {"name": name, "url": url, "method": "HEAD"}
    try:
        with urlopen(Request(url, method="HEAD"), timeout=15) as response:
            result.update(status=response.status, final_url=response.url)
            for key in ("Content-Type", "Content-Length", "Last-Modified"):
                result[key.lower()] = response.headers.get(key)
    except HTTPError as error:
        result.update(status=error.code, error=str(error))
    except (URLError, TimeoutError, OSError) as error:
        result.update(status=None, error=str(error))
    return result


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(probe, SOURCES.items()))
    print(json.dumps({"checked_at_utc": datetime.now(timezone.utc).isoformat(),
                      "meaning": "Header reachability only; not full download verification",
                      "sources": results}, indent=2))
