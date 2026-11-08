import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGE_ROLE, type Stage, type TeamMember } from "@/lib/types";

const OTHER = "__other__";

export function SignoffDialog({ open, onOpenChange, stage, team, placeholders, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; stage: Stage; team: TeamMember[]; placeholders: number;
  onConfirm: (b: { person: string; initials: string; note: string }) => Promise<void>;
}) {
  const sorted = useMemo(() => {
    const role = STAGE_ROLE[stage];
    return [...team.filter((t) => t.role === role), ...team.filter((t) => t.role !== role)];
  }, [team, stage]);
  const [sel, setSel] = useState("");
  const [other, setOther] = useState("");
  const [initials, setInitials] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const first = sorted[0];
    setSel(first ? "0" : OTHER); setInitials(first?.initials ?? ""); setOther(""); setNote("");
  }, [open, sorted]);

  const person = sel === OTHER ? other.trim() : sorted[Number(sel)]?.name ?? "";
  const label = stage === "approved" ? "Approve" : `Sign off as ${stage}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        {placeholders > 0 && (
          <div className="flex gap-2 rounded-lg border border-warning/50 bg-warning-soft p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-draft" />
            <span>{placeholders} placeholder{placeholders === 1 ? "" : "s"} still to complete. You can sign off anyway, but they will remain in the working paper.</span>
          </div>
        )}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Signing person</Label>
            <Select value={sel} onValueChange={(v) => { setSel(v); setInitials(v !== OTHER ? sorted[Number(v)]?.initials ?? "" : ""); }}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {sorted.map((t, i) => <SelectItem key={i} value={String(i)}>{t.name} ({t.initials}, {t.role})</SelectItem>)}
                <SelectItem value={OTHER}>Other...</SelectItem>
              </SelectContent>
            </Select>
            {sel === OTHER && <Input placeholder="Full name" value={other} onChange={(e) => setOther(e.target.value)} />}
          </div>
          <div className="space-y-1"><Label>Initials</Label><Input value={initials} maxLength={4} onChange={(e) => setInitials(e.target.value.toUpperCase())} /></div>
          <div className="space-y-1"><Label>Note (optional)</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="success" disabled={busy || !person || !initials.trim()} onClick={async () => {
            setBusy(true);
            try { await onConfirm({ person, initials: initials.trim(), note: note.trim() }); onOpenChange(false); }
            catch { /* error toast shown by caller; keep dialog open */ }
            finally { setBusy(false); }
          }}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReopenDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setReason(""); }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Re-open working paper</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Earlier sign-offs will be cleared. The reason is recorded in the activity log.</p>
        <div className="space-y-1"><Label>Reason (required)</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={busy || !reason.trim()} onClick={async () => {
            setBusy(true);
            try { await onConfirm(reason.trim()); onOpenChange(false); }
            catch { /* keep open */ }
            finally { setBusy(false); }
          }}>Re-open</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
