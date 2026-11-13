FROM python:3.12-slim
WORKDIR /app
COPY day_api.py atlas.py analogs.py grounding.py anthropology.json.gz ethnography.json.gz time_use.json ./
CMD ["python", "-u", "day_api.py"]
