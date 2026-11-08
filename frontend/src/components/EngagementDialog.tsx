import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eraser, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errMsg } from "@/lib/api";
import type { Engagement, EngagementInput, Role, TeamMember } from "@/lib/types";

export function defaultFyEnd(today = new Date()): string {
  const y = today.getMonth() > 2 || (today.getMonth() === 2 && today.getDate() === 31) ? today.getFullYear() : today.getFullYear() - 1;
  return `${y}-03-31`;
}
const ROLES: { v: Role; l: string }[] = [
  { v: "C", l: "C = Audit team (preparer)" },
  { v: "T", l: "T = Engagement manager (reviewer)" },
  { v: "A", l: "A = Engagement partner (approver)" },
];
function blank(firm?: { name: string; frn: string }): EngagementInput {
  return { client_name: "", fy_end: defaultFyEnd(), task: "Statutory Audit", firm_name: firm?.name ?? "", firm_frn: firm?.frn ?? "", allow_same_signoff: false,
    team: (["C", "T", "A"] as Role[]).map((role) => ({ name: "", initials: "", role })) };
}
const autoInitials = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("").slice(0, 3);

export function EngagementDialog({ open, onOpenChange, engagement, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; engagement?: Engagement; onSaved: (e: Engagement) => void;
}) {
  const [f, setF] = useState<EngagementInput>(blank);
  const [busy, setBusy] = useState(false);
  const fq = useQuery({ queryKey: ["firm"], queryFn: api.firm });
  const firmDef = fq.data ? { name: fq.data.name, frn: fq.data.frn } : undefined;

  useEffect(() => {
    if (!open) return;
    if (engagement) {
      const { id: _id, counts: _c, ...rest } = engagement;
      setF({ ...rest, team: (rest.team ?? []).map((t) => ({ ...t })) });
    } else setF(blank(firmDef));
  }, [open, engagement, fq.data]);

  const set = <K extends keyof EngagementInput>(k: K, v: EngagementInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const setMember = (i: number, patch: Partial<TeamMember>) => setF((p) => ({ ...p, team: p.team.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  async function submit(another = false) {
    if (!f.client_name.trim()) return toast.error("Client name is required");
    setBusy(true);
    try {
      const body = { ...f, team: f.team.filter((t) => t.name.trim()) };
      const e = engagement ? await api.updateEngagement(engagement.id, body) : await api.createEngagement(body);
      toast.success(engagement ? "Settings saved" : "Engagement created");
      onSaved(e);
      if (another && !engagement) setF(blank(firmDef)); else onOpenChange(false);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{engagement ? "Engagement settings" : "New engagement"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label>Client name</Label><Input value={f.client_name} onChange={(e) => set("client_name", e.target.value)} autoFocus /></div>
          <div className="space-y-1"><Label>Financial year end</Label><Input type="date" value={f.fy_end} onChange={(e) => set("fy_end", e.target.value)} /></div>
          <div className="space-y-1"><Label>Due date (optional)</Label><Input type="date" value={f.due_date ?? ""} onChange={(e) => set("due_date", e.target.value)} /></div>
          <div className="space-y-1"><Label>Nature of engagement</Label><Input value={f.task} onChange={(e) => set("task", e.target.value)} /></div>
          <div className="space-y-1"><Label>Firm name</Label><Input value={f.firm_name} onChange={(e) => set("firm_name", e.target.value)} /></div>
          <div className="space-y-1"><Label>Firm registration no. (FRN)</Label><Input value={f.firm_frn} onChange={(e) => set("firm_frn", e.target.value)} /></div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <Checkbox checked={f.allow_same_signoff} onCheckedChange={(v) => set("allow_same_signoff", v === true)} />
            Allow the same person to prepare and review
          </label>
        </div>
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between">
            <Label>Engagement team</Label>
            <Button variant="outline" size="sm" onClick={() => set("team", [...f.team, { name: "", initials: "", role: "C" }])}><Plus className="h-3.5 w-3.5" /> Add person</Button>
          </div>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground"><tr><th className="px-2 py-1.5">Name</th><th className="w-24 px-2 py-1.5">Initials</th><th className="w-64 px-2 py-1.5">Role</th><th className="w-10" /></tr></thead>
              <tbody>
                {f.team.map((t, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1"><Input className="h-8" value={t.name} onChange={(e) => {
                      const name = e.target.value; const was = autoInitials(t.name);
                      setMember(i, { name, ...(t.initials === "" || t.initials === was ? { initials: autoInitials(name) } : {}) });
                    }} /></td>
                    <td className="p-1"><Input className="h-8" value={t.initials} maxLength={4} onChange={(e) => setMember(i, { initials: e.target.value.toUpperCase() })} /></td>
                    <td className="p-1">
                      <Select value={t.role} onValueChange={(v) => setMember(i, { role: v as Role })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="p-1 text-center"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => set("team", f.team.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="mr-auto" onClick={() => setF({ ...blank(), team: f.team.map((t) => ({ ...t, name: "", initials: "" })) })}><Eraser /> Clear fields</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {!engagement && <Button variant="outline" onClick={() => submit(true)} disabled={busy}>Save &amp; add another</Button>}
          <Button onClick={() => submit()} disabled={busy}>{engagement ? "Save settings" : "Create engagement"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
