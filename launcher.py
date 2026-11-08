"""Work Paper Pro launcher.

Starts the local server (127.0.0.1 only) and opens the app in its own window using Microsoft Edge / Chrome
"app mode" (no browser toolbars). This needs no extra Python packages and works on any Python version.
Optional: `python launcher.py --webview` uses pywebview instead.  Errors go to %LOCALAPPDATA%\\WorkPaperPro\\launcher.log
and a message box - never silently.
"""
import os, socket, subprocess, sys, threading, time, traceback, urllib.request, webbrowser
from pathlib import Path

# Packages the app needs: import name -> pip name.  One-line manual install:
#   pip install fastapi uvicorn lxml docx2pdf pypdf reportlab
REQUIRED = {"fastapi": "fastapi", "uvicorn": "uvicorn", "lxml": "lxml"}
OPTIONAL = {"docx2pdf": "docx2pdf", "pypdf": "pypdf", "reportlab": "reportlab"}          # PDF export through Microsoft Word; LibreOffice also works


def ensure_packages():
    """Install any missing library automatically (needs internet once), so there is no 'No module named' error."""
    if getattr(sys, "frozen", False): return           # the packaged .exe already contains everything
    import importlib.util
    for group, must in ((REQUIRED, True), (OPTIONAL, False)):
        missing = [pip for mod, pip in group.items() if importlib.util.find_spec(mod) is None]
        if not missing: continue
        print("Installing missing libraries:", ", ".join(missing), flush=True)
        for extra in ([], ["--user"], ["--break-system-packages"]):
            try:
                if subprocess.call([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", *extra, *missing]) == 0: break
            except Exception: pass
        still = [pip for mod, pip in group.items() if importlib.util.find_spec(mod) is None]
        if still and must:
            raise SystemExit("Could not install: " + ", ".join(still) + "\nRun this in Command Prompt, then start again:\n  pip install " + " ".join(REQUIRED.values()) + " docx2pdf pypdf reportlab")


PORT = int(os.environ.get("WPP_PORT", "8765"))
LOG = None


def log(msg):
    try:
        with open(LOG, "a", encoding="utf8") as f: f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")
    except Exception:
        pass


def alert(title, msg):
    log(f"ALERT {title}: {msg}")
    try:
        if os.name == "nt":
            import ctypes; ctypes.windll.user32.MessageBoxW(0, msg[:1800], title, 0x10)
        else:
            print(title, msg, file=sys.stderr)
    except Exception:
        pass


def port_free(p):
    s = socket.socket()
    try: s.bind(("127.0.0.1", p)); return True
    except OSError: return False
    finally: s.close()


def already_running(p):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{p}/api/health", timeout=2) as r: return b'"ok":true' in r.read().replace(b" ", b"")
    except Exception:
        return False


def find_browser():
    env = os.environ
    cands = [Path(env.get(k, "")) / sub for k in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA")
             for sub in (r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe")]
    cands += [Path(p) for p in ("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/microsoft-edge")]
    return next((c for c in cands if str(c) not in ("", ".") and c.exists()), None)


def open_window(url, data_dir):
    exe = find_browser()
    if exe and not os.environ.get("WPP_NO_WINDOW"):
        profile = data_dir / "window-profile"; profile.mkdir(exist_ok=True)
        try:
            subprocess.Popen([str(exe), f"--app={url}", f"--user-data-dir={profile}", "--no-first-run",
                              "--no-default-browser-check", "--window-size=1360,880"])
            log(f"opened {exe.name} app window"); return
        except Exception:
            log("browser app mode failed:\n" + traceback.format_exc())
    if not os.environ.get("WPP_NO_WINDOW"): webbrowser.open(url)


def main():
    global LOG
    from app.config import DATA_DIR                      # stdlib-only import, creates the data folder
    LOG = DATA_DIR / "launcher.log"
    ensure_packages()
    log(f"--- start python {sys.version.split()[0]} ---")
    url = f"http://127.0.0.1:{PORT}/"
    if not port_free(PORT):
        if already_running(PORT): log("already running - just opening a window"); open_window(url, DATA_DIR); return
        alert("Work Paper Pro", f"Port {PORT} is used by another program. Close it or set WPP_PORT to a different number.")
        return
    import uvicorn
    from app import main as appmod
    server = uvicorn.Server(uvicorn.Config(appmod.app, host="127.0.0.1", port=PORT, log_level="warning"))   # localhost only
    threading.Thread(target=server.run, daemon=True).start()
    t0 = time.time()
    while not server.started:
        if time.time() - t0 > 30: alert("Work Paper Pro", "The local server did not start. See launcher.log in " + str(DATA_DIR)); return
        time.sleep(0.1)
    log("server started")
    if "--webview" in sys.argv:
        try:
            import webview
            webview.create_window("Work Paper Pro", url, width=1360, height=880, min_size=(1000, 650)); webview.start()
            return
        except Exception:
            log("pywebview failed, using browser window:\n" + traceback.format_exc())
    open_window(url, DATA_DIR)
    # the page pings every few seconds; quit when the window has been closed for a while
    limit = float(os.environ.get("WPP_PING_TIMEOUT", "25"))
    while True:
        time.sleep(2)
        lp = appmod.LAST_PING
        if lp and time.time() - lp > limit: log("window closed - shutting down"); break
    server.should_exit = True


if __name__ == "__main__":
    try:
        main()
    except Exception:
        alert("Work Paper Pro could not start", traceback.format_exc()[-1500:])
