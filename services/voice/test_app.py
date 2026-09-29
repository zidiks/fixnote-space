"""Tests: `pytest` here. The ones with real models run when VOICE_MODELS points at a folder with the
Piper voices (the Whisper model is downloaded into the Hugging Face cache on first use)."""

from __future__ import annotations

import asyncio
import io
import os
import re
import wave
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import Account, RateLimit, Settings, Speech, create_app, pick_language


def test_pick_language_keeps_the_preferred_one_unless_another_is_clear():
    # Russian speech heard as a little more English than Russian.
    assert pick_language({"en": 0.5, "ru": 0.4, "es": 0.01}, "ru") == "ru"
    # Clear English stays English for a Russian speaker.
    assert pick_language({"en": 0.9, "ru": 0.05}, "ru") == "en"
    assert pick_language({"en": 0.5, "ru": 0.4}, None) == "en"
    assert pick_language({}, "es") == "es"
    # A short "да" that Whisper takes for English (0.73) stays Russian; a clear short "yes" not.
    assert pick_language({"en": 0.73, "ru": 0.001}, "ru", short=True) == "ru"
    assert pick_language({"en": 0.85, "ru": 0.01}, "ru") == "en"
    assert pick_language({"en": 0.85, "ru": 0.01}, "ru", short=True) == "ru"
    assert pick_language({"en": 0.99, "ru": 0.001}, "ru", short=True) == "en"


def plan_server(plan: str, calls: list[str]) -> httpx.AsyncClient:
    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.headers.get("authorization") != "Bearer good":
            return httpx.Response(401, json={"msg": "invalid"})
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": "u1"})
        return httpx.Response(200, json={"plan": plan})

    return httpx.AsyncClient(transport=httpx.MockTransport(handle), base_url="https://sb.test")


def settings(**kw) -> Settings:
    s = Settings()
    s.supabase_url = "https://sb.test"
    s.supabase_anon_key = "anon"
    s.auth = "supabase"
    for k, v in kw.items():
        setattr(s, k, v)
    return s


def test_account_needs_a_pro_session_and_caches_it():
    calls: list[str] = []
    account = Account(settings(), plan_server("pro", calls))
    assert asyncio.run(account.pro_user("Bearer good")) == "u1"
    assert asyncio.run(account.pro_user("Bearer good")) == "u1"
    assert calls == ["/auth/v1/user", "/rest/v1/rpc/my_plan"]
    with pytest.raises(HTTPException) as e:
        asyncio.run(account.pro_user("Bearer bad"))
    assert e.value.status_code == 401
    with pytest.raises(HTTPException) as e:
        asyncio.run(account.pro_user(None))
    assert e.value.status_code == 401
    free = Account(settings(), plan_server("free", []))
    with pytest.raises(HTTPException) as e:
        asyncio.run(free.pro_user("Bearer good"))
    assert e.value.status_code == 402


def test_rate_limit():
    limit = RateLimit(2)
    limit.check("a")
    limit.check("a")
    limit.check("b")
    with pytest.raises(HTTPException) as e:
        limit.check("a")
    assert e.value.status_code == 429


class FakeSpeech:
    def __init__(self):
        self.voices = {"ru": object(), "en": object()}
        self.slots = asyncio.Semaphore(2)
        self.asked: list[tuple] = []

    def transcribe(self, audio, fixed, candidates, prefer):
        self.asked.append((len(audio), fixed, tuple(candidates), prefer))
        return "привет", fixed or prefer or "en"

    def synthesize(self, text, lang):
        return wav_bytes(b"\0\0" * 100, 22050)


def wav_bytes(pcm: bytes, rate: int) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return out.getvalue()


def test_endpoints_without_models():
    fake = FakeSpeech()
    with TestClient(create_app(settings(auth="off", max_text=20), fake)) as client:
        assert client.get("/health").json() == {"ok": True, "stt": "small", "voices": ["en", "ru"]}
        one_second = wav_bytes(b"\0\0" * 16000, 16000)
        res = client.post("/stt?languages=ru,en&prefer=ru", content=one_second)
        assert res.status_code == 200
        assert res.json()["text"] == "привет"
        assert res.json()["language"] == "ru"
        assert fake.asked[-1] == (16000, None, ("ru", "en"), "ru")
        assert client.post("/stt", content=b"").status_code == 400
        assert client.post("/stt", content=b"not audio").status_code == 415
        res = client.post("/tts", json={"text": "Привет", "lang": "ru"})
        assert res.status_code == 200
        assert res.headers["content-type"] == "audio/wav"
        assert client.post("/tts", json={"text": "x" * 21, "lang": "ru"}).status_code == 413
        # The app's origin may call; others may not read the answer.
        ok = client.options(
            "/tts",
            headers={"Origin": "https://app.fixnote.space", "Access-Control-Request-Method": "POST"},
        )
        assert ok.headers.get("access-control-allow-origin") == "https://app.fixnote.space"
        bad = client.options(
            "/tts",
            headers={"Origin": "https://evil.test", "Access-Control-Request-Method": "POST"},
        )
        assert "access-control-allow-origin" not in bad.headers


def test_endpoints_refuse_without_a_session():
    with TestClient(create_app(settings(), FakeSpeech())) as client:
        assert client.post("/tts", json={"text": "hi"}).status_code == 401


models = os.environ.get("VOICE_MODELS")


@pytest.mark.skipif(not models, reason="VOICE_MODELS not set")
def test_real_models_speak_and_hear_each_language():
    s = settings(auth="off", voices_dir=Path(models or "."))
    speech = Speech(s)
    from app import decode

    # Piper's voices vary a little each time (noise in the model): a word may be misheard, so the
    # check is that most of them come through.
    heard_words = 0
    for lang, text, word in [
        ("ru", "Купи молоко и хлеб завтра утром.", "молоко"),
        ("en", "Buy milk and bread tomorrow morning.", "milk"),
        ("es", "Compra leche y pan mañana por la mañana.", "leche"),
    ] * 2:
        audio = decode(speech.synthesize(text, lang))
        heard, language = speech.transcribe(audio, None, ["en", "ru", "es"], "ru")
        assert language == lang, (lang, heard)
        heard_words += word in heard.lower()
    assert heard_words >= 4
    # A one-word answer stays in the person's language (Whisper alone takes "да" for English).
    heard, language = speech.transcribe(decode(speech.synthesize("Да.", "ru")), None, ["en", "ru"], "ru")
    assert language == "ru"
    assert re.match(r"^[а-яё]", heard.lower()), heard
