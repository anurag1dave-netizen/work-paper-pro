import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ClauseEditor } from "@/components/ClauseEditor";
import { api, errMsg } from "@/lib/api";
import type { ClauseLib } from "@/lib/types";

export function ClausesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["clauses"], queryFn: api.clauses, gcTime: 0 });
  const [lib, setLib] = useState<ClauseLib | null>(null);
  const [tab, setTab] = useState<"proposal" | "mrl">("proposal");
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (q.data) { setLib(q.data); setDirty(false); } }, [q.data]);
  if (!lib) return <main className="p-8 text-muted-foreground">Loading…</main>;
  const change = (k: "proposal" | "mrl", s: ClauseLib["mrl"]) => { setLib({ ...lib, [k]: s }); setDirty(true); };
  async function save() {
    try { const r = await api.saveClauses(lib!); setLib(r); setDirty(false); qc.invalidateQueries({ queryKey: ["clauses"] }); toast.success("Clause library saved"); }
    catch (e) { toast.error(errMsg(e)); }
  }
  async function reset() {
    if (!window.confirm("Restore the standard clauses that came with the app? Your edits to the library will be lost. Existing documents are not affected.")) return;
    try { setLib(await api.resetClauses()); setDirty(false); toast.success("Standard clauses restored"); } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <main className="mx-auto max-w-[1000px] px-5 py-5">
      <Link to="/" className="text-xs text-accent hover:underline">← All engagements</Link>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-semibold text-primary">Clause library</h1>
          <p className="text-sm text-muted-foreground">Your standard wording for proposals and management representation letters. Tick the clauses that should be on by default; each new document starts from a copy, which you can tick and edit again for that client. Changes here never alter documents already created.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={reset}><RotateCcw /> Restore standard</Button>
          <Button onClick={save} disabled={!dirty}><Save /> Save library</Button></div>
      </div>
      <div className="mb-3 flex gap-1 border-b">
        {([["proposal", "Proposal clauses"], ["mrl", "Management representation letter"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-accent font-semibold text-primary" : "border-transparent text-muted-foreground"}`}>{l}</button>))}
      </div>
      {tab === "proposal" && <p className="mb-3 text-xs text-muted-foreground">Headings get letters A, B, C… and the fee table follows automatically. Use "---------" where client-specific detail is to be filled in.</p>}
      <ClauseEditor key={tab} library sections={lib[tab]} onChange={(s) => change(tab, s)} />
    </main>
  );
}
