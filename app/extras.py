"""Extra features: copy-forward, document packs, zip/combined PDF, search, checks, preview,
Excel/CSV import, backup/restore and the optional app password.  Registered from main.py."""
import csv, hashlib, io, json, re, secrets, shutil, sqlite3, tempfile, time, zipfile
from datetime import date, datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from lxml import etree
from . import catalog, db, doctpl, exporter
from .config import DATA_DIR, DB_PATH

router = APIRouter()
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
PACK_DEFAULT = ["auditor_consent", "appointment_intimation", "el_audit", "mrl_general"]
_SESSIONS: set[str] = set()


def M():
    from . import main
    return main


# ------------------------------------------------------------------ app password (optional)
def _lock_cfg():
    rf = DATA_DIR / "reset-lock.txt"
    if rf.exists():                                   # recovery: create this empty file in the data folder, then restart/refresh
        try: rf.unlink()
        except OSError: pass
        db.x("DELETE FROM settings WHERE key='lock'")
    r = db.q("SELECT value FROM settings WHERE key='lock'", one=True)
    return json.loads(r["value"]) if r else None


def _hash(pw: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200_000).hex()


def install(app):
    @app.middleware("http")
    async def lock_gate(request: Request, call_next):
        path = request.url.path
        if path.startswith("/api/") and not path.startswith(("/api/lock", "/api/health", "/api/ping")):
            if _lock_cfg() and request.cookies.get("wpp_session") not in _SESSIONS:
                return JSONResponse({"detail": "locked"}, status_code=401)
        return await call_next(request)
    app.include_router(router)


@router.get("/api/lock/status")
def lock_status(request: Request):
    cfg = _lock_cfg()
    return {"enabled": bool(cfg), "unlocked": (not cfg) or request.cookies.get("wpp_session") in _SESSIONS}


@router.post("/api/lock/unlock")
def lock_unlock(b: dict):
    cfg = _lock_cfg()
    if not cfg: return {"ok": True}
    if not secrets.compare_digest(_hash(b.get("password", ""), cfg["salt"]), cfg["hash"]):
        time.sleep(0.6); raise HTTPException(401, "Wrong password")
    tok = secrets.token_hex(16); _SESSIONS.add(tok)
    r = JSONResponse({"ok": True}); r.set_cookie("wpp_session", tok, httponly=True, samesite="strict")
    return r


@router.post("/api/lock/set")
def lock_set(b: dict, request: Request):
    cfg = _lock_cfg()
    if cfg and request.cookies.get("wpp_session") not in _SESSIONS: raise HTTPException(401, "locked")
    pw = (b.get("password") or "")
    if cfg and not secrets.compare_digest(_hash(b.get("current", ""), cfg["salt"]), cfg["hash"]): raise HTTPException(400, "Current password is wrong")
    if pw == "":
        db.x("DELETE FROM settings WHERE key='lock'"); return {"enabled": False}
    if len(pw) < 4: raise HTTPException(400, "Use at least 4 characters")
    salt = secrets.token_hex(16)
    db.x("INSERT INTO settings(key,value) VALUES('lock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (json.dumps({"salt": salt, "hash": _hash(pw, salt)}),))
    tok = secrets.token_hex(16); _SESSIONS.add(tok)
    r = JSONResponse({"enabled": True}); r.set_cookie("wpp_session", tok, httponly=True, samesite="strict")
    return r


# ------------------------------------------------------------------ copy-forward
@router.post("/api/engagements/{eid}/duplicate")
def duplicate(eid: int, b: dict):
    e = M().eng(eid); e.pop("id", None)
    try:
        fy = date.fromisoformat(e.get("fy_end") or "2026-03-31")
        e["fy_end"] = b.get("fy_end") or fy.replace(year=fy.year + 1, day=28 if (fy.month == 2 and fy.day == 29) else fy.day).isoformat()
    except Exception:
        e["fy_end"] = b.get("fy_end") or e.get("fy_end", "")
    e["due_date"] = ""
    if (b.get("client_name") or "").strip(): e["client_name"] = b["client_name"].strip()
    new = db.x("INSERT INTO engagements(data,created,updated) VALUES(?,?,?)", (json.dumps(e), db.now(), db.now()))
    n = 0
    if b.get("papers", True):                                # entered figures are carried over; status and sign-offs start again
        for r in db.q("SELECT * FROM entries WHERE engagement_id=?", (eid,)):
            if r["overrides"] and r["overrides"] != "{}":
                db.x("INSERT INTO entries(engagement_id,wp_id,status,overrides,updated) VALUES(?,?,?,?,?)", (new, r["wp_id"], "draft", r["overrides"], db.now())); n += 1
    d = 0
    if b.get("documents", True):
        for r in db.q("SELECT * FROM docs WHERE engagement_id=?", (eid,)):
            db.x("INSERT INTO docs(engagement_id,tmpl,title,vals,created,updated) VALUES(?,?,?,?,?,?)", (new, r["tmpl"], r["title"], r["vals"], db.now(), db.now())); d += 1
    db.log(new, None, "engagement_created", f"Copied forward from engagement {eid}: {n} papers, {d} documents")
    return {"id": new, "papers": n, "documents": d}


# ------------------------------------------------------------------ document pack
@router.get("/api/pack-default")
def pack_default(): return PACK_DEFAULT


@router.post("/api/engagements/{eid}/pack")
def make_pack(eid: int, b: dict):
    m = M(); e = m.eng(eid); cat = doctpl.catalogue(); firm = m.firm_cfg(); libs = m.clause_libs()
    tmpls = [t for t in (b.get("templates") or PACK_DEFAULT) if t in cat]
    made = []
    def add(tid, title, over=None):
        vals = doctpl.default_values(tid, e, firm, libs); vals.update(over or {})
        did = db.x("INSERT INTO docs(engagement_id,tmpl,title,vals,created,updated) VALUES(?,?,?,?,?,?)", (eid, tid, title, json.dumps(vals), db.now(), db.now()))
        made.append({"id": did, "title": title})
    for t in tmpls: add(t, cat[t]["title"])
    if b.get("per_director"):
        for d in (e.get("profile") or {}).get("directors", []):
            if (d.get("name") or "").strip(): add("mbp1_dir8", f"{cat['mbp1_dir8']['title']} - {d['name']}", {"director": d["name"]})
    db.log(eid, None, "document_pack_created", f"{len(made)} documents")
    return {"created": made}


def _render(eid, did, fmt):
    m = M(); e = m.eng(eid); d = m._doc(eid, did)
    data = doctpl.render(d["tmpl"], e, m.firm_cfg(), d["vals"])
    return (exporter.docx_to_pdf(data) if fmt == "pdf" else data), d, e


@router.get("/api/engagements/{eid}/docs-zip")
def docs_zip(eid: int, format: str = "docx", ids: str = ""):
    m = M(); e = m.eng(eid)
    rows = [r for r in db.q("SELECT id FROM docs WHERE engagement_id=? ORDER BY id", (eid,)) if not ids or str(r["id"]) in ids.split(",")]
    if not rows: raise HTTPException(404, "No documents to download")
    buf = io.BytesIO(); used = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for r in rows:
            try: data, d, _ = _render(eid, r["id"], "pdf" if format == "pdf" else "docx")
            except Exception as ex: raise HTTPException(500 if format != "pdf" else 501, f"Could not generate a document: {ex}")
            name = m.safe(d["title"]) or "document"; k = name; i = 2
            while k in used: k = f"{name} ({i})"; i += 1
            used.add(k); z.writestr(f"{k}.{'pdf' if format == 'pdf' else 'docx'}", data)
    db.log(eid, None, "documents_zip", f"{len(rows)} documents ({format})")
    return Response(buf.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{m.safe(e.get("client_name", "documents"))} - documents.zip"'})


@router.post("/api/engagements/{eid}/docs-combined")
def docs_combined(eid: int, b: dict):
    try:
        from pypdf import PdfReader, PdfWriter
    except Exception:
        raise HTTPException(501, "Combined PDF needs the pypdf library:  pip install pypdf reportlab")
    m = M(); e = m.eng(eid); ids = [int(i) for i in b.get("ids", [])]
    if not ids: raise HTTPException(400, "Select at least one document")
    w = PdfWriter()
    for did in ids:
        try: data, _, _ = _render(eid, did, "pdf")
        except Exception as ex: raise HTTPException(501, str(ex))
        for pg in PdfReader(io.BytesIO(data)).pages: w.add_page(pg)
    total = len(w.pages)
    if b.get("numbering", True):
        try:
            from reportlab.pdfgen import canvas
            for i, pg in enumerate(w.pages, 1):
                wd, ht = float(pg.mediabox.width), float(pg.mediabox.height)
                buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=(wd, ht)); c.setFont("Helvetica", 8)
                c.drawCentredString(wd / 2, 18, f"Page {i} of {total}"); c.save(); buf.seek(0)
                pg.merge_page(PdfReader(buf).pages[0])
        except Exception: pass
    out = io.BytesIO(); w.write(out)
    db.log(eid, None, "documents_combined", f"{len(ids)} documents, {total} pages")
    return Response(out.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{m.safe(e.get("client_name", "documents"))} - combined.pdf"'})


# ------------------------------------------------------------------ pre-issue check and preview
@router.get("/api/engagements/{eid}/docs/{did}/check")
def check_doc(eid: int, did: int):
    m = M(); e = m.eng(eid); d = m._doc(eid, did)
    try: data = doctpl.render(d["tmpl"], e, m.firm_cfg(), d["vals"])
    except Exception as ex: raise HTTPException(500, f"Could not generate this document: {ex}")
    z = zipfile.ZipFile(io.BytesIO(data)); blanks = 0; tokens = 0; where = []
    for n in z.namelist():
        if not re.match(r"word/(document|header\d*|footer\d*)\.xml$", n): continue
        root = etree.fromstring(z.read(n))
        for p in root.iter("{%s}p" % W):
            t = "".join(x.text or "" for x in p.iter("{%s}t" % W))
            if "{{" in t: tokens += 1
            k = t.count("---------")
            if k:
                blanks += k
                if len(where) < 8: where.append(re.sub(r"\s+", " ", t).strip()[:110])
    return {"blanks": blanks, "tokens": tokens, "where": where}


@router.get("/api/engagements/{eid}/docs/{did}/preview")
def preview_doc(eid: int, did: int):
    try: data, _, _ = _render(eid, did, "pdf")
    except Exception as ex: raise HTTPException(501, str(ex))
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": "inline; filename=preview.pdf"})


@router.get("/api/pdf-engine")
def pdf_engine(): return {"engine": exporter.pdf_engine()}


# ------------------------------------------------------------------ search and overview
@router.get("/api/search")
def search(q: str = ""):
    s = q.strip().lower()
    if len(s) < 2: return {"engagements": [], "documents": []}
    engs = {}; out_e = []
    for r in db.q("SELECT * FROM engagements ORDER BY id DESC"):
        d = json.loads(r["data"]); engs[r["id"]] = d
        if s in (d.get("client_name", "") + " " + d.get("task", "") + " " + (d.get("profile") or {}).get("cin", "")).lower():
            out_e.append({"id": r["id"], "client_name": d.get("client_name"), "task": d.get("task"), "fy_end": d.get("fy_end")})
    docs = []
    for r in db.q("SELECT * FROM docs ORDER BY id DESC"):
        title = r["title"] or ""; tm = doctpl.catalogue().get(r["tmpl"], {}).get("title", r["tmpl"])
        if s in (title + " " + tm).lower() or s in engs.get(r["engagement_id"], {}).get("client_name", "").lower():
            docs.append({"id": r["id"], "engagement_id": r["engagement_id"], "title": title, "template": tm,
                         "client_name": engs.get(r["engagement_id"], {}).get("client_name", ""), "updated": r["updated"]})
    return {"engagements": out_e[:30], "documents": docs[:60]}


@router.get("/api/overview")
def overview():
    n = 0; awaiting = 0; signed = 0; total = 0; due = []
    tw = len(catalog.index()); today = date.today()
    for r in db.q("SELECT * FROM engagements"):
        d = json.loads(r["data"]); n += 1; total += tw
        c = {x["status"]: x["n"] for x in db.q("SELECT status,COUNT(*) n FROM entries WHERE engagement_id=? GROUP BY status", (r["id"],))}
        awaiting += c.get("prepared", 0) + c.get("reviewed", 0); signed += c.get("approved", 0)
        if d.get("due_date"):
            try: due.append({"id": r["id"], "client_name": d["client_name"], "due_date": d["due_date"], "days": (date.fromisoformat(d["due_date"]) - today).days})
            except ValueError: pass
    month = datetime.now().strftime("%Y-%m")
    docs_m = db.q("SELECT COUNT(*) n FROM docs WHERE created LIKE ?", (month + "%",), one=True)["n"]
    due.sort(key=lambda x: x["days"])
    return {"clients": n, "awaiting_review": awaiting, "approved": signed, "total_papers": total, "documents_this_month": docs_m, "due": due[:8]}


# ------------------------------------------------------------------ Excel / CSV import
FIELDS = {
    "directors": {"name": ["name", "director", "director name", "name of director"], "din": ["din", "din no", "din number"],
                  "designation": ["designation", "position"], "category": ["category", "type"],
                  "appointed": ["appointed", "date of appointment", "appointment date", "date of appointment (yyyy-mm-dd)"], "address": ["address", "residential address"]},
    "shareholders": {"name": ["name", "shareholder", "name of shareholder", "shareholder name"], "address": ["address"],
                     "shares": ["shares", "no of shares", "number of shares", "no. of shares"], "face_value": ["face value", "face value per share", "fv", "face_value"]},
}


def _xlsx_rows(data: bytes) -> list[list[str]]:
    z = zipfile.ZipFile(io.BytesIO(data)); ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    sst = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in etree.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns):
            sst.append("".join(t.text or "" for t in si.iter("{%s}t" % ns["m"])))
    sheet = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))[0]
    rows = []
    for r in etree.fromstring(z.read(sheet)).iter("{%s}row" % ns["m"]):
        row = {}
        for c in r.findall("m:c", ns):
            col = re.match(r"[A-Z]+", c.get("r")).group(0); idx = 0
            for ch in col: idx = idx * 26 + ord(ch) - 64
            t = c.get("t"); v = c.find("m:v", ns)
            if t == "s" and v is not None: val = sst[int(v.text)]
            elif t == "inlineStr": val = "".join(x.text or "" for x in c.iter("{%s}t" % ns["m"]))
            else: val = v.text if v is not None else ""
            row[idx - 1] = (val or "").strip()
        if row: rows.append([row.get(i, "") for i in range(max(row) + 1)])
    return rows


def _table(name: str, data: bytes) -> list[list[str]]:
    if name.lower().endswith(".xlsx"): return _xlsx_rows(data)
    txt = data.decode("utf-8-sig", errors="replace")
    return [[c.strip() for c in r] for r in csv.reader(io.StringIO(txt)) if any(c.strip() for c in r)]


def _num(s):
    try:
        f = float(str(s).replace(",", "")); return int(f) if f == int(f) else f
    except ValueError: return s


@router.post("/api/engagements/{eid}/import/{kind}")
async def import_rows(eid: int, kind: str, request: Request, filename: str = "data.csv", mode: str = "append"):
    if kind not in FIELDS: raise HTTPException(404, "Unknown import")
    m = M(); e = m.eng(eid); e.pop("id", None)
    try: rows = _table(filename, await request.body())
    except Exception as ex: raise HTTPException(400, f"Could not read the file ({ex}). Use .xlsx or .csv.")
    if len(rows) < 2: raise HTTPException(400, "The file needs a header row and at least one data row")
    head = [re.sub(r"\s+", " ", h.lower().strip()) for h in rows[0]]
    cols = {}
    for key, aliases in FIELDS[kind].items():
        for i, h in enumerate(head):
            if h in aliases: cols[key] = i; break
    if "name" not in cols: raise HTTPException(400, "No 'Name' column found in the first row. Download the sample file to see the layout.")
    items = []
    for r in rows[1:]:
        it = {k: (r[i] if i < len(r) else "") for k, i in cols.items()}
        if not it["name"].strip(): continue
        if kind == "shareholders":
            it["shares"] = _num(it.get("shares", "")); it["face_value"] = _num(it.get("face_value", "")) if it.get("face_value", "") != "" else 10
        else:
            it.setdefault("designation", "Director"); it["designation"] = it["designation"] or "Director"; it["category"] = it.get("category") or "Promoter"
            for k in ("din", "appointed", "address"): it.setdefault(k, "")
        items.append(it)
    prof = e.get("profile") or {}
    prof[kind] = (items if mode == "replace" else (prof.get(kind) or []) + items)
    e["profile"] = prof
    db.x("UPDATE engagements SET data=?, updated=? WHERE id=?", (json.dumps(e), db.now(), eid))
    db.log(eid, None, "import", f"{len(items)} {kind} from {filename}")
    return {"imported": len(items), "ignored_columns": [h for i, h in enumerate(rows[0]) if i not in cols.values() and h]}


@router.get("/api/import-template/{kind}")
def import_template(kind: str):
    if kind not in FIELDS: raise HTTPException(404, "Unknown template")
    if kind == "directors": rows = [["Name", "DIN", "Designation", "Category", "Date of appointment (YYYY-MM-DD)", "Address"], ["---------", "", "Director", "Promoter", "", ""]]
    else: rows = [["Name", "Address", "Shares", "Face value"], ["---------", "", "", 10]]
    buf = io.StringIO(); csv.writer(buf).writerows(rows)
    return Response(("﻿" + buf.getvalue()).encode("utf8"), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{kind}-import-sample.csv"'})


# ------------------------------------------------------------------ backup and restore
@router.get("/api/backup")
def backup():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / "workpapers.db"
        src = sqlite3.connect(DB_PATH); dst = sqlite3.connect(tmp)
        with dst: src.backup(dst)
        src.close(); dst.close()
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(tmp, "workpapers.db"); z.writestr("backup-info.txt", f"Work Paper Pro backup {datetime.now().isoformat(timespec='seconds')}")
    return Response(buf.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="WorkPaperPro-backup-{datetime.now():%Y-%m-%d_%H%M}.zip"'})


@router.post("/api/restore")
async def restore(request: Request):
    body = await request.body()
    try:
        z = zipfile.ZipFile(io.BytesIO(body)); raw = z.read("workpapers.db")
    except Exception: raise HTTPException(400, "This is not a Work Paper Pro backup file (.zip)")
    with tempfile.TemporaryDirectory() as td:
        t = Path(td) / "r.db"; t.write_bytes(raw)
        try:
            c = sqlite3.connect(t); names = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}; ok = c.execute("PRAGMA integrity_check").fetchone()[0]; c.close()
        except Exception: raise HTTPException(400, "The backup file is damaged")
        if ok != "ok" or not {"engagements", "entries", "docs"} <= names: raise HTTPException(400, "The backup file is damaged or incomplete")
        keep = DB_PATH.with_name("workpapers.before-restore.db")
        if DB_PATH.exists(): shutil.copy2(DB_PATH, keep)
        shutil.copy2(t, DB_PATH)
    db.init()
    return {"ok": True}
