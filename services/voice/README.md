# FixNote voice server

Speech to text (faster-whisper) and the assistant's voice (Piper) for Pro accounts. The app uses it
when `VITE_VOICE_URL` is set, the account is on Pro, local-only mode is off and the person has not
turned off "Voice through the FixNote server" (Settings → Advanced). Otherwise, and whenever the
server does not answer, everything runs on the device as before.

Nothing is stored: audio and text live only for the request, and requests are not logged. Each call
carries the person's Supabase session; the server checks it and the plan (`my_plan()`) with the
project's public URL and anon key, so it holds no secrets.

- `POST /stt?languages=ru,en,es&prefer=ru` (or `language=ru`): the recording in the body (WAV,
  WebM/Opus, MP4…). Returns `{ text, language, ms }`. The preferred language wins unless Whisper is
  clearly sure of another one (0.8, or 0.95 for phrases under 1.5 s).
- `POST /tts` with `{ "text": "…", "lang": "ru" }`: returns `audio/wav`. The app sends the answer
  sentence by sentence as it streams, so speech starts with the first sentence.
- `GET /health`

## Deploy on a VPS

Needs Docker with Compose, ports 80 and 443 open, and an A record for the domain (default
`voice.fixnote.space`) pointing at the server. 4 CPU cores and 2 GB of RAM are enough for `small`.

```bash
git clone <this repository> fixnote && cd fixnote/services/voice
cp .env.example .env   # fill SUPABASE_URL and SUPABASE_ANON_KEY (the app's public values)
docker compose up -d --build
curl https://voice.fixnote.space/health
```

Caddy gets the HTTPS certificate on its own. Then set the repository variable
`VITE_VOICE_URL=https://voice.fixnote.space` (GitHub → Settings → Secrets and variables → Actions →
Variables) and the same variable wherever the web app is built, and release. The desktop app's CSP
(`tauri.conf.json`) allows `https://voice.fixnote.space`; another domain needs it added there.

Update: `git pull && docker compose up -d --build`.

## Speed

On 4 cores a phrase takes about 1.5 s with `small` and 0.5 s with `base` (more mistakes); a
sentence of speech takes about 0.1 s. The phrase is encoded once for both the language and the
text. `WHISPER_MODEL=base` in `.env` and a rebuild switch the model.

## Voices

Chosen for their licenses (the voices are the datasets' work, and they may be used commercially):
`ru_RU-denis-medium` (CC0), `en_US-kristin-medium` (public domain), `es_ES-davefx-medium` (CC0),
from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices). Another voice: its path in
the Dockerfile's `VOICE_FILES`, its name in `VOICES` in `.env`; check its `MODEL_CARD` license first
(several, like `ru_RU-ruslan` or `en_US-ryan`, are non-commercial). Piper itself (`piper-tts` 1.2.0)
is MIT.

## Develop

```bash
python3.11 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest                              # without models
VOICE_MODELS=/path/to/voices .venv/bin/pytest # with them: Piper speaks, Whisper must hear it
VOICE_AUTH=off VOICES_DIR=/path/to/voices ALLOWED_ORIGINS=http://localhost:5173 \
  .venv/bin/uvicorn app:app --port 8765
```

Then `VITE_VOICE_URL=http://localhost:8765 pnpm dev` and `?dev-backend` (on the trial, so Pro).
