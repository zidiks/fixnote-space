# FixNote voice server. On the VPS: docker compose up -d --build (see README.md).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/models/hf VOICES_DIR=/models/piper
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The speech model and the voices (their licenses: CC0 and public domain, see README.md).
ARG WHISPER_MODEL=small
ARG VOICE_FILES="ru/ru_RU/denis/medium/ru_RU-denis-medium en/en_US/kristin/medium/en_US-kristin-medium es/es_ES/davefx/medium/es_ES-davefx-medium"
ENV WHISPER_MODEL=${WHISPER_MODEL}
COPY download.py .
RUN VOICE_FILES="${VOICE_FILES}" python download.py

COPY app.py .
RUN useradd --system --no-create-home voice
USER voice
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
