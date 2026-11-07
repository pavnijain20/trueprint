import os
import tempfile
from pathlib import Path

_TEST_ROOT = tempfile.TemporaryDirectory(prefix="trueprint-tests-")
os.environ["DATABASE_PATH"] = str(Path(_TEST_ROOT.name) / "trueprint-test.db")
os.environ["UPLOAD_DIR"] = str(Path(_TEST_ROOT.name) / "uploads")
os.environ["DEMO_MODE"] = "true"
os.environ["DEMO_REQUIRE_ROLE_CODES"] = "false"
os.environ["CORS_ORIGINS"] = "http://localhost"
