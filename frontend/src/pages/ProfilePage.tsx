import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eraser, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, errMsg } from "@/lib/api";
import type { Director, Profile, Shareholder } from "@/lib/types";

const blankDir = (): Director => ({ name: "", din: "", designation: "Director", category: "Promoter", appointed: "", address: "" });
const blankSh = (): Shareholder => ({ name: "", address: "", shares: "", face_value: 10 });

export function ProfilePage({ id }: { id: string }) {
  const qc = useQueryClient();
  const eq = useQuery({ queryKey: ["engagement", id], queryFn: () => api.engagement(id) });
  const [p, setP] = useState<Profile>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (eq.data) setP({ ...(eq.data.profile ?? {}) }); }, [eq.data]);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));
  const dirs = p.directors ?? [], shs = p.shareholders ?? [];
  const upDir = (i: number, patch: Partial<Director>) => set("directors", dirs.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const upSh = (i: number, patch: Partial<Shareholder>) => set("shareholders", shs.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const totalShares = shs.reduce((a, s) => a + Number(s.shares || 0), 0);

  async function save() {
    setBusy(true);
    try { await api.saveProfile(id, p); toast.success("Company profile saved"); qc.invalidateQueries({ queryKey: ["engagement", id] }); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  const fileRef = { dir: null as HTMLInputElement | null, sh: null as HTMLInputElement | null };
  async function doImport(kind: "directors" | "shareholders", f?: File) {
    if (!f) return;
    const replace = (kind === "directors" ? dirs : shs).length > 0 && window.confirm(`Replace the existing ${kind} with the ones in this file?\n\nOK = replace, Cancel = add to the existing list.`);
    try {
      await api.saveProfile(id, p);                                   // keep what has been typed so far
      const r = await api.importRows(id, kind, f, replace ? "replace" : "append");
      const e2 = await api.engagement(id); setP({ ...(e2.profile ?? {}) }); qc.invalidateQueries({ queryKey: ["engagement", id] });
      toast.success(`${r.imported} ${kind} imported`);
    } catch (e) { toast.error(errMsg(e)); }
  }
  const importBtns = (kind: "directors" | "shareholders", key: "dir" | "sh") => (
    <>
      <input type="file" accept=".xlsx,.csv" className="hidden" ref={(el) => { fileRef[key] = el; }} onChange={(e) => { doImport(kind, e.target.files?.[0]); e.target.value = ""; }} />
      <Button size="sm" variant="outline" onClick={() => fileRef[key]?.click()}><Upload /> Import Excel / CSV</Button>
      <Button size="sm" variant="ghost" asChild><a href={`/api/import-template/${kind}`}><Download /> Sample file</a></Button>
    </>);
  const th = "px-2 py-1.5 text-left text-xs font-medium text-muted-foreground";
  return (
    <main className="mx-auto max-w-[1200px] px-5 py-5">
      <Link to="/e/$id/docs" params={{ id }} className="text-xs text-accent hover:underline">← Documents</Link>
      <div className="mb-4 flex items-end justify-between">
        <div><h1 className="text-xl font-semibold text-primary">Company profile — {eq.data?.client_name}</h1>
          <p className="text-sm text-muted-foreground">Enter once; every document for this client picks it up.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => { if (window.confirm("Clear every field on this page? Nothing is saved until you press Save.")) setP({}); }}><Eraser /> Clear all fields</Button>
          <Button onClick={save} disabled={busy}><Save /> Save profile</Button></div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 rounded-lg border bg-card p-4">
        <div className="space-y-1"><Label>CIN</Label><Input value={p.cin ?? ""} onChange={(e) => set("cin", e.target.value.toUpperCase())} /></div>
        <div className="space-y-1"><Label>PAN of the Company</Label><Input value={p.pan ?? ""} onChange={(e) => set("pan", e.target.value.toUpperCase())} /></div>
        <div className="col-span-2 space-y-1"><Label>Registered office address (one line per row of the address)</Label>
          <Textarea rows={3} value={p.reg_address ?? ""} onChange={(e) => set("reg_address", e.target.value)} /></div>
        <div className="space-y-1"><Label>Authorised (nominal) capital — Rs.</Label><Input inputMode="numeric" value={p.nominal_capital ?? ""} onChange={(e) => set("nominal_capital", e.target.value.replace(/[^\d.]/g, ""))} /></div>
        <div className="space-y-1"><Label>Paid-up capital — Rs.</Label><Input inputMode="numeric" value={p.paid_up_capital ?? ""} onChange={(e) => set("paid_up_capital", e.target.value.replace(/[^\d.]/g, ""))} /></div>
      </div>

      <div className="mb-5 rounded-lg border bg-card p-4">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Directors</h2>
          <div className="flex gap-1">{importBtns("directors", "dir")}<Button size="sm" variant="outline" onClick={() => set("directors", [...dirs, blankDir()])}><Plus /> Add director</Button></div></div>
        <table className="w-full text-sm"><thead><tr><th className={th}>Name</th><th className={th + " w-28"}>DIN</th><th className={th + " w-28"}>Designation</th><th className={th + " w-28"}>Category</th><th className={th + " w-36"}>Appointed on</th><th className={th}>Residential address</th><th className="w-10" /></tr></thead>
          <tbody>{dirs.map((d, i) => (
            <tr key={i} className="border-t">
              <td className="p-1"><Input className="h-8" value={d.name} onChange={(e) => upDir(i, { name: e.target.value })} /></td>
              <td className="p-1"><Input className="h-8" value={d.din} onChange={(e) => upDir(i, { din: e.target.value })} /></td>
              <td className="p-1"><Input className="h-8" value={d.designation} onChange={(e) => upDir(i, { designation: e.target.value })} /></td>
              <td className="p-1"><Input className="h-8" value={d.category} onChange={(e) => upDir(i, { category: e.target.value })} /></td>
              <td className="p-1"><Input className="h-8" type="date" value={d.appointed} onChange={(e) => upDir(i, { appointed: e.target.value })} /></td>
              <td className="p-1"><Input className="h-8" value={d.address} onChange={(e) => upDir(i, { address: e.target.value })} /></td>
              <td className="p-1"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => set("directors", dirs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></td>
            </tr>))}</tbody></table>
        {dirs.length === 0 && <p className="py-3 text-sm text-muted-foreground">No directors yet.</p>}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Shareholders <span className="ml-2 text-xs font-normal text-muted-foreground">total shares: {totalShares.toLocaleString("en-IN")}</span></h2>
          <div className="flex gap-1">{importBtns("shareholders", "sh")}<Button size="sm" variant="outline" onClick={() => set("shareholders", [...shs, blankSh()])}><Plus /> Add shareholder</Button></div></div>
        <table className="w-full text-sm"><thead><tr><th className={th}>Name</th><th className={th}>Address</th><th className={th + " w-32"}>No. of shares</th><th className={th + " w-28"}>Face value (Rs.)</th><th className={th + " w-20"}>%</th><th className="w-10" /></tr></thead>
          <tbody>{shs.map((s, i) => (
            <tr key={i} className="border-t">
              <td className="p-1"><Input className="h-8" value={s.name} onChange={(e) => upSh(i, { name: e.target.value })} /></td>
              <td className="p-1"><Input className="h-8" value={s.address} onChange={(e) => upSh(i, { address: e.target.value })} /></td>
              <td className="p-1"><Input className="h-8" inputMode="numeric" value={s.shares} onChange={(e) => upSh(i, { shares: e.target.value.replace(/[^\d]/g, "") })} /></td>
              <td className="p-1"><Input className="h-8" inputMode="numeric" value={s.face_value} onChange={(e) => upSh(i, { face_value: e.target.value.replace(/[^\d.]/g, "") })} /></td>
              <td className="p-1 text-muted-foreground">{totalShares ? ((Number(s.shares || 0) * 100) / totalShares).toFixed(2) : "—"}</td>
              <td className="p-1"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => set("shareholders", shs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></td>
            </tr>))}</tbody></table>
        {shs.length === 0 && <p className="py-3 text-sm text-muted-foreground">No shareholders yet.</p>}
      </div>
    </main>
  );
}
