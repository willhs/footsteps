# Cloud Run Job: MBTiles to PBF exporter (Python)
# Uses in-region conversion to explode MBTiles into z/x/y .pbf under a GCS prefix

FROM python:3.11-slim

# System deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      sqlite3 \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY export_mbtiles_job.py ./

ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["python", "export_mbtiles_job.py"]
