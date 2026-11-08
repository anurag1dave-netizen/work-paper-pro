import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, Copy, FileText, Plus, Settings, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { EngagementDialog } from "@/components/EngagementDialog";
import { CopyForwardDialog } from "@/components/CopyForwardDialog";
import { Ring } from "@/components/Ring";
import { api, errMsg } from "@/lib/api";
import type { Engagement, WpStatus } from "@/lib/types";

export const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const daysTo = (d?: string) => (d ? Math.round((new Date(d).getTime() - new Date(new Date().toDateString()).getTime()) / 864e5) : null);

function Tile({ icon: I, label, value, sub, tone }: { icon: any; label: string; value: string | number; sub?: string; tone: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${tone}`}><I className="h-4 w-4" /></span></div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-primary">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>);
}

export function EngagementsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["engagements"], queryFn: api.engagements });
  const ov = useQuery({ queryKey: ["overview"], queryFn: api.overview });
  const fq = useQuery({ queryKey: ["firm"], queryFn: api.firm });
  const [dlg, setDlg] = useState<{ open: boolean; e?: Engagement }>({ open: false });
  const [copy, setCopy] = useState<Engagement>();
  const [filter, setFilter] = useState(""); const [sort, setSort] = useState<"recent" | "due" | "name">("recent");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["engagements"] }); qc.invalidateQueries({ queryKey: ["overview"] }); };
  async function remove(e: Engagement) {
    if (!window.confirm(`Delete the engagement for "${e.client_name}" with all its working papers, documents and sign-offs? This cannot be undone.`)) return;
    try { await api.deleteEngagement(e.id); toast.success("Engagement deleted"); refresh(); } catch (x) { toast.error(errMsg(x)); }
  }
  const rows = useMemo(() => {
    const s = filter.trim().toLowerCase();
    const l = (q.data ?? []).filter((e) => !s || (e.client_name + " " + e.task).toLowerCase().includes(s));
    if (sort === "name") l.sort((a, b) => a.client_name.localeCompare(b.client_name));
    if (sort === "due") l.sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
    return l;
  }, [q.data, filter, sort]);
  const o = ov.data;
  return (
    <main className="mx-auto max-w-[1300px] px-6 py-6">
      <div className="mb-5 flex items-end justify-between">
        <div><h1 className="text-2xl font-semibold text-primary">Home</h1><p className="text-sm text-muted-foreground">Status of every client at a glance.</p></div>
        <Button onClick={() => setDlg({ open: true })}><Plus /> New engagement</Button>
      </div>
      {fq.data && !fq.data.name.trim() && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
          <span><b>First-time setup:</b> enter your firm name, FRN, address and partners so they appear on every letter, certificate and proposal.</span>
          <Button asChild size="sm"><Link to="/firm">Set up firm</Link></Button></div>)}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile icon={Users} label="Clients" value={o?.clients ?? "–"} sub="active engagements" tone="bg-accent/15 text-accent" />
        <Tile icon={AlertTriangle} label="Awaiting review" value={o?.awaiting_review ?? "–"} sub="papers prepared or reviewed" tone="bg-status-draft/15 text-status-draft" />
        <Tile icon={CheckCircle2} label="Approved" value={o?.approved ?? "–"} sub={o ? `of ${o.total_papers} papers` : ""} tone="bg-status-approved/15 text-status-approved" />
        <Tile icon={FileText} label="Documents this month" value={o?.documents_this_month ?? "–"} sub="letters, certificates, proposals" tone="bg-status-prepared/15 text-status-prepared" />
      </div>
      {o && o.due.length > 0 && (
        <div className="mb-5 rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4 text-accent" /> Due dates</h2>
          <div className="flex flex-wrap gap-2">{o.due.map((d) => (
            <Link key={d.id} to="/e/$id" params={{ id: String(d.id) }} className={`rounded-lg border px-3 py-1.5 text-sm ${d.days < 0 ? "border-destructive/50 bg-destructive/10 text-destructive" : d.days <= 14 ? "border-status-draft/50 bg-status-draft/10" : "bg-secondary"}`}>
              <b>{d.client_name}</b> · {fmtDate(d.due_date)} <span className="text-xs">({d.days < 0 ? `${-d.days} days overdue` : d.days === 0 ? "today" : `in ${d.days} days`})</span></Link>))}</div>
        </div>)}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">Client tracker</h2>
        <Input className="h-8 w-56" placeholder="Filter clients" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select className="h-8 rounded-md border bg-card px-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as any)}>
          <option value="recent">Newest first</option><option value="due">By due date</option><option value="name">Client A–Z</option></select>
      </div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && q.data.length === 0 && <div className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">No engagements yet. Click <b>New engagement</b> to start.</div>}
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>
              <th className="px-4 py-2.5">Client</th><th className="px-3 py-2.5">Year end</th><th className="px-3 py-2.5">Due</th><th className="px-3 py-2.5">Progress</th><th className="px-3 py-2.5">Docs</th><th className="px-3 py-2.5 text-right">Actions</th></tr></thead>
            <tbody>{rows.map((e) => {
              const dd = daysTo(e.due_date), done = e.counts?.approved ?? 0;
              return (
                <tr key={e.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-3"><Link to="/e/$id" params={{ id: e.id }} className="font-semibold text-primary hover:text-accent hover:underline">{e.client_name}</Link><div className="text-xs text-muted-foreground">{e.task}{e.firm_name ? ` · ${e.firm_name}` : ""}</div></td>
                  <td className="px-3 py-3 whitespace-nowrap">{fmtDate(e.fy_end)}</td>
                  <td className={`px-3 py-3 whitespace-nowrap ${dd !== null && dd < 0 ? "font-semibold text-destructive" : dd !== null && dd <= 14 ? "font-semibold text-status-draft" : ""}`}>{e.due_date ? fmtDate(e.due_date) : "—"}</td>
                  <td className="px-3 py-3"><div className="flex items-center gap-3 text-primary"><Ring value={done} total={e.total_wps ?? 78} />
                    <div className="flex flex-wrap gap-1">{(["draft", "prepared", "reviewed", "approved"] as WpStatus[]).filter((s) => (e.counts?.[s] ?? 0) > 0).map((s) => <StatusBadge key={s} status={s} count={e.counts?.[s] ?? 0} />)}</div></div></td>
                  <td className="px-3 py-3"><Link to="/e/$id/docs" params={{ id: e.id }} className="text-accent hover:underline">{e.docs ?? 0}</Link></td>
                  <td className="px-3 py-3"><div className="flex justify-end gap-1">
                    <Button asChild size="sm"><Link to="/e/$id" params={{ id: e.id }}>Open</Link></Button>
                    <Button size="icon" variant="ghost" title="Copy forward to next year" aria-label="Copy forward" onClick={() => setCopy(e)}><Copy className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="Engagement settings" aria-label="Settings" onClick={() => setDlg({ open: true, e })}><Settings className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Delete engagement" title="Delete engagement" onClick={() => remove(e)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></td>
                </tr>);
            })}</tbody>
          </table>
        </div>)}
      <EngagementDialog open={dlg.open} engagement={dlg.e} onOpenChange={(open) => setDlg((d) => ({ ...d, open }))} onSaved={refresh} />
      <CopyForwardDialog engagement={copy} onClose={() => setCopy(undefined)} onDone={refresh} />
    </main>
  );
}
