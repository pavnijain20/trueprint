import os, re, json, hashlib, time
from pathlib import Path
from google import genai
from google.genai import types
from dotenv import load_dotenv
import threading

load_dotenv()
CACHE_FILE = Path(".cache/llm_cache.json")
CACHE_FILE.parent.mkdir(exist_ok=True)
_cache = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}
DEMO_CACHE_FILE = Path(__file__).resolve().parent.parent / "demo_cache.json"
_demo = json.loads(DEMO_CACHE_FILE.read_text()) if DEMO_CACHE_FILE.exists() else {}
_lock = threading.Lock()
_client = genai.Client(api_key=os.getenv("LLM_API_KEY"))
MODEL = os.getenv("LLM_MODEL", "gemini-flash-latest")
FALLBACK = os.getenv("LLM_FALLBACK_MODEL", "")


def redact(text: str) -> str:
    """Remove emails and phone-like numbers before sending to the external LLM."""
    text = re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", "[EMAIL]", text)
    text = re.sub(r"\+?\d[\d\s-]{8,}\d", "[PHONE]", text)
    return text


def _extract_json(raw: str):
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(raw[start:end + 1])
    except json.JSONDecodeError:
        return None


def call_llm(system: str, user: str, retries: int = 3):
    """Returns parsed JSON dict, or None if every attempt fails.
    Retries with a short wait, then tries the fallback model."""
    key = hashlib.sha256((system + user).encode()).hexdigest()
    old_key = hashlib.sha256((MODEL + system + user).encode()).hexdigest()
    for k in (key, old_key):
        if k in _cache:
            return _cache[k]
        if k in _demo:
            return _demo[k]
    models = [MODEL] + ([FALLBACK] if FALLBACK and FALLBACK != MODEL else [])
    for model in models:
        for attempt in range(retries):
            try:
                resp = _client.models.generate_content(
                    model=model,
                    contents=redact(user),
                    config=types.GenerateContentConfig(
                        system_instruction=system,
                        response_mime_type="application/json",
                        max_output_tokens=1500,
                    ),
                )
                data = _extract_json(resp.text or "")
                if data is not None:
                    with _lock:
                        _cache[key] = data
                        CACHE_FILE.write_text(json.dumps(_cache))
                    return data
            except Exception as e:
                print(f"LLM error ({model}, try {attempt + 1}):", str(e)[:120])
            time.sleep(2 * (attempt + 1))
    return None  # caller shows "needs human check"