import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errMsg } from "@/lib/api";
import type { Engagement } from "@/lib/types";

export function nextYear(d: string) { const x = new Date(d); if (isNaN(+x)) return ""; return `${x.getFullYear() + 1}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate() === 29 && x.getMonth() === 1 ? 28 : x.getDate()).padStart(2, "0")}`; }

export function CopyForwardDialog({ engagement, onClose, onDone }: { engagement?: Engagement; onClose: () => void; onDone: () => void }) {
  const nav = useNavigate();
  const [name, setName] = useState(""); const [fy, setFy] = useState("");
  const [papers, setPapers] = useState(true); const [docs, setDocs] = useState(true); const [busy, setBusy] = useState(false);
  useEffect(() => { if (engagement) { setName(engagement.client_name); setFy(nextYear(engagement.fy_end)); setPapers(true); setDocs(true); } }, [engagement]);
  async function go() {
    if (!engagement) return; setBusy(true);
    try {
      const r = await api.duplicate(engagement.id, { client_name: name, fy_end: fy, papers, documents: docs });
      toast.success(`Copied forward: ${r.papers} working papers, ${r.documents} documents`); onDone(); onClose();
      nav({ to: "/e/$id", params: { id: String(r.id) } });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!engagement} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Copy forward to next year</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Creates a new engagement for <b>{engagement?.client_name}</b> with the same team and company profile. Sign-offs start again; status returns to Draft.</p>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Client name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label>New financial year end</Label><Input type="date" value={fy} onChange={(e) => setFy(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={papers} onChange={(e) => setPapers(e.target.checked)} /> Carry over entries made in the working papers</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={docs} onChange={(e) => setDocs(e.target.checked)} /> Carry over created documents (check their dates afterwards)</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={go} disabled={busy || !name.trim()}>Copy forward</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
