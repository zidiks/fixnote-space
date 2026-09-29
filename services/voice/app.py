"""FixNote voice server: speech to text (faster-whisper) and text to speech (Piper) for Pro accounts.

The app sends what the person said and gets the text back; it sends the assistant's answer sentence
by sentence and gets it back as speech. Nothing is stored or logged: audio and text live only as
long as the request. Every call carries the person's Supabase session; the account must be on Pro
(the same `my_plan()` the app reads). Settings come from the environment, see `.env.example`.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import os
import time
import wave
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path

import httpx
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

log = logging.getLogger("voice")

SAMPLE_RATE = 16_000
LANGUAGES = ("en", "ru", "es")
# How sure detection must be to take another language than the preferred one (as in the app's
# on-device transcription): short phrases ("да") are often misheard as English, so more for them.
OVERRIDE = 0.8
OVERRIDE_SHORT = 0.95
SHORT_S = 1.5
WINDOW_S = 30


def env_list(name: str, default: str) -> list[str]:
    return [v.strip() for v in os.environ.get(name, default).split(",") if v.strip()]


@dataclass
class Settings:
    supabase_url: str = os.environ.get("SUPABASE_URL", "").rstrip("/")
    supabase_anon_key: str = os.environ.get("SUPABASE_ANON_KEY", "")
    # "off" only for local development: then anyone may call.
    auth: str = os.environ.get("VOICE_AUTH", "supabase")
    whisper_model: str = os.environ.get("WHISPER_MODEL", "small")
    whisper_threads: int = int(os.environ.get("WHISPER_THREADS", "0"))
    beam_size: int = int(os.environ.get("WHISPER_BEAM", "1"))
    voices_dir: Path = Path(os.environ.get("VOICES_DIR", "/models/piper"))
    # language=voice file name (without .onnx) in VOICES_DIR.
    voices: dict[str, str] = field(
        default_factory=lambda: dict(
            pair.split("=", 1)
            for pair in env_list(
                "VOICES",
                "ru=ru_RU-denis-medium,en=en_US-kristin-medium,es=es_ES-davefx-medium",
            )
        )
    )
    speed: float = float(os.environ.get("TTS_SPEED", "1.0"))
    origins: list[str] = field(
        default_factory=lambda: env_list(
            "ALLOWED_ORIGINS",
            "https://app.fixnote.space,tauri://localhost,http://tauri.localhost,https://tauri.localhost",
        )
    )
    max_audio_s: float = float(os.environ.get("MAX_AUDIO_SECONDS", "60"))
    max_text: int = int(os.environ.get("MAX_TEXT_CHARS", "800"))
    stt_per_minute: int = int(os.environ.get("STT_PER_MINUTE", "30"))
    tts_per_minute: int = int(os.environ.get("TTS_PER_MINUTE", "120"))
    workers: int = int(os.environ.get("VOICE_WORKERS", "2"))


def pick_language(probs: dict[str, float], prefer: str | None, short: bool = False) -> str:
    """The language among the candidates (`probs`: Whisper's probability of each, out of all the
    languages it knows): the preferred one unless another is clearly more likely."""
    if not probs:
        return prefer or "en"
    best = max(probs, key=lambda code: probs[code])
    needed = OVERRIDE_SHORT if short else OVERRIDE
    if prefer in probs and best != prefer and probs[best] < needed:
        return prefer
    return best


class Account:
    """Checks that a session belongs to a Pro account, with a short cache per session."""

    TTL = 300

    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings = settings
        self.client = client
        self.cache: dict[str, tuple[float, str]] = {}

    async def pro_user(self, authorization: str | None) -> str:
        if self.settings.auth == "off":
            return "dev"
        token = (authorization or "").removeprefix("Bearer ").strip()
        if not token:
            raise HTTPException(401, "signed out")
        key = hashlib.sha256(token.encode()).hexdigest()
        now = time.monotonic()
        hit = self.cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
        base = self.settings.supabase_url
        headers = {"apikey": self.settings.supabase_anon_key, "Authorization": f"Bearer {token}"}
        try:
            user = await self.client.get(f"{base}/auth/v1/user", headers=headers)
            if user.status_code in (401, 403):
                raise HTTPException(401, "signed out")
            user.raise_for_status()
            plan = await self.client.post(f"{base}/rest/v1/rpc/my_plan", headers=headers, json={})
            plan.raise_for_status()
        except httpx.HTTPError as err:
            log.warning("account check failed: %s", type(err).__name__)
            raise HTTPException(503, "account check failed") from err
        if (plan.json() or {}).get("plan") != "pro":
            raise HTTPException(402, "pro required")
        user_id = str(user.json().get("id", ""))
        if len(self.cache) > 10_000:
            self.cache = {k: v for k, v in self.cache.items() if v[0] > now}
        self.cache[key] = (now + self.TTL, user_id)
        return user_id


class RateLimit:
    """At most `limit` calls a minute per account (in memory: one server)."""

    def __init__(self, limit: int):
        self.limit = limit
        self.calls: dict[str, deque[float]] = {}

    def check(self, user: str) -> None:
        now = time.monotonic()
        calls = self.calls.setdefault(user, deque())
        while calls and calls[0] < now - 60:
            calls.popleft()
        if len(calls) >= self.limit:
            raise HTTPException(429, "too many requests")
        calls.append(now)


class Speech:
    """The models, loaded once. Recognition and synthesis run in threads, a few at a time."""

    def __init__(self, settings: Settings):
        from faster_whisper import WhisperModel
        from piper import PiperVoice

        self.settings = settings
        self.whisper = WhisperModel(
            settings.whisper_model,
            device="cpu",
            compute_type="int8",
            cpu_threads=settings.whisper_threads,
            num_workers=settings.workers,
        )
        self.voices = {}
        for lang, name in settings.voices.items():
            path = settings.voices_dir / f"{name}.onnx"
            if path.exists():
                self.voices[lang] = PiperVoice.load(path)
            else:
                log.warning("voice %s for %s is missing (%s)", name, lang, path)
        self.slots = asyncio.Semaphore(settings.workers)

    def transcribe(
        self, audio: np.ndarray, fixed: str | None, candidates: list[str], prefer: str | None
    ) -> tuple[str, str]:
        """Text and language. A phrase (up to 30 s) is encoded once, for both the language and the
        text: the encoder is most of the time on a CPU."""
        from faster_whisper.audio import pad_or_trim
        from faster_whisper.tokenizer import Tokenizer

        w = self.whisper
        encoded = w.encode(pad_or_trim(w.feature_extractor(audio[: SAMPLE_RATE * WINDOW_S])))
        language = fixed
        if not language:
            scores = w.model.detect_language(encoded)[0]
            probs = {tok[2:-2]: p for tok, p in scores if tok[2:-2] in candidates}
            language = pick_language(probs, prefer, short=len(audio) < SHORT_S * SAMPLE_RATE)
        if len(audio) > SAMPLE_RATE * WINDOW_S:
            segments, _ = w.transcribe(
                audio,
                language=language,
                beam_size=self.settings.beam_size,
                condition_on_previous_text=False,
                without_timestamps=True,
            )
            return " ".join(s.text.strip() for s in segments).strip(), language
        tokenizer = Tokenizer(w.hf_tokenizer, True, task="transcribe", language=language)
        prompt = [*tokenizer.sot_sequence, tokenizer.no_timestamps]
        result = w.model.generate(
            encoded,
            [prompt],
            beam_size=self.settings.beam_size,
            max_length=448,
            suppress_blank=True,
            suppress_tokens=[-1],
        )
        return tokenizer.decode(result[0].sequences_ids[0]).strip(), language

    def warm(self) -> None:
        """One pass of each model, so the first person does not wait for their setup."""
        self.transcribe(np.zeros(SAMPLE_RATE, dtype=np.float32), "en", [], None)
        for lang in self.voices:
            self.synthesize("OK.", lang)

    def synthesize(self, text: str, lang: str) -> bytes:
        voice = self.voices.get(lang) or self.voices.get("en") or next(iter(self.voices.values()))
        pcm = b"".join(
            voice.synthesize_stream_raw(
                text, length_scale=1 / self.settings.speed, sentence_silence=0.05
            )
        )
        out = io.BytesIO()
        with wave.open(out, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(voice.config.sample_rate)
            w.writeframes(pcm)
        return out.getvalue()


def decode(data: bytes) -> np.ndarray:
    """Any audio the browser records (WAV, WebM/Opus, MP4) as 16 kHz mono floats."""
    from faster_whisper.audio import decode_audio

    return decode_audio(io.BytesIO(data), sampling_rate=SAMPLE_RATE)


class SpeakBody(BaseModel):
    text: str
    lang: str = "en"


def create_app(settings: Settings | None = None, speech: Speech | None = None) -> FastAPI:
    settings = settings or Settings()
    state: dict[str, object] = {}

    def get_speech() -> Speech:
        if "speech" not in state:
            state["speech"] = speech or Speech(settings)
        return state["speech"]  # type: ignore[return-value]

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        # Load the models before the first person waits for them.
        s = await asyncio.to_thread(get_speech)
        if isinstance(s, Speech):
            await asyncio.to_thread(s.warm)
        yield

    app = FastAPI(
        title="FixNote voice", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Language"],
        max_age=3600,
    )
    stt_limit = RateLimit(settings.stt_per_minute)
    tts_limit = RateLimit(settings.tts_per_minute)

    def get_account() -> Account:
        if "account" not in state:
            state["account"] = Account(settings, httpx.AsyncClient(timeout=5))
        return state["account"]  # type: ignore[return-value]

    @app.get("/health")
    async def health() -> dict[str, object]:
        s = get_speech()
        return {"ok": True, "stt": settings.whisper_model, "voices": sorted(s.voices)}

    @app.post("/stt")
    async def stt(request: Request) -> JSONResponse:
        user = await get_account().pro_user(request.headers.get("authorization"))
        stt_limit.check(user)
        data = await request.body()
        if not data:
            raise HTTPException(400, "no audio")
        if len(data) > 20 * 1024 * 1024:
            raise HTTPException(413, "audio too large")
        q = request.query_params
        candidates = [c for c in (q.get("languages") or ",".join(LANGUAGES)).split(",") if c]
        fixed = q.get("language") or None
        prefer = (q.get("prefer") or "")[:2] or None
        s = get_speech()
        async with s.slots:
            started = time.perf_counter()
            try:
                audio = await asyncio.to_thread(decode, data)
            except Exception as err:  # noqa: BLE001 — any undecodable upload is the client's
                raise HTTPException(415, "unreadable audio") from err
            if len(audio) > settings.max_audio_s * SAMPLE_RATE:
                raise HTTPException(413, "audio too long")
            text, language = await asyncio.to_thread(s.transcribe, audio, fixed, candidates, prefer)
        ms = round((time.perf_counter() - started) * 1000)
        return JSONResponse({"text": text, "language": language, "ms": ms})

    @app.post("/tts")
    async def tts(request: Request, body: SpeakBody) -> Response:
        user = await get_account().pro_user(request.headers.get("authorization"))
        tts_limit.check(user)
        text = body.text.strip()
        if not text:
            raise HTTPException(400, "no text")
        if len(text) > settings.max_text:
            raise HTTPException(413, "text too long")
        lang = body.lang[:2].lower()
        s = get_speech()
        if not s.voices:
            raise HTTPException(503, "no voices")
        async with s.slots:
            wav = await asyncio.to_thread(s.synthesize, text, lang)
        return Response(wav, media_type="audio/wav", headers={"X-Language": lang})

    return app


app = create_app()
