import csv, io, json, re, zipfile
from datetime import date
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from . import catalog, db, doctpl, docxfill as D, exporter
from .config import APP_ROOT

from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(_):
    db.init(); catalog.index(); yield


app = FastAPI(title="Work Paper Pro (local)", version="1.0", lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])   # blocks DNS-rebinding
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:8080", "http://127.0.0.1:8080"], allow_methods=["*"], allow_headers=["*"])

LAST_PING = 0.0          # set by the UI heartbeat; lets the launcher quit when the window is closed
STAGES = ["prepared", "reviewed", "approved"]
ORDER = {"draft": 0, "prepared": 1, "reviewed": 2, "approved": 3}
ROLE_FOR = {"Prepared": "C", "Reviewed": "T", "Approved": "A"}   # ICAI template legend: C=Audit team, T=Engagement manager, A=Engagement partner


@app.middleware("http")
async def same_origin_writes(request: Request, call_next):
    if request.method in ("POST", "PUT", "DELETE"):
        origin = request.headers.get("origin")
        host = request.headers.get("host", "")
        if origin and not (origin.endswith("//" + host) or origin.startswith(("http://localhost:", "http://127.0.0.1:"))):
            return JSONResponse({"detail": "Cross-origin request blocked"}, status_code=403)
    return await call_next(request)


# ------------------------------------------------------------------ helpers
def eng(eid: int) -> dict:
    r = db.q("SELECT * FROM engagements WHERE id=?", (eid,), one=True)
    if not r: raise HTTPException(404, "Engagement not found")
    d = json.loads(r["data"]); d["id"] = r["id"]; return d


def unit(wp: str) -> dict:
    u = catalog.get(wp)
    if not u: raise HTTPException(404, "Unknown working paper")
    return u


def entry(eid, wp):
    r = db.q("SELECT * FROM entries WHERE engagement_id=? AND wp_id=?", (eid, wp), one=True)
    return (r["status"], json.loads(r["overrides"])) if r else (None, {})


def signoffs(eid, wp):
    rows = db.q("SELECT stage,person,initials,ts,note FROM signoffs WHERE engagement_id=? AND wp_id=? AND active=1 ORDER BY id", (eid, wp))
    return {r["stage"]: dict(r) for r in rows}


def team_name(e, role):
    m = next((m for m in e.get("team", []) if m.get("role") == role and m.get("name")), None)
    return m


def header_info(e, so):
    v = D.derive(e)
    info = {"client": v["client"], "task": v["task"], "period": f"for the year ended {v['end_long']}"}
    for label, role in ROLE_FOR.items():
        s = so.get(label.lower())
        if s:
            d = s["ts"][:10]
            info[label] = (s["person"], f"{s['initials'] or ''} {date.fromisoformat(d):%d/%m/%y}".strip())
        else:
            m = team_name(e, role)
            if m: info[label] = (m["name"], None)
    return info


def generate_bytes(eid, wp):
    e = eng(eid); u = unit(wp); status, ov = entry(eid, wp)
    v = D.derive(e); rules = D.rules_for(v)
    hdr = f"{v['firm']} | {v['client']} | Audit Working Papers FY {v['fy_label']}" if v["client"] else None
    return D.generate(catalog.unit_path(wp), catalog.model(wp), rules, ov, header_info(e, signoffs(eid, wp)), hdr)


def safe(s): return re.sub(r"[^\w\-. ()&]+", "_", s).strip()[:90]


# ------------------------------------------------------------------ models
class EngagementIn(BaseModel):
    client_name: str
    fy_end: str = "2026-03-31"
    firm_name: str = ""
    firm_frn: str = ""
    client_cin: str = ""
    client_pan: str = ""
    task: str = "Statutory Audit"
    due_date: str = ""
    allow_same_signoff: bool = False
    team: list[dict] = []          # [{name, initials, role: C|T|A}]
    profile: dict = {}             # company profile (CIN, address, capital, directors, shareholders)


class FirmIn(BaseModel):
    name: str = ""
    frn: str = ""
    pan: str = ""
    address: str = ""
    place: str = ""
    logo: str = ""                 # data URL, shown in the app header only
    tagline: str = "Chartered Accountants"
    contact: str = ""
    letterhead: bool = True
    partners: list[dict] = []      # [{name, mno}]


class DocNew(BaseModel):
    tmpl: str
    title: str = ""


class DocSave(BaseModel):
    vals: dict
    title: str | None = None


class SaveIn(BaseModel):
    overrides: dict[str, str]      # full set of manual edits {key: text}


class SignIn(BaseModel):
    stage: str
    person: str
    initials: str = ""
    note: str = ""


class ReopenIn(BaseModel):
    reason: str


# ------------------------------------------------------------------ routes
@app.post("/api/ping")
def ping():
    global LAST_PING
    import time; LAST_PING = time.time()
    return {"ok": True}


@app.get("/api/health")
def health(): return {"ok": True, "pdf_engine": exporter.pdf_engine(), "working_papers": len(catalog.index())}


@app.get("/api/catalog")
def get_catalog(): return catalog.index()


@app.get("/api/engagements")
def list_eng():
    out = []
    for r in db.q("SELECT * FROM engagements ORDER BY id DESC"):
        d = json.loads(r["data"]); d["id"] = r["id"]
        c = db.q("SELECT status,COUNT(*) n FROM entries WHERE engagement_id=? GROUP BY status", (r["id"],))
        d["counts"] = {x["status"]: x["n"] for x in c}
        d["docs"] = db.q("SELECT COUNT(*) n FROM docs WHERE engagement_id=?", (r["id"],), one=True)["n"]
        d["total_wps"] = len(catalog.index())
        out.append(d)
    return out


@app.post("/api/engagements")
def new_eng(b: EngagementIn):
    eid = db.x("INSERT INTO engagements(data,created,updated) VALUES(?,?,?)", (json.dumps(b.model_dump()), db.now(), db.now()))
    db.log(eid, None, "engagement_created", b.client_name)
    return eng(eid)


@app.put("/api/engagements/{eid}")
def upd_eng(eid: int, b: EngagementIn):
    old = eng(eid)
    data = b.model_dump(); data["profile"] = old.get("profile") or {}      # profile is saved separately
    db.x("UPDATE engagements SET data=?, updated=? WHERE id=?", (json.dumps(data), db.now(), eid))
    db.log(eid, None, "engagement_updated", "")
    return eng(eid)


@app.get("/api/engagements/{eid}")
def get_eng(eid: int): return eng(eid)


@app.get("/api/engagements/{eid}/progress")
def progress(eid: int):
    e = eng(eid); rules = D.rules_for(D.derive(e)); out = []
    for u in catalog.index():
        status, ov = entry(eid, u["id"])
        row = {**u, "status": status or "not_started"}
        if status:
            row["placeholders"] = D.count_placeholders(catalog.model(u["id"]), rules, ov)
            row["signoffs"] = signoffs(eid, u["id"])
            row["edits"] = len(ov)
        out.append(row)
    return out


@app.get("/api/engagements/{eid}/wps/{wp}")
def get_wp(eid: int, wp: str):
    e = eng(eid); u = unit(wp); status, ov = entry(eid, wp)
    blocks, ph = D.view(catalog.model(wp), D.rules_for(D.derive(e)), ov)
    return {"wp": u, "status": status or "not_started", "blocks": blocks, "placeholders": ph,
            "signoffs": signoffs(eid, wp), "locked": bool(status and ORDER[status] >= 1),
            "header": header_info(e, signoffs(eid, wp))}


@app.put("/api/engagements/{eid}/wps/{wp}")
def save_wp(eid: int, wp: str, b: SaveIn):
    e = eng(eid); unit(wp); status, old = entry(eid, wp)
    if status and ORDER[status] >= 1:
        raise HTTPException(423, "Working paper is signed off (locked). Re-open it with a reason to edit.")
    rules = D.rules_for(D.derive(e)); model = catalog.model(wp)
    res = D.resolve(model, rules, {})
    clean = {}
    for k, val in b.overrides.items():
        if k not in res or k.startswith("c0."): continue          # header block is system-controlled
        if val != res[k][1]: clean[k] = val                       # keep only real changes vs auto text
    if status is None:
        db.x("INSERT INTO entries(engagement_id,wp_id,status,overrides,updated) VALUES(?,?,?,?,?)", (eid, wp, "draft", json.dumps(clean), db.now()))
    else:
        db.x("UPDATE entries SET overrides=?, updated=? WHERE engagement_id=? AND wp_id=?", (json.dumps(clean), db.now(), eid, wp))
    db.log(eid, wp, "saved", f"{len(clean)} manual edits")
    return {"ok": True, "edits": len(clean)}


@app.post("/api/engagements/{eid}/wps/{wp}/signoff")
def signoff(eid: int, wp: str, b: SignIn):
    e = eng(eid); unit(wp); status, _ = entry(eid, wp)
    if status is None: raise HTTPException(409, "Start the working paper (save it) before sign-off.")
    if b.stage not in STAGES: raise HTTPException(400, "Stage must be prepared / reviewed / approved")
    if ORDER[status] + 1 != ORDER[b.stage]:
        raise HTTPException(409, f"Current status is '{status}'. Sign-offs must follow: prepared → reviewed → approved.")
    if not b.person.strip(): raise HTTPException(400, "Name of the person signing is required")
    so = signoffs(eid, wp)
    if b.stage != "prepared" and not e.get("allow_same_signoff") and b.person.strip().lower() == so["prepared"]["person"].strip().lower():
        raise HTTPException(409, "Reviewer/approver must be different from the preparer (can be relaxed in engagement settings).")
    db.x("INSERT INTO signoffs(engagement_id,wp_id,stage,person,initials,ts,note) VALUES(?,?,?,?,?,?,?)",
         (eid, wp, b.stage, b.person.strip(), b.initials.strip(), db.now(), b.note))
    db.x("UPDATE entries SET status=?, updated=? WHERE engagement_id=? AND wp_id=?", (b.stage, db.now(), eid, wp))
    db.log(eid, wp, f"signoff_{b.stage}", b.person)
    return {"ok": True, "status": b.stage}


@app.post("/api/engagements/{eid}/wps/{wp}/reopen")
def reopen(eid: int, wp: str, b: ReopenIn):
    status, _ = entry(eid, wp)
    if status is None or status == "draft": raise HTTPException(409, "Nothing to re-open")
    if len(b.reason.strip()) < 5: raise HTTPException(400, "Please give a reason (min 5 characters)")
    db.x("UPDATE signoffs SET active=0 WHERE engagement_id=? AND wp_id=?", (eid, wp))
    db.x("UPDATE entries SET status='draft', updated=? WHERE engagement_id=? AND wp_id=?", (db.now(), eid, wp))
    db.log(eid, wp, "reopened", b.reason.strip())
    return {"ok": True}


def _send(data: bytes, name: str, fmt: str):
    mt = "application/pdf" if fmt == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return Response(data, media_type=mt, headers={"Content-Disposition": f'attachment; filename="{name}.{fmt}"'})


@app.get("/api/engagements/{eid}/wps/{wp}/export")
def export_wp(eid: int, wp: str, format: str = "docx"):
    u = unit(wp); status, _ = entry(eid, wp)
    data = generate_bytes(eid, wp)
    if format == "pdf":
        try: data = exporter.docx_to_pdf(data)
        except Exception as ex: raise HTTPException(501, str(ex))
    db.log(eid, wp, "exported", format)
    return _send(data, safe(f"WP {u['code']} - {u['title']}"), "pdf" if format == "pdf" else "docx")


@app.get("/api/engagements/{eid}/export-all")
def export_all(eid: int, only_started: bool = True):
    e = eng(eid); buf = io.BytesIO(); idx = io.StringIO()
    w = csv.writer(idx); w.writerow(["WP Ref", "Title", "Status", "Prepared by", "Reviewed by", "Approved by"])
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for u in catalog.index():
            status, _ = entry(eid, u["id"])
            if only_started and not status: continue
            so = signoffs(eid, u["id"])
            w.writerow([u["code"], u["title"], status or "not_started"] + [f"{so[s]['person']} ({so[s]['ts'][:10]})" if s in so else "" for s in STAGES])
            z.writestr(safe(f"{u['code']} {u['title']}") + ".docx", generate_bytes(eid, u["id"]))
        z.writestr("00_Index.csv", idx.getvalue())
    db.log(eid, None, "exported_all", "")
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{safe(e["client_name"])} - Working Papers.zip"'})


@app.get("/api/engagements/{eid}/log")
def get_log(eid: int, wp: str | None = None):
    sql, args = "SELECT ts,wp_id,action,detail FROM audit_log WHERE engagement_id=?", [eid]
    if wp: sql += " AND wp_id=?"; args.append(wp)
    return [dict(r) for r in db.q(sql + " ORDER BY id DESC LIMIT 500", args)]




# ------------------------------------------------------------------ firm settings, company profile, documents
FIRM_DEFAULT = {"name": "", "frn": "", "pan": "", "place": "", "address": "", "tagline": "Chartered Accountants",
                "contact": "", "letterhead": True, "partners": []}      # blank: every deployment sets its own details


def firm_cfg() -> dict:
    r = db.q("SELECT value FROM settings WHERE key='firm'", one=True)
    return {**FIRM_DEFAULT, **(json.loads(r["value"]) if r else {})}


@app.get("/api/firm")
def get_firm(): return firm_cfg()


@app.put("/api/firm")
def put_firm(b: FirmIn):
    db.x("INSERT INTO settings(key,value) VALUES('firm',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (json.dumps(b.model_dump()),))
    return firm_cfg()


def clause_libs() -> dict:
    r = db.q("SELECT value FROM settings WHERE key='clauses'", one=True)
    saved = json.loads(r["value"]) if r else {}
    return {k: saved.get(k) or doctpl.library_default(k) for k in ("mrl", "proposal")}


@app.get("/api/clauses")
def get_clauses(): return clause_libs()


@app.put("/api/clauses")
def put_clauses(b: dict):
    out = {}
    for k in ("mrl", "proposal"):
        secs = []
        for sc in b.get(k, []):
            if not (sc.get("title") or "").strip(): continue
            items = [{"id": it.get("id") or f"c{i}", "title": it.get("title", ""), "text": it.get("text", ""), "on": bool(it.get("on"))}
                     for i, it in enumerate(sc.get("items", [])) if (it.get("text") or "").strip()]
            secs.append({"id": sc.get("id") or f"s{len(secs)}", "title": sc["title"].strip(), "slot": sc.get("slot", "main"), "items": items})
        out[k] = secs
    db.x("INSERT INTO settings(key,value) VALUES('clauses',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (json.dumps(out),))
    return clause_libs()


@app.post("/api/clauses/reset")
def reset_clauses():
    db.x("DELETE FROM settings WHERE key='clauses'")
    return clause_libs()


@app.delete("/api/engagements/{eid}")
def del_eng(eid: int):
    e = eng(eid)
    for t, col in (("entries", "engagement_id"), ("signoffs", "engagement_id"), ("audit_log", "engagement_id"), ("docs", "engagement_id")):
        try: db.x(f"DELETE FROM {t} WHERE {col}=?", (eid,))
        except Exception: pass
    db.x("DELETE FROM engagements WHERE id=?", (eid,))
    return {"ok": True}


@app.put("/api/engagements/{eid}/profile")
def put_profile(eid: int, b: dict):
    e = eng(eid); e.pop("id", None)
    for k in ("directors", "shareholders"):
        b[k] = [x for x in b.get(k, []) if (x.get("name") or "").strip()]
    e["profile"] = b
    db.x("UPDATE engagements SET data=?, updated=? WHERE id=?", (json.dumps(e), db.now(), eid))
    db.log(eid, None, "profile_updated", "")
    return eng(eid)


@app.get("/api/doctemplates")
def doc_templates():
    return [{k: v[k] for k in ("id", "title", "category", "description", "fields")} for v in doctpl.catalogue().values()]


def _doc(eid, did):
    r = db.q("SELECT * FROM docs WHERE id=? AND engagement_id=?", (did, eid), one=True)
    if not r: raise HTTPException(404, "Document not found")
    return {"id": r["id"], "tmpl": r["tmpl"], "title": r["title"], "vals": json.loads(r["vals"]), "updated": r["updated"]}


@app.get("/api/engagements/{eid}/docs")
def list_docs(eid: int):
    eng(eid)
    return [{"id": r["id"], "tmpl": r["tmpl"], "title": r["title"], "updated": r["updated"]}
            for r in db.q("SELECT * FROM docs WHERE engagement_id=? ORDER BY id DESC", (eid,))]


@app.post("/api/engagements/{eid}/docs")
def new_doc(eid: int, b: DocNew):
    e = eng(eid)
    cat = doctpl.catalogue()
    if b.tmpl not in cat: raise HTTPException(404, "Unknown template")
    vals = doctpl.default_values(b.tmpl, e, firm_cfg(), clause_libs())
    did = db.x("INSERT INTO docs(engagement_id,tmpl,title,vals,created,updated) VALUES(?,?,?,?,?,?)",
               (eid, b.tmpl, b.title or cat[b.tmpl]["title"], json.dumps(vals), db.now(), db.now()))
    db.log(eid, None, "document_created", cat[b.tmpl]["title"])
    return _doc(eid, did)


@app.get("/api/engagements/{eid}/docs/{did}")
def get_doc(eid: int, did: int): return _doc(eid, did)


@app.put("/api/engagements/{eid}/docs/{did}")
def save_doc(eid: int, did: int, b: DocSave):
    d = _doc(eid, did)
    db.x("UPDATE docs SET vals=?, title=?, updated=? WHERE id=?", (json.dumps(b.vals), b.title or d["title"], db.now(), did))
    return _doc(eid, did)


@app.delete("/api/engagements/{eid}/docs/{did}")
def del_doc(eid: int, did: int):
    d = _doc(eid, did)
    db.x("DELETE FROM docs WHERE id=?", (did,))
    db.log(eid, None, "document_deleted", d["title"])
    return {"ok": True}


@app.get("/api/engagements/{eid}/docs/{did}/export")
def export_doc(eid: int, did: int, format: str = "docx"):
    e = eng(eid); d = _doc(eid, did)
    try: data = doctpl.render(d["tmpl"], e, firm_cfg(), d["vals"])
    except Exception as ex: raise HTTPException(500, f"Could not generate this document: {ex}")
    if format == "pdf":
        try: data = exporter.docx_to_pdf(data)
        except Exception as ex: raise HTTPException(501, str(ex))
    db.log(eid, None, "document_exported", f"{d['title']} ({format})")
    return _send(data, safe(f"{d['title']} - {e.get('client_name', '')}"), "pdf" if format == "pdf" else "docx")


from . import extras
extras.install(app)


# ------------------------------------------------------------------ UI (Lovable build in ui/dist takes priority)
_ui = next((p for p in (APP_ROOT / "ui" / "dist", APP_ROOT / "ui" / "basic") if (p / "index.html").exists()), None)
if _ui: app.mount("/", StaticFiles(directory=_ui, html=True), name="ui")
