import os, shutil, subprocess, tempfile, threading

_PDF_LOCK = threading.Lock()      # one conversion at a time: LibreOffice/Word cannot run two at once
from pathlib import Path


def _soffice():
    for c in (shutil.which("soffice"), shutil.which("libreoffice"),
              r"C:\Program Files\LibreOffice\program\soffice.exe",
              r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"):
        if c and Path(c).exists(): return c
    return None


def pdf_engine() -> str | None:
    """Which converter is available on this computer: 'libreoffice', 'word' or None."""
    if _soffice(): return "libreoffice"
    try:
        import docx2pdf  # noqa: F401  (uses installed Microsoft Word)
        if os.name == "nt": return "word"
    except Exception:
        pass
    return None


def docx_to_pdf(docx_bytes: bytes) -> bytes:
    with _PDF_LOCK:
        return _docx_to_pdf(docx_bytes)


def _docx_to_pdf(docx_bytes: bytes) -> bytes:
    eng = pdf_engine()
    if eng is None:
        raise RuntimeError("PDF export needs Microsoft Word (pip install docx2pdf) or LibreOffice installed on this PC.")
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "wp.docx"; src.write_bytes(docx_bytes)
        if eng == "libreoffice":
            subprocess.run([_soffice(), f"-env:UserInstallation={Path(td, 'lo').as_uri()}", "--headless", "--convert-to", "pdf", "--outdir", td, str(src)],
                           check=True, timeout=180, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            from docx2pdf import convert
            convert(str(src), str(Path(td) / "wp.pdf"))
        return (Path(td) / "wp.pdf").read_bytes()
