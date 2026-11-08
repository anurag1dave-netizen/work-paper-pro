"""Fill engine: takes an ICAI working-paper slice (.docx) and writes values into it while
keeping the ICAI formatting (styles, tables, numbering, headers/footers) untouched."""
import copy, io, re, zipfile
from datetime import date
from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}
XSP = "{http://www.w3.org/XML/1998/namespace}space"
def q(t): return f"{{{W}}}{t}"

# text that still looks like a template placeholder
PH = re.compile(r"\b2[xX]{2}\d?\b|\b20[xX]{2}\b|\bXYZ\b|\bABC\b|…{2,}|\.{6,}|_{3,}|\{[^}]*\}")


# ---------------------------------------------------------------- variables / rules
def derive(e: dict) -> dict:
    end = date.fromisoformat(e.get("fy_end") or "2026-03-31")
    prev = date(end.year - 1, end.month, min(end.day, 28 if end.month == 2 else end.day))
    lng = lambda d: f"{d:%B} {d.day}, {d.year}"
    return {"client": (e.get("client_name") or "").strip(), "firm": (e.get("firm_name") or "").strip(),
            "end_long": lng(end), "prev_long": lng(prev), "end_year": str(end.year), "prev_year": str(prev.year),
            "fy_label": f"{end.year - 1}-{str(end.year)[2:]}" if end.month <= 3 else f"{end.year}-{str(end.year + 1)[2:]}",
            "task": (e.get("task") or "Statutory Audit").strip()}


def rules_for(v: dict):
    r = []
    if v["client"]:
        r.append((re.compile(r"XYZ\s+Company(?:\s+(?:Private|Pvt\.?)\s+(?:Limited|Ltd\.?))?", re.I), v["client"]))
    if v["client"]:
        r.append((re.compile(r"ABC\s+Company(?:\s+(?:Private|Pvt\.?)\s+(?:Limited|Ltd\.?))?", re.I), v["client"]))
    if v["firm"]:
        r.append((re.compile(r"ABC\s*&\s*Associates(?:\s+LLP)?"), v["firm"]))
    r += [(re.compile(r"FY\s*2xx3"), f"FY {v['fy_label']}"),
          (re.compile(r"March\s+31,\s*2xx3"), v["end_long"]),
          (re.compile(r"March\s+31,\s*2xx2"), v["prev_long"]),
          (re.compile(r"\b2xx3\b"), v["end_year"]),
          (re.compile(r"\b2xx2\b"), v["prev_year"])]
    return r


def apply_rules(text: str, rules) -> str:
    for rx, rep in rules: text = rx.sub(lambda m, rep=rep: rep, text)
    return text


# ---------------------------------------------------------------- low level helpers
def ptext(p):
    out = []
    for r in p.findall("w:r", NS):
        for ch in r:
            if ch.tag == q("t"): out.append(ch.text or "")
            elif ch.tag == q("tab"): out.append("\t")
            elif ch.tag == q("br") and ch.get(q("type")) in (None, "textWrapping"): out.append("\n")
    return "".join(out)


def _gfx(el): return bool(el.xpath(".//w:drawing|.//w:pict|.//w:object", namespaces=NS))


def set_para_text(p, text: str):
    runs = p.findall("w:r", NS)
    textruns = [r for r in runs if any(c.tag in (q("t"), q("tab"), q("br")) for c in r) and not _gfx(r)]
    if textruns:
        target = textruns[0]
        for r in textruns[1:]: p.remove(r)
        for c in list(target):
            if c.tag != q("rPr"): target.remove(c)
    else:
        target = etree.SubElement(p, q("r"))
        mark = p.find("w:pPr/w:rPr", NS)
        if mark is not None:
            rp = copy.deepcopy(mark)
            for t in rp.xpath("./w:ins|./w:del", namespaces=NS): rp.remove(t)
            target.insert(0, rp)
    for li, line in enumerate(text.split("\n")):
        if li: etree.SubElement(target, q("br"))
        for pi, part in enumerate(line.split("\t")):
            if pi: etree.SubElement(target, q("tab"))
            if part:
                t = etree.SubElement(target, q("t")); t.text = part; t.set(XSP, "preserve")


def sub_paragraph(p, rules):
    """Regex-substitute inside a paragraph preserving run formatting (placeholders may span runs)."""
    ts = [t for r in p.findall("w:r", NS) for t in r.findall("w:t", NS)]
    if not ts: return False
    changed = False
    for rx, rep in rules:
        s = "".join(t.text or "" for t in ts)
        ms = list(rx.finditer(s))
        for m in reversed(ms):
            a, b = m.start(), m.end()
            off = 0
            first = last = None
            for i, t in enumerate(ts):
                L = len(t.text or "")
                if first is None and a < off + L: first = (i, off)
                if b <= off + L: last = (i, off); break
                off += L
            if first is None or last is None: continue
            (fi, fo), (li, lo) = first, last
            if fi == li:
                t = ts[fi]; t.text = t.text[:a - fo] + rep + t.text[b - fo:]; t.set(XSP, "preserve")
            else:
                f, l = ts[fi], ts[li]
                f.text = f.text[:a - fo] + rep; f.set(XSP, "preserve")
                for k in range(fi + 1, li): ts[k].text = ""
                l.text = l.text[b - lo:]; l.set(XSP, "preserve")
            changed = True
    return changed


def _clone_para(p):
    """Copy a paragraph for an extra line: drop ids, bookmarks and graphics so the file stays valid in Word."""
    c = copy.deepcopy(p)
    for a in list(c.attrib):
        if a.endswith("paraId") or a.endswith("textId"): del c.attrib[a]
    for el in c.xpath(".//w:bookmarkStart|.//w:bookmarkEnd", namespaces=NS): el.getparent().remove(el)
    for r in c.findall("w:r", NS):
        if _gfx(r): c.remove(r)
    return c


def set_cell_text(tc, text: str):
    paras = tc.findall("w:p", NS)
    lines = text.split("\n")
    if not paras:
        paras = [etree.SubElement(tc, q("p"))]
    for i, line in enumerate(lines):
        if i < len(paras):
            set_para_text(paras[i], line)
        else:
            newp = _clone_para(paras[-1])
            set_para_text(newp, line)
            paras[-1].addnext(newp); paras.append(newp)
    for extra in paras[len(lines):]:
        if len(tc.findall("w:p", NS)) > 1 and not _gfx(extra): tc.remove(extra)


# ---------------------------------------------------------------- views
def resolve(blocks, rules, overrides):
    """-> dict key -> (raw, final, overridden)"""
    out = {}
    for b in blocks:
        if b["k"] == "p":
            k = f"p{b['i']}"
            raw = b["text"]
            out[k] = (raw, overrides[k], True) if k in overrides else (raw, apply_rules(raw, rules), False)
        elif b["k"] == "t":
            for r in b["rows"]:
                for c in r["cells"]:
                    k = f"c{b['i']}.{r['r']}.{c['c']}"
                    raw = c["text"]
                    out[k] = (raw, overrides[k], True) if k in overrides and not c["ro"] else (raw, apply_rules(raw, rules), False)
    return out


def view(blocks, rules, overrides):
    res = resolve(blocks, rules, overrides)
    out, ph = [], 0
    for b in blocks:
        if b["k"] == "p":
            raw, fin, ov = res[f"p{b['i']}"]
            nb = dict(b)
            if fin != raw: nb["v"] = fin
            if ov: nb["ov"] = True
            if b["i"] != 0: ph += len(PH.findall(fin))
            out.append(nb)
        elif b["k"] == "t":
            rows = []
            for r in b["rows"]:
                cells = []
                for c in r["cells"]:
                    raw, fin, ov = res[f"c{b['i']}.{r['r']}.{c['c']}"]
                    nc = dict(c)
                    if fin != raw: nc["v"] = fin
                    if ov: nc["ov"] = True
                    if b["i"] != 0: ph += len(PH.findall(fin))
                    cells.append(nc)
                rows.append({"r": r["r"], "cells": cells})
            out.append({**b, "rows": rows})
        else:
            out.append(b)
    return out, ph


def count_placeholders(blocks, rules, overrides):
    res = resolve(blocks, rules, overrides)
    n = 0
    for k, (raw, fin, ov) in res.items():
        if k.startswith("c0."): continue      # block 0 = ICAI header table (auto-filled)
        n += len(PH.findall(fin))
    return n


# ---------------------------------------------------------------- generation
def _widen_name_cols(tbl):
    """ICAI's Name/Initial columns are only ~1.3 cm so names wrap letter by letter; widen them
    (taking the space from the title column) and make grid + cell widths agree."""
    grid = tbl.find("w:tblGrid", NS)
    trs = tbl.findall("w:tr", NS)
    if grid is None or len(grid) != 5 or not trs: return
    g = [int(c.get(q("w"))) for c in grid]
    total = sum(g)
    c2 = max(g[2], 1350)
    c3 = c4 = 1450
    c1 = total - g[0] - c2 - c3 - c4
    if c1 < 2500: return
    new = [g[0], c1, c2, c3, c4]
    for c, w in zip(grid, new): c.set(q("w"), str(w))
    for tr in trs:
        tcs = tr.findall("w:tc", NS)
        if len(tcs) != 5: continue
        for tc, w in zip(tcs, new):
            tcw = tc.find("w:tcPr/w:tcW", NS)
            if tcw is None: continue
            if tcw.get(q("type")) == "pct": tcw.set(q("w"), str(round(w / total * 5000)))
            else: tcw.set(q("w"), str(w))


def _fill_header(tbl, info):
    if any(k in info for k in ("Prepared", "Reviewed", "Approved")): _widen_name_cols(tbl)
    for tr in tbl.findall("w:tr", NS):
        tcs = tr.findall("w:tc", NS)
        if len(tcs) < 2: continue
        label = "".join(ptext(p) for p in tcs[0].findall("w:p", NS)).strip().lower()
        if label == "the client" and info.get("client"): set_cell_text(tcs[1], info["client"])
        elif label == "period" and info.get("period"): set_cell_text(tcs[1], info["period"])
        elif label == "task" and info.get("task"): set_cell_text(tcs[1], info["task"])
        if len(tcs) >= 5:
            stage = "".join(ptext(p) for p in tcs[2].findall("w:p", NS)).strip()
            if stage in ("Prepared", "Reviewed", "Approved"):
                nm, ini = info.get(stage, (None, None))
                if nm: set_cell_text(tcs[3], nm)
                if ini: set_cell_text(tcs[4], ini)


def generate(unit_path, blocks, rules, overrides, header_info, header_text=None) -> bytes:
    zin = zipfile.ZipFile(unit_path)
    root = etree.fromstring(zin.read("word/document.xml"), etree.XMLParser(huge_tree=True))
    body = root.find("w:body", NS)
    kids = list(body)[:-1]
    res = resolve(blocks, rules, overrides)
    done = set()
    # 1) manual overrides
    for k, (raw, fin, ov) in res.items():
        if not ov: continue
        parts = k[1:].split(".")
        el = kids[int(parts[0])]
        if k[0] == "p":
            set_para_text(el, fin); done.add(el)
        else:
            tc = el.findall("w:tr", NS)[int(parts[1])].findall("w:tc", NS)[int(parts[2])]
            set_cell_text(tc, fin)
            done.update(tc.findall("w:p", NS))
    # 2) automatic substitutions everywhere (client name, firm, FY...)
    for p in body.iter(q("p")):
        if p not in done: sub_paragraph(p, rules)
    # 3) header block (client / period / sign-off boxes)
    if kids and kids[0].tag == q("tbl"): _fill_header(kids[0], header_info)
    data = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zo:
        for it in zin.infolist():
            blob = zin.read(it.filename)
            if it.filename == "word/document.xml": blob = data
            elif header_text and it.filename.startswith("word/header"):
                blob = blob.decode("utf8").replace(">Audit Working Paper Templates<", f">{_esc(header_text)}<").encode("utf8")
            zo.writestr(it, blob)
    return out.getvalue()


def _esc(s): return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
