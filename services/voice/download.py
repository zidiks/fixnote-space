"""Puts the models into the image at build time, so the server starts without downloading."""

import os
import urllib.request
from pathlib import Path

from faster_whisper import download_model

# Into the Hugging Face cache (HF_HOME), where WhisperModel(name) finds it.
download_model(os.environ["WHISPER_MODEL"])

voices = Path(os.environ["VOICES_DIR"])
voices.mkdir(parents=True, exist_ok=True)
for path in os.environ["VOICE_FILES"].split():
    for ext in (".onnx", ".onnx.json"):
        url = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/{path}{ext}"
        urllib.request.urlretrieve(url, voices / f"{Path(path).name}{ext}")
