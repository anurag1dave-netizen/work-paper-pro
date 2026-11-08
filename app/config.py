import os, sys
from pathlib import Path

# Folder holding the program files (works both from source and inside a PyInstaller bundle)
APP_ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))


def _data_dir() -> Path:
    env = os.environ.get("WPP_DATA")
    if env:
        p = Path(env)
    elif os.name == "nt":
        p = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "WorkPaperPro"
    else:
        p = Path.home() / ".workpaperpro"
    p.mkdir(parents=True, exist_ok=True)
    return p


DATA_DIR = _data_dir()            # database, generated files - never leaves this computer
DB_PATH = DATA_DIR / "workpapers.db"
EXPORT_DIR = DATA_DIR / "exports"
EXPORT_DIR.mkdir(exist_ok=True)
