import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building, Check, ChevronDown, FileText, ChevronRight, Download, History, Search, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge, LABEL } from "@/components/StatusBadge";
import { EngagementDialog } from "@/components/EngagementDialog";
import { api, errMsg } from "@/lib/api";
import type { ProgressRow, Stage, WpStatus } from "@/lib/types";
import { fmtDate } from "./EngagementsPage";

const STAGES: Stage[] = ["prepared", "reviewed", "approved"];

export function DashboardPage({ id }: { id: string }) {
  const qc = useQueryClient();
  const eq = useQuery({ queryKey: ["engagement", id], queryFn: () => api.engagement(id) });
  const pq = useQuery({ queryKey: ["progress", id], queryFn: () => api.progress(id) });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | WpStatus>("all");
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [settings, setSettings] = useState(false);
  const [zipping, setZipping] = useState(false);

  const rows = pq.data ?? [];
  const stats = useMemo(() => {
    const c = { total: rows.length, started: 0, draft: 0, prepared: 0, reviewed: 0, approved: 0 };
    for (const r of rows) if (r.status !== "not_started") { c.started++; c[r.status]++; }
    return c;
  }, [rows]);

  const groups = useMemo(() => {
    const s = search.trim().toLowerCase();
    const filtered = rows.filter((r) => (status === "all" || r.status === status) && (!s || r.code.toLowerCase().includes(s) || r.title.toLowerCase().includes(s)));
    const m = new Map<number, { name: string; all: ProgressRow[]; rows: ProgressRow[] }>();
    for (const r of rows) { if (!m.has(r.chapter)) m.set(r.chapter, { name: r.chapter_name, all: [], rows: [] }); m.get(r.chapter)!.all.push(r); }
    for (const r of filtered) m.get(r.chapter)!.rows.push(r);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).filter(([, g]) => g.rows.length);
  }, [rows, search, status]);

  const e = eq.data;
  const pct = (n: number) => (stats.total ? (n / stats.total) * 100 : 0);

  return (
    <main className="mx-auto max-w-[1400px] px-5 py-5">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Link to="/" className="text-xs text-accent hover:underline">← All engagements</Link>
          <h1 className="text-xl font-semibold text-primary">{e?.client_name ?? "…"}</h1>
          {e && <p className="text-sm text-muted-foreground">{e.task} · FY ending {fmtDate(e.fy_end)} · {e.firm_name}</p>}
        </div>
        <Button variant="outline" size="sm" asChild><Link to="/e/$id/docs" params={{ id }}><FileText /> Documents</Link></Button>
        <Button variant="outline" size="sm" asChild><Link to="/e/$id/profile" params={{ id }}><Building /> Company profile</Link></Button>
        <Button variant="outline" size="sm" onClick={() => setSettings(true)} disabled={!e}><Settings /> Settings</Button>
        <Button variant="outline" size="sm" asChild><Link to="/e/$id/log" params={{ id }}><History /> Activity log</Link></Button>
        <Button variant="teal" size="sm" disabled={zipping} onClick={async () => {
          setZipping(true);
          try { await api.exportAll(id); } catch (err) { toast.error(errMsg(err)); } finally { setZipping(false); }
        }}><Download /> {zipping ? "Preparing…" : "Download all started (ZIP)"}</Button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Working papers", stats.total, "text-primary"], ["Started", stats.started, "text-accent"], ["Prepared", stats.prepared, "text-status-prepared"], ["Reviewed", stats.reviewed, "text-status-reviewed"], ["Approved", stats.approved, "text-status-approved"]].map(([l, n, c]) => (
          <div key={l as string} className="rounded-lg border bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className={`text-2xl font-semibold tabular-nums ${c}`}>{n}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="bg-status-approved" style={{ width: `${pct(stats.approved)}%` }} />
        <div className="bg-status-reviewed" style={{ width: `${pct(stats.reviewed)}%` }} />
        <div className="bg-status-prepared" style={{ width: `${pct(stats.prepared)}%` }} />
        <div className="bg-status-draft" style={{ width: `${pct(stats.draft)}%` }} />
      </div>

      <div className="mb-3 flex gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="bg-card pl-8" placeholder="Search by ref or title" value={search} onChange={(ev) => setSearch(ev.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-44 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(LABEL) as WpStatus[]).map((s) => <SelectItem key={s} value={s}>{LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {pq.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {pq.error && <p className="text-sm text-destructive">{(pq.error as Error).message}</p>}

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr><th className="w-20 px-3 py-2">Ref</th><th className="px-3 py-2">Title</th><th className="w-28 px-3 py-2">Status</th><th className="w-36 px-3 py-2">Open items</th><th className="w-36 px-3 py-2">Sign-off</th><th className="w-24 px-3 py-2" /></tr>
          </thead>
          {groups.map(([ch, g]) => {
            const open = !collapsed[ch];
            const started = g.all.filter((r) => r.status !== "not_started").length;
            return (
              <tbody key={ch}>
                <tr className="cursor-pointer border-t bg-secondary/60 hover:bg-secondary" onClick={() => setCollapsed((c) => ({ ...c, [ch]: open }))}>
                  <td colSpan={6} className="px-3 py-2 font-semibold text-primary">
                    <span className="inline-flex items-center gap-1">
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      Chapter {ch}: {g.name}
                      <span className="ml-1 font-normal text-muted-foreground">({started}/{g.all.length} started)</span>
                    </span>
                  </td>
                </tr>
                {open && g.rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/40">
                    <td className="px-3 py-1.5 font-mono text-xs">{r.code}</td>
                    <td className="px-3 py-1.5">
                      <Link to="/e/$id/wp/$wp" params={{ id, wp: r.id }} className="hover:text-accent hover:underline">{r.title}</Link>
                      {r.illustrative && <span className="ml-1.5 text-xs text-muted-foreground">(illustrative)</span>}
                    </td>
                    <td className="px-3 py-1.5"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-1.5">
                      {r.status === "not_started" ? <span className="text-muted-foreground">—</span>
                        : r.placeholders ? <span className="text-xs font-medium text-status-draft">{r.placeholders} placeholders</span>
                        : <Check className="h-4 w-4 text-success" />}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs">
                      {STAGES.map((st, i) => {
                        const s = r.signoffs?.[st];
                        return (
                          <span key={st}>
                            {i > 0 && <span className="text-muted-foreground"> / </span>}
                            <Tooltip>
                              <TooltipTrigger asChild><span className={s ? "font-semibold" : "text-muted-foreground"}>{s ? s.initials : "·"}</span></TooltipTrigger>
                              <TooltipContent>{LABEL[st]}: {s ? `${s.person}, ${new Date(s.ts).toLocaleString("en-IN")}` : "not yet"}</TooltipContent>
                            </Tooltip>
                          </span>
                        );
                      })}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Button asChild size="sm" variant={r.status === "not_started" ? "outline" : "default"} className="h-7">
                        <Link to="/e/$id/wp/$wp" params={{ id, wp: r.id }}>{r.status === "not_started" ? "Start" : "Open"}</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>

      <EngagementDialog open={settings} onOpenChange={setSettings} engagement={e} onSaved={() => { qc.invalidateQueries({ queryKey: ["engagement", id] }); qc.invalidateQueries({ queryKey: ["engagements"] }); }} />
    </main>
  );
}
