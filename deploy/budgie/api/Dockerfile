FROM python:3.12-slim
RUN pip install --no-cache-dir anthropic
WORKDIR /app
COPY day_api.py .
CMD ["python", "-u", "day_api.py"]
