import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building, FilePlus2, FileText, Files, PackagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";

export function DocumentsPage({ id }: { id: string }) {
  const qc = useQueryClient(); const nav = useNavigate();
  const eq = useQuery({ queryKey: ["engagement", id], queryFn: () => api.engagement(id) });
  const tq = useQuery({ queryKey: ["doctemplates"], queryFn: api.docTemplates });
  const dq = useQuery({ queryKey: ["docs", id], queryFn: () => api.docs(id) });
  const [busy, setBusy] = useState("");
  const [sel, setSel] = useState<number[]>([]);
  const [pack, setPack] = useState(false); const [packSel, setPackSel] = useState<string[]>([]); const [perDir, setPerDir] = useState(true);
  const pq = useQuery({ queryKey: ["pack-default"], queryFn: api.packDefault });
  const toggle = (n: number) => setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  const picked = sel.length ? sel : (dq.data ?? []).map((d) => d.id);
  async function run(fn: () => Promise<unknown>, ok?: string) { setBusy("x"); try { await fn(); if (ok) toast.success(ok); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); } }
  async function makePack() {
    setBusy("pack");
    try {
      const r = await api.makePack(id, { templates: packSel, per_director: perDir });
      await qc.invalidateQueries({ queryKey: ["docs", id] }); setPack(false); toast.success(`${r.created.length} documents created. Check each one before issue.`);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  }
  const titleOf = (t: string) => tq.data?.find((x) => x.id === t)?.title ?? t;
  const cats = [...new Set((tq.data ?? []).map((t) => t.category))];
  const profileEmpty = eq.data && !eq.data.profile?.cin && !(eq.data.profile?.directors?.length);

  async function create(tmpl: string) {
    setBusy(tmpl);
    try { const d = await api.newDoc(id, tmpl); await qc.invalidateQueries({ queryKey: ["docs", id] }); nav({ to: "/e/$id/docs/$did", params: { id, did: String(d.id) } }); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  }
  return (
    <main className="mx-auto max-w-[1200px] px-5 py-5">
      <Link to="/e/$id" params={{ id }} className="text-xs text-accent hover:underline">← Working papers</Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-semibold text-primary">Documents — {eq.data?.client_name}</h1>
          <p className="text-sm text-muted-foreground">Letters, certificates, resolutions and proposals in the firm's own format.</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setPackSel(pq.data ?? []); setPack(true); }}><PackagePlus /> Document pack</Button>
          <Button variant="outline" asChild><Link to="/e/$id/profile" params={{ id }}><Building /> Company profile</Link></Button></div>
      </div>
      {profileEmpty && <div className="mb-4 rounded-lg border border-warning/50 bg-warning-soft px-4 py-2.5 text-sm">
        Fill the <Link to="/e/$id/profile" params={{ id }} className="font-semibold underline">Company profile</Link> first (CIN, address, directors, shareholders) — documents are pre-filled from it.</div>}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">Created documents</h2>
        {(dq.data?.length ?? 0) > 0 && <>
          <span className="text-xs text-muted-foreground">{sel.length ? `${sel.length} selected` : "all documents"}</span>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(() => api.docsZip(id, "docx", picked))}><Files /> Word (zip)</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(() => api.docsZip(id, "pdf", picked))}><Files /> PDF (zip)</Button>
          <Button size="sm" variant="teal" disabled={!!busy} onClick={() => run(() => api.docsCombined(id, picked, true), "Combined PDF downloaded")}><FileText /> One combined PDF</Button></>}
      </div>
      <div className="mb-6 overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm"><tbody>
          {dq.data?.map((d) => (
            <tr key={d.id} className="border-t first:border-t-0 hover:bg-muted/40">
              <td className="w-8 px-3"><input type="checkbox" aria-label="Select document" checked={sel.includes(d.id)} onChange={() => toggle(d.id)} /></td>
              <td className="px-3 py-2"><Link to="/e/$id/docs/$did" params={{ id, did: String(d.id) }} className="font-medium hover:text-accent hover:underline"><FileText className="mr-1.5 inline h-4 w-4" />{d.title}</Link></td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{titleOf(d.tmpl)}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(d.updated).toLocaleString("en-IN")}</td>
              <td className="w-10 px-2"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={async () => { if (!confirm(`Delete "${d.title}"?`)) return; await api.delDoc(id, String(d.id)); qc.invalidateQueries({ queryKey: ["docs", id] }); }}><Trash2 className="h-4 w-4" /></Button></td>
            </tr>))}
          {dq.data?.length === 0 && <tr><td className="px-3 py-6 text-center text-muted-foreground">Nothing yet — pick a template below.</td></tr>}
        </tbody></table>
      </div>

      <h2 className="mb-2 font-semibold">New document</h2>
      {cats.map((c) => (
        <div key={c} className="mb-4">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c}</div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tq.data?.filter((t) => t.category === c).map((t) => (
              <div key={t.id} className="flex flex-col rounded-lg border bg-card p-3">
                <div className="font-medium text-primary">{t.title}</div>
                <p className="mb-3 mt-1 flex-1 text-xs text-muted-foreground">{t.description}</p>
                <Button size="sm" variant="outline" disabled={busy === t.id} onClick={() => create(t.id)}><FilePlus2 /> Create</Button>
              </div>))}
          </div>
        </div>))}
      <Dialog open={pack} onOpenChange={setPack}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Document pack</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Creates the chosen documents for {eq.data?.client_name} in one go, pre-filled from the Company profile and Firm settings.</p>
          <div className="max-h-72 space-y-1 overflow-auto rounded-md border p-2">
            {tq.data?.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={packSel.includes(t.id)} onChange={(e) => setPackSel((s) => e.target.checked ? [...s, t.id] : s.filter((x) => x !== t.id))} />{t.title}</label>))}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={perDir} onChange={(e) => setPerDir(e.target.checked)} /> Also create one MBP-1 / DIR-8 for every director in the Company profile</label>
          <DialogFooter><Button variant="outline" onClick={() => setPack(false)}>Cancel</Button><Button onClick={makePack} disabled={busy === "pack" || (!packSel.length && !perDir)}>Create documents</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
