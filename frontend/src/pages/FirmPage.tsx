import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, errMsg } from "@/lib/api";
import type { Firm } from "@/lib/types";

export function FirmPage() {
  const qc = useQueryClient();
  const fq = useQuery({ queryKey: ["firm"], queryFn: api.firm });
  const [f, setF] = useState<Firm | null>(null);
  useEffect(() => { if (fq.data) setF(fq.data); }, [fq.data]);
  if (!f) return <main className="p-8 text-muted-foreground">Loading…</main>;
  const set = (patch: Partial<Firm>) => setF({ ...f, ...patch });
  return (
    <main className="mx-auto max-w-[800px] px-5 py-5">
      <Link to="/" className="text-xs text-accent hover:underline">← All engagements</Link>
      <div className="mb-4 flex items-end justify-between"><div><h1 className="text-xl font-semibold text-primary">Firm settings</h1>
        <p className="text-sm text-muted-foreground">Used in every letter, certificate and proposal.</p></div>
        <Button onClick={async () => { try { await api.saveFirm(f); qc.invalidateQueries({ queryKey: ["firm"] }); qc.setQueryData(["firm"], f); toast.success("Saved"); } catch (e) { toast.error(errMsg(e)); } }}><Save /> Save</Button></div>
      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4">
        <div className="space-y-1"><Label>Firm name</Label><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></div>
        <div className="space-y-1"><Label>Firm registration no. (FRN)</Label><Input value={f.frn} onChange={(e) => set({ frn: e.target.value })} /></div>
        <div className="space-y-1"><Label>Firm PAN</Label><Input value={f.pan} onChange={(e) => set({ pan: e.target.value.toUpperCase() })} /></div>
        <div className="space-y-1"><Label>Place of signing</Label><Input value={f.place} onChange={(e) => set({ place: e.target.value })} /></div>
        <div className="space-y-1"><Label>Tagline under firm name</Label><Input value={f.tagline} onChange={(e) => set({ tagline: e.target.value })} /></div>
        <div className="space-y-1"><Label>Contact line (phone / email) for letterhead</Label><Input value={f.contact} onChange={(e) => set({ contact: e.target.value })} /></div>
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.letterhead} onChange={(e) => set({ letterhead: e.target.checked })} /> Print a text letterhead (name, tagline, address) on letters. Untick if you use pre-printed stationery.</label>
        <div className="col-span-2 flex items-center gap-3 rounded-md border border-dashed p-3">
          {f.logo ? <img src={f.logo} alt="Logo" className="h-12 w-12 rounded bg-white object-contain p-0.5" /> : <span className="grid h-12 w-12 place-items-center rounded bg-muted text-muted-foreground"><ImagePlus /></span>}
          <div className="flex-1 text-sm"><div className="font-medium">Firm logo (optional)</div><div className="text-xs text-muted-foreground">Shown at the top of this app. PNG or JPG up to 300 KB. It is not printed on documents.</div></div>
          <label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm hover:bg-secondary">Choose…
            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
              if (file.size > 300 * 1024) return toast.error("Logo is larger than 300 KB. Use a smaller image.");
              const r = new FileReader(); r.onload = () => set({ logo: String(r.result) }); r.readAsDataURL(file);
            }} /></label>
          {f.logo && <Button size="sm" variant="ghost" onClick={() => set({ logo: "" })}>Remove</Button>}
        </div>
        <div className="col-span-2 space-y-1"><Label>Address</Label><Textarea rows={3} value={f.address} onChange={(e) => set({ address: e.target.value })} /></div>
      </div>
      <div className="mt-4 rounded-lg border bg-card p-4">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Partners (signatories)</h2>
          <Button size="sm" variant="outline" onClick={() => set({ partners: [...f.partners, { name: "", mno: "" }] })}><Plus /> Add partner</Button></div>
        <table className="w-full text-sm"><thead><tr><th className="px-2 py-1.5 text-left text-xs text-muted-foreground">Name</th><th className="w-40 px-2 py-1.5 text-left text-xs text-muted-foreground">Membership no.</th><th className="w-10" /></tr></thead>
          <tbody>{f.partners.map((p, i) => (
            <tr key={i} className="border-t">
              <td className="p-1"><Input className="h-8" value={p.name} onChange={(e) => set({ partners: f.partners.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /></td>
              <td className="p-1"><Input className="h-8" value={p.mno} onChange={(e) => set({ partners: f.partners.map((x, j) => (j === i ? { ...x, mno: e.target.value } : x)) })} /></td>
              <td className="p-1"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => set({ partners: f.partners.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button></td>
            </tr>))}</tbody></table>
      </div>
    </main>
  );
}
