import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eraser, Eye, FileDown, FileText, Mail, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClauseEditor } from "@/components/ClauseEditor";
import { api, errMsg } from "@/lib/api";
import type { DocField } from "@/lib/types";

export function DocEditorPage({ id, did }: { id: string; did: string }) {
  const qc = useQueryClient();
  const eq = useQuery({ queryKey: ["engagement", id], queryFn: () => api.engagement(id) });
  const fq = useQuery({ queryKey: ["firm"], queryFn: api.firm });
  const tq = useQuery({ queryKey: ["doctemplates"], queryFn: api.docTemplates });
  const dq = useQuery({ queryKey: ["doc", id, did], queryFn: () => api.doc(id, did), gcTime: 0 });
  const [vals, setVals] = useState<Record<string, any>>({});
  const [title, setTitle] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pvKey, setPvKey] = useState(0);
  const peq = useQuery({ queryKey: ["pdf-engine"], queryFn: api.pdfEngine });
  useEffect(() => { if (dq.data) { setVals(dq.data.vals); setTitle(dq.data.title); setDirty(false); } }, [dq.data]);
  const tpl = tq.data?.find((t) => t.id === dq.data?.tmpl);
  const set = (k: string, v: any) => { setVals((x) => ({ ...x, [k]: v })); setDirty(true); };
  const directors = useMemo(() => (eq.data?.profile?.directors ?? []).map((d) => d.name), [eq.data]);
  const partners = (fq.data?.partners ?? []).map((p) => p.name);

  async function save(quiet = false) {
    setBusy(true);
    try { await api.saveDoc(id, did, vals, title); setDirty(false); if (!quiet) toast.success("Saved"); qc.invalidateQueries({ queryKey: ["docs", id] }); return true; }
    catch (e) { toast.error(errMsg(e)); return false; } finally { setBusy(false); }
  }
  function clearAll() {
    if (!tpl || !window.confirm("Clear all the fields in this document? Ticked clauses are kept.")) return;
    const v: Record<string, any> = {};
    for (const f of tpl.fields) v[f.key] = f.type === "clauses" ? vals[f.key] : f.type === "list" ? [] : "";
    setVals(v); setDirty(true);
  }
  // warns if "---------" blanks are still in the finished document
  async function preIssueOk() {
    try {
      const c = await api.checkDoc(id, did);
      if (c.blanks > 0) return window.confirm(`${c.blanks} blank(s) "---------" are still in this document:\n\n• ${c.where.join("\n• ")}\n\nExport anyway?`);
    } catch { /* export will report the problem */ }
    return true;
  }
  async function exp(f: "docx" | "pdf") {
    if (!(await save(true)) || !(await preIssueOk())) return;
    setBusy(true);
    try { await api.exportDoc(id, did, f); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function email() {
    if (!(await save(true)) || !(await preIssueOk())) return;
    setBusy(true);
    try {
      await api.exportDoc(id, did, "docx");
      const c = eq.data?.client_name ?? "";
      const subj = encodeURIComponent(`${title}${c ? " - " + c : ""}`);
      const body = encodeURIComponent(`Dear Sir/Madam,\n\nPlease find attached the ${title}${c ? " for " + c : ""}.\n\nKindly acknowledge receipt.\n\nRegards,\n${fq.data?.name ?? ""}`);
      toast.success("Document saved to your Downloads folder. Attach it to the email that opens.");
      window.location.href = `mailto:?subject=${subj}&body=${body}`;
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function refreshPreview() { if (await save(true)) setPvKey((k) => k + 1); }
  if (dq.error) return <main className="p-8 text-destructive">{(dq.error as Error).message}</main>;
  if (tq.data && dq.data && !tpl) return <main className="p-8 text-destructive">This document was made from a template that is no longer available. <Link to="/e/$id/docs" params={{ id }} className="underline">Back to documents</Link></main>;
  if (!tpl || !dq.data) return <main className="p-8 text-muted-foreground">Loading…</main>;

  const renderField = (f: DocField, v: any, onChange: (v: any) => void, compact = false) => {
    const cls = compact ? "h-8" : "";
    if (f.type === "textarea") return <Textarea rows={3} value={v ?? ""} onChange={(e) => onChange(e.target.value)} />;
    if (f.type === "date") return <Input className={cls} type="date" value={v ?? ""} onChange={(e) => onChange(e.target.value)} />;
    if (f.type === "money") return <Input className={cls} inputMode="decimal" value={v ?? ""} onChange={(e) => onChange(e.target.value.replace(/[^\d.\-]/g, ""))} />;
    if (f.type === "partner" || f.type === "director" || f.type === "select") {
      const opts = f.type === "partner" ? partners : f.type === "director" ? directors : f.options ?? [];
      if (f.type === "director" && opts.length === 0) return <p className="text-sm text-destructive">Add directors in the Company profile first.</p>;
      if (f.type === "partner" && opts.length === 0) return <p className="text-sm text-destructive">Add partners in <Link to="/firm" className="underline">Firm settings</Link> first.</p>;
      return (
        <Select value={v ?? ""} onValueChange={onChange}>
          <SelectTrigger className={cls}><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent>{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>);
    }
    return <Input className={cls} placeholder={f.placeholder} value={v ?? ""} onChange={(e) => onChange(e.target.value)} />;
  };

  return (
    <div>
      <div className="sticky top-0 z-20 border-b bg-card/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-2 px-5 py-2">
          <Button variant="ghost" size="sm" asChild><Link to="/e/$id/docs" params={{ id }}>← Documents</Link></Button>
          <div className="min-w-0 truncate font-semibold text-primary">{tpl.title}</div>
          <span className={`text-xs ${dirty ? "text-status-draft" : "text-muted-foreground"}`}>{dirty ? "● unsaved" : "saved"}</span>
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={clearAll} disabled={busy}><Eraser /> Clear fields</Button>
            <Button size="sm" onClick={() => save()} disabled={busy}><Save /> Save</Button>
            <Button size="sm" variant={preview ? "default" : "outline"} onClick={() => { setPreview((v) => !v); if (!preview) refreshPreview(); }}><Eye /> Preview</Button>
            <Button size="sm" variant="outline" onClick={email} disabled={busy}><Mail /> Email</Button>
            <Button size="sm" variant="teal" onClick={() => exp("docx")} disabled={busy}><FileText /> Word</Button>
            <Button size="sm" variant="outline" onClick={() => exp("pdf")} disabled={busy}><FileDown /> PDF</Button>
          </div>
        </div>
      </div>
      <div className="flex items-start">
      <main className="mx-auto w-full min-w-0 max-w-[1100px] flex-1 px-5 py-5">
        <p className="mb-4 text-sm text-muted-foreground">{tpl.description} Company, firm and period details are filled automatically from the engagement, Company profile and Firm settings.</p>
        <div className="mb-4 rounded-lg border bg-card p-4"><div className="space-y-1"><Label>Document name</Label><Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} /></div></div>
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4">
          {tpl.fields.filter((f) => f.type !== "list" && f.type !== "clauses").map((f) => (
            <div key={f.key} className={`space-y-1 ${f.type === "textarea" ? "col-span-2" : ""}`}><Label>{f.label}</Label>{renderField(f, vals[f.key], (v) => set(f.key, v))}</div>))}
        </div>
        {tpl.fields.filter((f) => f.type === "clauses").map((f) => (
          <div key={f.key} className="mt-4">
            <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">{f.label}</h2>
              <Button size="sm" variant="outline" onClick={async () => { if (!window.confirm("Replace the clauses in this document with the current clause library?")) return; try { const lib = await api.clauses(); set(f.key, (lib as any)[f.library ?? "mrl"]); toast.success("Reloaded from the library"); } catch (e) { toast.error(errMsg(e)); } }}><RotateCcw /> Reload from library</Button></div>
            <p className="mb-2 text-xs text-muted-foreground">Tick the clauses that apply to this client and edit the wording. Changes here affect only this document; edit the master wording under Clause library.</p>
            <ClauseEditor sections={vals[f.key] ?? []} onChange={(s) => set(f.key, s)} />
          </div>))}
        {tpl.fields.filter((f) => f.type === "list").map((f) => {
          const rows: any[] = vals[f.key] ?? [];
          const cols = f.columns ?? [];
          return (
            <div key={f.key} className="mt-4 rounded-lg border bg-card p-4">
              <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">{f.label}</h2>
                <Button size="sm" variant="outline" onClick={() => set(f.key, [...rows, {}])}><Plus /> Add row</Button></div>
              <table className="w-full text-sm"><thead><tr>{cols.map((c) => <th key={c.key} className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">{c.label}</th>)}<th className="w-10" /></tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    {cols.map((c) => <td key={c.key} className="p-1">{renderField(c, r[c.key], (v) => set(f.key, rows.map((x, j) => (j === i ? { ...x, [c.key]: v } : x))), true)}</td>)}
                    <td className="p-1"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => set(f.key, rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></td>
                  </tr>))}</tbody></table>
              {rows.length === 0 && <p className="py-3 text-sm text-muted-foreground">No rows yet.</p>}
            </div>);
        })}
      </main>
      {preview && (
        <aside className="sticky top-[49px] h-[calc(100vh-49px)] w-[46%] shrink-0 border-l bg-muted">
          <div className="flex items-center justify-between border-b bg-card px-3 py-1.5 text-xs"><span className="font-semibold text-primary">Preview (as it will print)</span>
            <Button size="sm" variant="ghost" onClick={refreshPreview} disabled={busy}><RotateCcw /> Refresh</Button></div>
          {peq.data && !peq.data.engine
            ? <p className="p-4 text-sm text-muted-foreground">Preview needs LibreOffice (free) or Microsoft Word on this computer. You can still export to Word.</p>
            : pvKey === 0 ? <p className="p-4 text-sm text-muted-foreground">Preparing preview…</p>
            : <iframe key={pvKey} title="Preview" className="h-[calc(100%-33px)] w-full" src={`/api/engagements/${id}/docs/${did}/preview?t=${pvKey}#view=FitH`} />}
        </aside>)}
      </div>
    </div>
  );
}
