import json, zipfile
from functools import lru_cache
from pathlib import Path
from .config import APP_ROOT, DATA_DIR


@lru_cache(maxsize=1)
def root() -> Path:
    p = APP_ROOT / "catalog"
    if (p / "index.json").exists(): return p
    z = APP_ROOT / "catalog.zip"
    p2 = DATA_DIR / "catalog"
    if z.exists() and not (p2 / "index.json").exists():
        with zipfile.ZipFile(z) as zf: zf.extractall(p2)
    if (p2 / "index.json").exists(): return p2
    raise FileNotFoundError("Catalog not found. Run setup.bat (or: python tools/build_catalog.py \"<ICAI template>.docx\" catalog)")


@lru_cache(maxsize=1)
def index() -> list:
    return json.loads((root() / "index.json").read_text(encoding="utf-8"))


def get(wp_id: str) -> dict | None:
    return next((u for u in index() if u["id"] == wp_id), None)


@lru_cache(maxsize=128)
def model(wp_id: str) -> list:
    return json.loads((root() / "models" / f"{wp_id}.json").read_text(encoding="utf-8"))


def unit_path(wp_id: str) -> Path:
    return root() / "units" / f"{wp_id}.docx"
