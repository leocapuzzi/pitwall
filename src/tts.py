"""KittenTTS — gives the race engineer a real voice (offline, English-only).

Tiny ONNX voice model (~25 MB) that runs on CPU. Loaded lazily and kept in
memory (first call ~2 s to load, then ~1.5 s per sentence). English only — the
whole app UI/coach speak English, so that's fine.

Voice: `expr-voice-2-m` (expressive male) as the engineer. Override in
secrets.toml with `tts_voice`.

Depends on: kittentts, soundfile, espeakng-loader (all in requirements.txt).
The espeak library is wired from the bundled espeakng-loader (no system install).
"""
from __future__ import annotations

import io
import os
import threading

import config

_MODEL = None
_LOCK = threading.Lock()
VOICE_PADRAO = "expr-voice-2-m"
SR = 24000
VOICES = ["expr-voice-2-m", "expr-voice-2-f", "expr-voice-3-m", "expr-voice-3-f",
          "expr-voice-4-m", "expr-voice-4-f", "expr-voice-5-m", "expr-voice-5-f"]


def available() -> bool:
    """True if KittenTTS can be imported (dependency installed)."""
    try:
        import kittentts  # noqa: F401
        return True
    except Exception:
        return False


def _model():
    """Load the model once (thread-safe). Wires espeak from espeakng-loader.

    Both the library PATH and the DATA path must be set — without the data path
    espeak-ng aborts the process looking for a hardcoded build dir (phontab).
    """
    global _MODEL
    if _MODEL is None:
        with _LOCK:
            if _MODEL is None:
                import espeakng_loader
                lib = espeakng_loader.get_library_path()
                data = espeakng_loader.get_data_path()
                os.environ.setdefault("PHONEMIZER_ESPEAK_LIBRARY", lib)
                os.environ.setdefault("ESPEAK_DATA_PATH", data)
                from phonemizer.backend.espeak.wrapper import EspeakWrapper
                EspeakWrapper.set_library(lib)
                from kittentts import KittenTTS
                _MODEL = KittenTTS()
    return _MODEL


def voice() -> str:
    v = config.get("tts_voice")
    return v if v in VOICES else VOICE_PADRAO


def synth_wav(text: str, speed: float = 1.0) -> bytes:
    """Synthesize `text` and return WAV bytes (16-bit PCM, 24 kHz mono)."""
    import soundfile as sf
    txt = (text or "").strip()
    if not txt:
        raise ValueError("Empty text for TTS.")
    audio = _model().generate(txt[:1000], voice=voice(), speed=speed)
    buf = io.BytesIO()
    sf.write(buf, audio, SR, format="WAV", subtype="PCM_16")
    return buf.getvalue()
