"""Build the working-paper catalog from the ICAI 'Audit Working Paper Templates' .docx.

Usage:  python tools/build_catalog.py "<path to ICAI template.docx>" [out_dir]

Each working paper (identified by its 'Chapter | x.y | Name | Initial' header table)
is sliced into its own .docx (original ICAI formatting retained) plus a JSON model
describing its paragraphs / tables so the UI can render a fill-in form.
"""
import io, json, re, sys, zipfile, copy
from pathlib import Path
from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
def q(t): return f"{{{W}}}{t}"
NS = {"w": W}
CHAPTERS = {"1": "Appointment", "2": "Planning", "3": "Execution",
            "4": "Other Procedures", "5": "Financial Reporting", "6": "Completion Section"}


def ptext(p):
    """Visible text of a paragraph's own runs (ignores text boxes)."""
    out = []
    for r in p.findall("w:r", NS):
        for ch in r:
            if ch.tag == q("t"): out.append(ch.text or "")
            elif ch.tag == q("tab"): out.append("\t")
            elif ch.tag == q("br") and ch.get(q("type")) in (None, "textWrapping"): out.append("\n")
    return "".join(out)


def has_graphic(el):
    return bool(el.xpath(".//w:drawing|.//w:pict|.//w:object", namespaces=NS))


def tc_paras(tc): return tc.findall("w:p", NS)
def tc_text(tc): return "\n".join(ptext(p) for p in tc_paras(tc))


def is_header_table(el):
    if el.tag != q("tbl"): return False
    rows = el.findall("w:tr", NS)
    if len(rows) < 4: return False
    cells = rows[0].findall("w:tc", NS)
    if len(cells) < 4: return False
    return tc_text(cells[0]).strip() == "Chapter" and re.match(r"^\d", tc_text(cells[1]).strip() or "x") is not None


def is_chapter_cover(el):
    return (el.tag == q("tbl") and len(el.findall("w:tr", NS)) == 1
            and re.match(r"^Chapter\s+\d\s*:", tc_text(el.find("w:tr/w:tc", NS)).strip()) is not None)


def trimmable(el):
    if el.tag == q("p"):
        if el.find("w:pPr/w:sectPr", NS) is not None: return True
        return ptext(el).strip() == "" and not has_graphic(el)
    return is_chapter_cover(el)


def grid_info(tbl):
    """Return rows -> list of cell dicts with colspan / rowspan / hidden flags."""
    rows = tbl.findall("w:tr", NS)
    layout = []  # per row: list of (tc_index, gridstart, span, vmerge)
    for tr in rows:
        pos = 0
        trpr = tr.find("w:trPr", NS)
        if trpr is not None:
            gb = trpr.find("w:gridBefore", NS)
            if gb is not None: pos += int(gb.get(q("val")) or 0)
        lr = []
        for ti, tc in enumerate(tr.findall("w:tc", NS)):
            tcpr = tc.find("w:tcPr", NS)
            span, vm = 1, None
            if tcpr is not None:
                gs = tcpr.find("w:gridSpan", NS)
                if gs is not None: span = int(gs.get(q("val")) or 1)
                v = tcpr.find("w:vMerge", NS)
                if v is not None: vm = v.get(q("val")) or "continue"
            lr.append([ti, pos, span, vm])
            pos += span
        layout.append(lr)
    # rowspans
    rs = {}
    for ri, lr in enumerate(layout):
        for ti, pos, span, vm in lr:
            if vm == "restart":
                n = 1
                for rj in range(ri + 1, len(layout)):
                    m = [c for c in layout[rj] if c[1] == pos and c[3] == "continue"]
                    if m: n += 1
                    else: break
                rs[(ri, ti)] = n
    return layout, rs


def model_for(elements):
    blocks = []
    for bi, el in enumerate(elements):
        if el.tag == q("p"):
            ppr = el.find("w:pPr", NS)
            numbered = ppr is not None and ppr.find("w:numPr", NS) is not None
            bold = any(r.find("w:rPr/w:b", NS) is not None for r in el.findall("w:r", NS)[:2])
            hl = bool(el.xpath("./w:r/w:rPr/w:highlight", namespaces=NS))
            blocks.append({"k": "p", "i": bi, "text": ptext(el), "list": numbered, "bold": bold,
                           "hl": hl, "gfx": has_graphic(el)})
        elif el.tag == q("tbl"):
            layout, rs = grid_info(el)
            rows = []
            for ri, tr in enumerate(el.findall("w:tr", NS)):
                cells = []
                tcs = tr.findall("w:tc", NS)
                for ti, pos, span, vm in layout[ri]:
                    if vm == "continue": continue
                    tc = tcs[ti]
                    nested = tc.find("w:tbl", NS) is not None
                    cells.append({"c": ti, "text": tc_text(tc), "cs": span, "rs": rs.get((ri, ti), 1),
                                  "ro": nested or has_graphic(tc), "bold": any(
                                      r.find("w:rPr/w:b", NS) is not None for p in tc_paras(tc)[:1] for r in p.findall("w:r", NS)[:1]),
                                  "shaded": tc.find("w:tcPr/w:shd", NS) is not None and
                                            (tc.find("w:tcPr/w:shd", NS).get(q("fill")) or "auto") not in ("auto", "FFFFFF")})
                rows.append({"r": ri, "cells": cells})
            ncols = max((sum(c[2] for c in lr) for lr in layout), default=1)
            blocks.append({"k": "t", "i": bi, "ncols": ncols, "rows": rows})
        else:
            blocks.append({"k": "x", "i": bi})
    return blocks


def slug(code, title, seen):
    base = re.sub(r"[^0-9a-zA-Z]+", "-", code.replace("*", "").strip()).strip("-").lower()
    if base in seen:
        suf = title.split("-")[-1].strip().lower() if "-" in title else str(seen[base] + 1)
        base = f"{base}-{re.sub(r'[^a-z0-9]+', '', suf)}"
    seen[base] = seen.get(base, 0) + 1
    return base


def main(src, out):
    out = Path(out); (out / "units").mkdir(parents=True, exist_ok=True); (out / "models").mkdir(exist_ok=True)
    zin = zipfile.ZipFile(src)
    parser = etree.XMLParser(huge_tree=True, remove_blank_text=False)
    root = etree.fromstring(zin.read("word/document.xml"), parser)
    body = root.find("w:body", NS)
    kids = list(body)
    final_sect = kids[-1]
    assert final_sect.tag == q("sectPr")
    kids = kids[:-1]
    for k in list(body): body.remove(k)          # detach: leaves a cheap, empty 'shell' to clone per unit
    shell = copy.deepcopy(root)
    heads = [i for i, e in enumerate(kids) if is_header_table(e)]
    print("working papers found:", len(heads))
    index, seen = [], {}
    for n, h in enumerate(heads):
        end = heads[n + 1] if n + 1 < len(heads) else len(kids)
        els = kids[h:end]
        while els and trimmable(els[-1]): els.pop()
        hdr = els[0]
        rows = hdr.findall("w:tr", NS)
        code = tc_text(rows[0].findall("w:tc", NS)[1]).strip()
        title = re.sub(r"\s+", " ", tc_text(rows[1].findall("w:tc", NS)[1])).strip()
        uid = slug(code, title, seen)
        # build unit document
        new_root = copy.deepcopy(shell)
        nb = new_root.find("w:body", NS)
        for e in els:
            c = copy.deepcopy(e)
            for sp in c.xpath(".//w:pPr/w:sectPr", namespaces=NS): sp.getparent().remove(sp)
            nb.append(c)
        nb.append(copy.deepcopy(final_sect))
        data = etree.tostring(new_root, xml_declaration=True, encoding="UTF-8", standalone=True)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zo:
            for item in zin.infolist():
                zo.writestr(item.filename, data if item.filename == "word/document.xml" else zin.read(item.filename))
        (out / "units" / f"{uid}.docx").write_bytes(buf.getvalue())
        blocks = model_for(list(nb)[:-1])
        (out / "models" / f"{uid}.json").write_text(json.dumps(blocks, ensure_ascii=False), encoding="utf-8")
        chap = code.strip()[0]
        ntab = sum(1 for b in blocks if b["k"] == "t")
        index.append({"id": uid, "code": code.replace("*", "").strip(), "title": title.replace("\n", " "),
                      "chapter": int(chap), "chapter_name": CHAPTERS[chap], "tables": ntab,
                      "illustrative": "*" in code, "order": n})
        print(f"{uid:12} {code:14} {title[:60]:60} blocks={len(blocks)} tables={ntab}")
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print("done ->", out)


if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "catalog")
