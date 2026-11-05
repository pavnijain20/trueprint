import os, re, json, hashlib
from pathlib import Path
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()
CACHE_FILE = Path(".cache/llm_cache.json")
CACHE_FILE.parent.mkdir(exist_ok=True)
_cache = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}
_client = genai.Client(api_key=os.getenv("LLM_API_KEY"))
MODEL = os.getenv("LLM_MODEL", "gemini-flash-latest")


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


def call_llm(system: str, user: str, retries: int = 1):
    """Returns parsed JSON dict, or None if the model never returns valid JSON."""
    key = hashlib.sha256((MODEL + system + user).encode()).hexdigest()
    if key in _cache:
        return _cache[key]
    for _ in range(retries + 1):
        try:
            resp = _client.models.generate_content(
                model=MODEL,
                contents=redact(user),
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                    max_output_tokens=1500,
                ),
            )
            data = _extract_json(resp.text or "")
            if data is not None:
                _cache[key] = data
                CACHE_FILE.write_text(json.dumps(_cache))
                return data
        except Exception as e:  # API down, rate limit, etc.
            print("LLM error:", e)
    return None  # caller shows "needs human check"