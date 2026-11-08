"""General document templates (engagement letters, certificates, resolutions ...).
A template is an ordinary .docx made from the firm's own sample, with {{tokens}} where client details go.
Formatting, headers, footers, numbering stay exactly as in the sample."""
import copy, io, json, re, zipfile
from datetime import date, datetime, timedelta
from lxml import etree
from .config import APP_ROOT
from . import docxfill as D
from .docxfill import NS, q, XSP, set_para_text, set_cell_text, sub_paragraph

TPL_DIR = APP_ROOT / "doctemplates"
TOKEN = re.compile(r"\{\{\s*([@\w]+)(?::(\w+))?(?:\|(\w+))?\s*\}\}")


# ------------------------------------------------------------------ helpers
def inr(n, dec=0):
    """Indian digit grouping: 1234567.5 -> 12,34,567."""
    n = float(n or 0)
    neg = n < 0; n = abs(n)
    s = f"{n:.{dec}f}"
    ip, _, fp = s.partition(".")
    if len(ip) > 3:
        head, tail = ip[:-3], ip[-3:]
        parts = []
        while len(head) > 2: parts.insert(0, head[-2:]); head = head[:-2]
        if head: parts.insert(0, head)
        ip = ",".join(parts + [tail])
    return ("-" if neg else "") + ip + (("." + fp) if dec else "")


_ONES = "Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen Fifteen Sixteen Seventeen Eighteen Nineteen".split()
_TENS = "_ _ Twenty Thirty Forty Fifty Sixty Seventy Eighty Ninety".split()


def _below100(n): return _ONES[n] if n < 20 else _TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else "")


def _below1000(n):
    h, r = divmod(n, 100)
    return (_ONES[h] + " Hundred" + (" and " + _below100(r) if r else "")) if h else _below100(r)


def words_inr(n) -> str:
    """Amount in Indian words: 86182385 -> 'Rupees Eight Crore Sixty One Lakh ... Only'."""
    n = round(float(n or 0))
    if n == 0: return "Rupees Zero Only"
    neg = n < 0; n = abs(n)
    out = []
    for div, name in ((10**7, "Crore"), (10**5, "Lakh"), (1000, "Thousand")):
        k, n = divmod(n, div)
        if k: out.append(f"{_below100(k) if k < 100 else _below1000(k)} {name}")
    if n: out.append(_below1000(n))
    return ("Minus " if neg else "") + "Rupees " + " ".join(out) + " Only"


def _ord(d): return str(d) + ("th" if 11 <= d % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(d % 10, "th"))


def fmt_date(v, f="long"):
    if not v: return ""
    try: d = date.fromisoformat(str(v)[:10])
    except ValueError: return str(v)
    return {
        "long": f"{d:%B} {d.day}, {d.year}",            # April 1, 2026
        "ord": f"{_ord(d.day)} {d:%B}, {d.year}",        # 1st April, 2026
        "ordplain": f"{_ord(d.day)} {d:%B} {d.year}",    # 1st April 2026
        "dmy": f"{d:%d/%m/%Y}", "dots": f"{d:%d.%m.%Y}", "dash": f"{d:%d-%m-%Y}",
        "dmonth": f"{d:%d} {d:%B} {d.year}",             # 09 March 2026
        "day": f"{d:%A}",
    }.get(f, str(v))


def apply_filter(s, flt):
    return s.upper() if flt == "upper" else s.title() if flt == "title" else s


# ------------------------------------------------------------------ context
def context(e: dict, firm: dict, vals: dict, schema: dict) -> tuple[dict, dict]:
    """-> (flat text values, raw values). Dates keep their raw ISO value so tokens can pick a format."""
    p = e.get("profile") or {}
    end = date.fromisoformat(e.get("fy_end") or "2026-03-31")
    start = date(end.year - 1, end.month, end.day) + timedelta(days=1)
    base = {
        "company_name": e.get("client_name", ""), "cin": p.get("cin") or e.get("client_cin", ""),
        "company_pan": p.get("pan") or e.get("client_pan", ""),
        "reg_address": p.get("reg_address", ""), "reg_address_oneline": ", ".join(x.strip() for x in (p.get("reg_address") or "").splitlines() if x.strip()),
        "nominal_capital": inr(p.get("nominal_capital")), "paid_up_capital": inr(p.get("paid_up_capital")),
        "fy_long": f"{end.year - 1}-{end.year}", "fy_label": f"{end.year - 1}-{str(end.year)[2:]}",
        "fy_start": fmt_date(start.isoformat(), "long"), "fy_end_long": fmt_date(end.isoformat(), "long"),
        "fy_end_ord": fmt_date(end.isoformat(), "ord"), "fy_end_plain": fmt_date(end.isoformat(), "ordplain"),
        "fy_end_dots": fmt_date(end.isoformat(), "dots"),
        "firm_name": firm.get("name", ""), "firm_frn": firm.get("frn", ""), "firm_pan": firm.get("pan", ""),
        "firm_address": firm.get("address", ""),
        "firm_address_oneline": ", ".join(x.strip() for x in (firm.get("address") or "").splitlines() if x.strip()),
        "firm_tagline": firm.get("tagline", ""),
    }
    lh = firm.get("letterhead", True)
    base["letterhead_name"] = (firm.get("name", "") or "").upper() if lh else ""
    base["letterhead_tagline"] = (firm.get("tagline", "") or "").upper() if lh else ""
    base["letterhead_footer"] = " | ".join(x for x in (base["firm_address_oneline"], firm.get("contact", "")) if x) if lh else ""
    base.update({k: v for k, v in vals.items() if not isinstance(v, (list, dict))})
    raw = dict(base)
    flds = {f["key"]: f for f in schema.get("fields", [])}
    if "assets" in vals or "liabilities" in vals:
        ta = sum(float(x.get("amount") or 0) for x in vals.get("assets", [])); tl = sum(float(x.get("amount") or 0) for x in vals.get("liabilities", []))
        base["networth"] = inr(ta - tl); base["networth_text"] = f"Rs.{inr(ta - tl)}/- ({words_inr(ta - tl)})"
    if "fees" in vals:
        base["fee_total"] = inr(sum(float(x.get("amount") or 0) for x in vals["fees"])) + "/-"
    base.setdefault("place", firm.get("place", ""))
    # directors / shareholders / partners selected by name
    for k, f in flds.items():
        t = f.get("type")
        v = vals.get(k)
        if t == "date": base[k] = fmt_date(v, f.get("fmt", "long"))
        elif t == "money":
            base[k] = inr(v); base[k + "_words"] = words_inr(v)
            base[k + "_text"] = f"₹{inr(v)} ({words_inr(v)})"
        elif t == "partner":
            m = next((x for x in firm.get("partners", []) if x["name"] == v), {"name": v or "", "mno": ""})
            base["partner_name"], base["partner_mno"] = m["name"], m.get("mno", "")
        elif t == "director":
            m = next((x for x in p.get("directors", []) if x["name"] == v), {"name": v or ""})
            pre = k + "_"
            base[k] = m["name"]; base[pre + "din"] = m.get("din", ""); base[pre + "address"] = m.get("address", "")
    return base, raw


# ------------------------------------------------------------------ rendering
def _dyn_value(name, fmtname, flt, base, raw):
    v = base.get(name, "")
    if fmtname and name in raw: v = fmt_date(raw[name], fmtname)
    return apply_filter(str(v), flt)


def _para_text(p):
    return "".join(t.text or "" for t in p.iter(q("t")))


def _replace_tokens(p, base, raw):
    txt = _para_text(p)
    if "{{" not in txt: return
    for m in sorted(set(TOKEN.findall(txt)), key=lambda x: -len(x[0])):
        name, fm, flt = m
        if name.startswith("@"): continue
        tok = re.compile(r"\{\{\s*" + re.escape(name) + (r":" + fm if fm else "") + (r"\|" + flt if flt else "") + r"\s*\}\}")
        sub_paragraph(p, [(tok, "\ue000" + _dyn_value(name, fm, flt, base, raw))])
    # \ue000 marks values that may contain line breaks
    for t in list(p.iter(q("t"))):
        if t.text and "\ue000" in t.text:
            t.text = t.text.replace("\ue000", "")
            if "\n" in t.text:
                parts = t.text.split("\n"); r = t.getparent(); t.text = parts[0]
                ppr = p.find("w:pPr", NS)
                if ppr is None: ppr = etree.Element(q("pPr")); p.insert(0, ppr)
                jc = ppr.find("w:jc", NS)
                if jc is None: jc = etree.SubElement(ppr, q("jc"))
                if jc.get(q("val")) in ("both", "distribute"): jc.set(q("val"), "left")      # justified + line breaks stretches words
                prev = t
                for part in parts[1:]:
                    br = etree.Element(q("br")); nt = etree.Element(q("t")); nt.text = part; nt.set(XSP, "preserve")
                    prev.addnext(br); br.addnext(nt); prev = nt


def _clause_para(proto, title, text):
    """Clone a prototype paragraph; optional bold lead-in ('Title: text') keeping the prototype's run formatting."""
    p = copy.deepcopy(proto)
    runs = [r for r in p.findall("w:r", NS) if r.find("w:t", NS) is not None]
    rpr_src = runs[0].find("w:rPr", NS) if runs else None
    for r in p.findall("w:r", NS): p.remove(r)
    def add(txt, bold):
        r = etree.SubElement(p, q("r"))
        rp = copy.deepcopy(rpr_src) if rpr_src is not None else etree.Element(q("rPr"))
        for b in rp.findall("w:b", NS) + rp.findall("w:bCs", NS): rp.remove(b)
        if bold: etree.SubElement(rp, q("b"))
        r.append(rp)
        for li, line in enumerate(txt.split("\n")):
            if li: etree.SubElement(r, q("br"))
            t = etree.SubElement(r, q("t")); t.text = line; t.set(XSP, "preserve")
    if title: add(title.rstrip(": ") + ": ", True)
    add(text, False)
    return p


def _make_table(rows, widths=(6200, 2400)):
    """Simple bordered 2-column table: rows = [(label, amount, style)] style in '', 'bold', 'head'."""
    tbl = etree.Element(q("tbl"))
    pr = etree.SubElement(tbl, q("tblPr"))
    etree.SubElement(pr, q("tblW")).attrib.update({q("w"): str(sum(widths)), q("type"): "dxa"})
    b = etree.SubElement(pr, q("tblBorders"))
    for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
        etree.SubElement(b, q(side)).attrib.update({q("val"): "single", q("sz"): "4", q("space"): "0", q("color"): "000000"})
    grid = etree.SubElement(tbl, q("tblGrid"))
    for w in widths: etree.SubElement(grid, q("gridCol")).set(q("w"), str(w))
    for label, amt, style in rows:
        tr = etree.SubElement(tbl, q("tr"))
        for i, txt in enumerate((label, amt)):
            tc = etree.SubElement(tr, q("tc"))
            tp = etree.SubElement(tc, q("tcPr")); etree.SubElement(tp, q("tcW")).attrib.update({q("w"): str(widths[i]), q("type"): "dxa"})
            if style == "head":
                etree.SubElement(tp, q("shd")).attrib.update({q("val"): "clear", q("color"): "auto", q("fill"): "D9D9D9"})
            p = etree.SubElement(tc, q("p"))
            if i == 1:
                pp = etree.SubElement(p, q("pPr")); etree.SubElement(pp, q("jc")).set(q("val"), "right")
            r = etree.SubElement(p, q("r"))
            if style in ("bold", "head"):
                rp = etree.SubElement(r, q("rPr")); etree.SubElement(rp, q("b"))
            t = etree.SubElement(r, q("t")); t.text = txt; t.set(XSP, "preserve")
    return tbl


def _fill_repeat(tbl, row_idx, items, cols, tail=0):
    """Clone the prototype row once per item; cols = functions item,i -> text per column."""
    rows = tbl.findall("w:tr", NS)
    proto = rows[row_idx]
    for r in rows[row_idx + 1: len(rows) - tail]: tbl.remove(r)      # drop the sample's other data rows
    anchor = proto
    made = []
    for i, it in enumerate(items):
        tr = copy.deepcopy(proto)
        for tc, fn in zip(tr.findall("w:tc", NS), cols):
            set_cell_text(tc, fn(it, i))
        anchor.addnext(tr); anchor = tr; made.append(tr)
    tbl.remove(proto)
    return made


def render(tid: str, e: dict, firm: dict, vals: dict) -> bytes:
    spec = json.loads((TPL_DIR / "index.json").read_text(encoding="utf8"))[tid]
    base, raw = context(e, firm, vals, spec)
    prof = e.get("profile") or {}
    zin = zipfile.ZipFile(TPL_DIR / f"{tid}.docx")
    root = etree.fromstring(zin.read("word/document.xml"), etree.XMLParser(huge_tree=True))
    body = root.find("w:body", NS)

    # conditional blocks (marked at build time with w:bookmarkStart name 'if_<field>_<value>') -> handled by paragraph ids
    kids = list(body)
    all_tbls = body.findall("w:tbl", NS)          # resolved before deletions so repeat specs keep their original numbering
    for cond in spec.get("conditions", []):
        v = vals.get(cond["field"], cond.get("default", ""))
        hit = (not v) if cond.get("empty") else str(v) == cond["equals"]
        if hit:
            for i in cond["delete"]:
                if kids[i].getparent() is not None: body.remove(kids[i])

    # repeating tables
    for rp in spec.get("repeats", []):
        tbl = all_tbls[rp["table"]]
        if tbl.getparent() is None: continue          # table removed by a condition
        items = _items(rp["source"], prof, vals)
        if rp["source"] == "shareholders":
            tot = sum(float(x.get("shares") or 0) for x in items) or 1
            fv_tot = sum(float(x.get("shares") or 0) * float(x.get("face_value") or 0) for x in items)
            base.update({"tot_shares": inr(tot if items else 0), "tot_amount": inr(fv_tot), "tot_pct": "100.00" if items else ""})
            for x in items:
                x["_amt"] = float(x.get("shares") or 0) * float(x.get("face_value") or 0)
                x["_pct"] = f"{float(x.get('shares') or 0) * 100 / tot:.2f}"
        cols = [_colfn(c) for c in rp["cols"]]
        _fill_repeat(tbl, rp["row"], items, cols, rp.get("tail", 0))
    # total-row tokens inside tables
    for tbl in body.iter(q("tbl")):
        for p in tbl.iter(q("p")): _replace_tokens(p, base, raw)

    # clause slots ({{@clauses:name}}) – headings + ticked clauses cloned from prototype paragraphs
    protos = {}
    for p in list(body.iter(q("p"))):
        m = re.fullmatch(r"\{\{proto:(\w+)\}\}", _para_text(p).strip())
        if m: protos[m.group(1)] = copy.deepcopy(p); p.getparent().remove(p)
    sections = vals.get("clauses") or []
    style = spec.get("heading_style", "num")
    def used(slot): return [sc for sc in sections if sc.get("slot", "main") == slot and any(i.get("on") for i in sc.get("items", []))]
    n_before = sum(len(used(sl)) for sl in spec.get("slots_order", ["main"])[:1]) if style == "alpha" else 0
    base["fees_heading"] = f"{chr(65 + n_before)}. Fees Proposal"
    counter = {"n": 0}
    for p in list(body.iter(q("p"))):
        m = re.fullmatch(r"\{\{@clauses:(\w+)\}\}", _para_text(p).strip())
        if not m: continue
        slot = m.group(1); out = []
        if slot == spec.get("slots_order", ["main"])[-1] and slot != spec.get("slots_order", ["main"])[0]: counter["n"] = n_before + 1
        for sc in used(slot):
            counter["n"] += 1
            if sc.get("title") and "heading" in protos:
                lab = chr(64 + counter["n"]) if style == "alpha" else str(counter["n"])
                h = copy.deepcopy(protos["heading"]); set_para_text(h, f"{lab}. {sc['title']}" + (":" if style == "num" else "")); out.append(h)
            for it in sc["items"]:
                if it.get("on"): out.append(_clause_para(protos["clause"] if protos.get("clause") is not None else protos["heading"], it.get("title", ""), it.get("text", "")))
        for el in out: p.addprevious(el)
        p.getparent().remove(p)

    # generated tables
    for p in list(body.iter(q("p"))):
        m = re.search(r"\{\{@(\w+)\}\}", _para_text(p))
        if m:
            rows = _slot_rows(m.group(1), vals)
            p.addnext(_make_table(rows)); p.getparent().remove(p)

    for p in list(body.iter(q("p"))): _replace_tokens(p, base, raw)
    data = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zo:
        for it in zin.infolist():
            blob = zin.read(it.filename)
            if it.filename == "word/document.xml": blob = data
            elif it.filename.startswith("word/header") or it.filename.startswith("word/footer"):
                hx = etree.fromstring(blob)
                for p in hx.iter(q("p")): _replace_tokens(p, base, raw)
                blob = etree.tostring(hx, xml_declaration=True, encoding="UTF-8", standalone=True)
            zo.writestr(it, blob)
    return out.getvalue()


def _items(src, prof, vals):
    if src in ("directors", "shareholders"): return [dict(x) for x in prof.get(src, [])]
    return [dict(x) for x in vals.get(src, [])]


def _colfn(c):
    if c == "#": return lambda it, i: str(i + 1)
    if c == "_amt": return lambda it, i: inr(it.get("_amt"))
    if c == "_pct": return lambda it, i: it.get("_pct", "")
    if c == "face": return lambda it, i: f"{inr(it.get('face_value'))}/-"
    if c == "shares": return lambda it, i: inr(it.get("shares"))
    if c.endswith("@date"):
        k = c[:-5]; return lambda it, i: fmt_date(it.get(k), "dmy") or "-"
    if c.endswith("@money"):
        k = c[:-6]; return lambda it, i: (inr(it.get(k)) + "/-") if it.get(k) not in (None, "") else ""
    return lambda it, i: str(it.get(c, "") or "")


def _slot_rows(name, vals):
    A = vals.get("assets", []); L = vals.get("liabilities", [])
    ta = sum(float(x.get("amount") or 0) for x in A); tl = sum(float(x.get("amount") or 0) for x in L)
    nw = ta - tl
    if name == "nw_summary":
        return [("Particulars", "Amount (Rs.)", "head"), ("Total assets", inr(ta), ""), ("Less: total liabilities", inr(tl), ""), ("Net worth", inr(nw), "bold")]
    rows = [("A. Assets", "Amount (Rs.)", "head")] + [(x.get("particulars", ""), inr(x.get("amount")), "") for x in A] + [("Total assets (A)", inr(ta), "bold")]
    rows += [("B. Liabilities", "Amount (Rs.)", "head")] + [(x.get("particulars", ""), inr(x.get("amount")), "") for x in L] + [("Total liabilities (B)", inr(tl), "bold"), ("Net worth (A - B)", inr(nw), "bold")]
    return rows


# ------------------------------------------------------------------ catalogue / defaults
def catalogue() -> dict:
    return json.loads((TPL_DIR / "index.json").read_text(encoding="utf8"))


def _reg_city(addr: str) -> str:
    """Best-effort city from the registered office address (second-last comma part, state removed)."""
    parts = [x.strip(" .-0123456789") for x in re.split(r"[,\n]", addr or "") if x.strip(" .-0123456789")]
    return parts[-2] if len(parts) >= 2 else (parts[-1] if parts else "")


def library_default(name: str) -> list:
    return json.loads((TPL_DIR / "clauses.json").read_text(encoding="utf8")).get(name, [])


def clauses_from_library(lib: list) -> list:
    return [{"id": sc["id"], "title": sc["title"], "slot": sc.get("slot", "main"),
             "items": [{"id": it["id"], "title": it.get("title", ""), "text": it["text"], "on": bool(it.get("on"))} for it in sc["items"]]} for sc in lib]


def default_values(tid: str, e: dict, firm: dict, libs: dict | None = None) -> dict:
    spec = catalogue()[tid]
    end = date.fromisoformat(e.get("fy_end") or "2026-03-31")
    p = e.get("profile") or {}
    out = {}
    for f in spec["fields"]:
        k, t, d = f["key"], f["type"], f.get("default", "")
        if t == "clauses": out[k] = clauses_from_library((libs or {}).get(f["library"]) or library_default(f["library"]))
        elif t == "list": out[k] = []
        elif d == "today": out[k] = date.today().isoformat()
        elif d == "fy_end": out[k] = end.isoformat()
        elif d == "fy_end_next": out[k] = (end + timedelta(days=1)).isoformat()
        elif d == "firm_place": out[k] = firm.get("place", "")
        elif d == "reg_city": out[k] = _reg_city(p.get("reg_address", ""))
        elif t == "partner": out[k] = (firm.get("partners") or [{}])[0].get("name", "")
        elif t == "director": out[k] = (p.get("directors") or [{}])[0].get("name", "")
        else: out[k] = d
    return out
