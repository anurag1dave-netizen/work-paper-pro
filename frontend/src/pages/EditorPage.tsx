import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ChevronsDown, FileDown, FileText, LockOpen, Save, Stamp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { PaperBlocks, initialOverrides } from "@/components/PaperBlocks";
import { ReopenDialog, SignoffDialog } from "@/components/SignoffDialog";
import { api, errMsg } from "@/lib/api";
import { PLACEHOLDER_RE, nextStage } from "@/lib/types";

export function EditorPage({ id, wpId }: { id: string; wpId: string }) {
  const qc = useQueryClient();
  const eq = useQuery({ queryKey: ["engagement", id], queryFn: () => api.engagement(id) });
  const wq = useQuery({ queryKey: ["wp", id, wpId], queryFn: () => api.wp(id, wpId), refetchOnWindowFocus: false, gcTime: 0 });
  const data = wq.data;

  const paperRef = useRef<HTMLDivElement>(null);
  const overrides = useRef<Record<string, string>>({});
  const dirtyRef = useRef(false);
  const [dirty, setDirtyState] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phCount, setPhCount] = useState(0);
  const [signOpen, setSignOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const scanTimer = useRef<number | undefined>(undefined);

  const setDirty = (v: boolean) => { dirtyRef.current = v; setDirtyState(v); };
  const scan = useCallback(() => { const el = paperRef.current; if (el) setPhCount(el.querySelectorAll("[data-key].ph").length); }, []);

  useEffect(() => {
    if (!data) return;
    overrides.current = initialOverrides(data.blocks);
    setDirty(false);
    requestAnimationFrame(scan);
  }, [data, scan]);

  const onInput = useCallback((ev: React.FormEvent<HTMLDivElement>) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-key]");
    if (!el) return;
    const txt = el.textContent ?? "";
    overrides.current[el.dataset.key!] = txt;
    el.classList.add("wp-edited");
    el.classList.toggle("ph", PLACEHOLDER_RE.test(txt));
    el.classList.toggle("empty", txt.trim() === "");
    if (!dirtyRef.current) setDirty(true);
    window.clearTimeout(scanTimer.current);
    scanTimer.current = window.setTimeout(scan, 250);
  }, [scan]);

  const save = useCallback(async (quiet = false) => {
    if (!data || data.locked) return true;
    setSaving(true);
    try {
      await api.saveWp(id, wpId, { ...overrides.current });
      setDirty(false);
      if (!quiet) toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["progress", id] });
      qc.invalidateQueries({ queryKey: ["engagements"] });
      return true;
    } catch (e) { toast.error(errMsg(e)); return false; } finally { setSaving(false); }
  }, [data, id, wpId, qc]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } };
    window.addEventListener("keydown", k);
    const t = window.setInterval(() => { if (dirtyRef.current) save(true); }, 30000);
    return () => { window.removeEventListener("keydown", k); window.clearInterval(t); };
  }, [save]);

  useBlocker({
    shouldBlockFn: () => dirtyRef.current && !window.confirm("You have unsaved changes. Leave anyway?"),
    enableBeforeUnload: () => dirtyRef.current,
  });

  const nextPlaceholder = () => {
    const el = paperRef.current;
    if (!el) return;
    const list = [...el.querySelectorAll<HTMLElement>("[data-key].ph")];
    if (!list.length) return toast.info("No placeholders left");
    const active = document.activeElement as HTMLElement | null;
    const idx = active ? list.indexOf(active) : -1;
    const target = list[(idx + 1) % list.length] ?? list[0]!;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.focus({ preventScroll: true });
    window.getSelection()?.selectAllChildren(target);
  };

  const reload = async () => {
    await qc.invalidateQueries({ queryKey: ["wp", id, wpId] });
    qc.invalidateQueries({ queryKey: ["progress", id] });
    qc.invalidateQueries({ queryKey: ["engagements"] });
  };

  const exportAs = async (format: "docx" | "pdf") => {
    if (dirtyRef.current && !(await save(true))) return;
    try { await api.exportWp(id, wpId, format); } catch (e) { toast.error(errMsg(e)); }
  };

  if (wq.error) return <main className="p-8 text-destructive">{(wq.error as Error).message}</main>;
  if (!data) return <main className="p-8 text-muted-foreground">Loading working paper…</main>;

  const stage = nextStage(data.status);
  const signLabel = stage === "approved" ? "Approve" : stage ? `Sign off as ${stage}` : null;

  return (
    <div>
      <div className="sticky top-0 z-20 border-b bg-card/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-5 py-2">
          <Button variant="ghost" size="sm" asChild><Link to="/e/$id" params={{ id }}><ArrowLeft /> Back to index</Link></Button>
          <div className="min-w-0 truncate font-semibold text-primary">{data.wp.code} {data.wp.title}</div>
          <StatusBadge status={data.status} />
          {phCount > 0 ? (
            <span className="rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-status-draft">{phCount} placeholders to complete</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> no placeholders left</span>
          )}
          <span className={`text-xs ${dirty ? "text-status-draft" : "text-muted-foreground"}`}>{saving ? "saving…" : dirty ? "● unsaved" : "saved"}</span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" onClick={nextPlaceholder}><ChevronsDown /> Next placeholder</Button>
            {!data.locked && <Button size="sm" onClick={() => save()} disabled={saving}><Save /> Save</Button>}
            {signLabel && (
              <Button variant="success" size="sm" onClick={async () => {
                if (data.status === "not_started" || dirtyRef.current) { if (!(await save(true))) return; }
                setSignOpen(true);
              }}><Stamp /> {signLabel}</Button>
            )}
            {data.locked && <Button variant="destructive" size="sm" onClick={() => setReopenOpen(true)}><LockOpen /> Re-open</Button>}
            <Button variant="outline" size="sm" onClick={() => exportAs("docx")}><FileText /> Word</Button>
            <Button variant="outline" size="sm" onClick={() => exportAs("pdf")}><FileDown /> PDF</Button>
          </div>
        </div>
      </div>

      <div className="px-4 py-6">
        {data.locked && (
          <div className="mx-auto mb-4 max-w-[900px] rounded-lg border border-status-prepared/40 bg-status-prepared/10 px-4 py-2.5 text-sm text-status-prepared">
            This working paper is {data.status} and locked. Re-open it (with a reason) to make changes; earlier sign-offs will be cleared and logged.
          </div>
        )}
        <div ref={paperRef} onInput={onInput} className="paper mx-auto min-h-[1100px] max-w-[900px] rounded-sm px-14 py-12">
          <PaperBlocks key={wq.dataUpdatedAt} data={data} locked={data.locked} />
        </div>
      </div>

      {stage && (
        <SignoffDialog open={signOpen} onOpenChange={setSignOpen} stage={stage} team={eq.data?.team ?? []} placeholders={phCount}
          onConfirm={async (b) => {
            try { await api.signoff(id, wpId, { stage, ...b }); toast.success(stage === "approved" ? "Approved" : `Signed off as ${stage}`); await reload(); }
            catch (e) { toast.error(errMsg(e)); throw e; }
          }} />
      )}
      <ReopenDialog open={reopenOpen} onOpenChange={setReopenOpen}
        onConfirm={async (reason) => {
          try { await api.reopen(id, wpId, reason); toast.success("Working paper re-opened"); await reload(); }
          catch (e) { toast.error(errMsg(e)); throw e; }
        }} />
    </div>
  );
}
