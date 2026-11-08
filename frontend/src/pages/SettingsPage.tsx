import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Lock, Palette, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errMsg } from "@/lib/api";
import { ACCENTS, loadTheme, saveTheme, type Theme } from "@/lib/theme";

const Card = ({ icon: I, title, children }: { icon: any; title: string; children: React.ReactNode }) => (
  <section className="mb-5 rounded-xl border bg-card p-5 shadow-sm"><h2 className="mb-3 flex items-center gap-2 font-semibold text-primary"><I className="h-4 w-4 text-accent" />{title}</h2><div className="space-y-3 text-sm">{children}</div></section>);

export function SettingsPage() {
  const qc = useQueryClient();
  const ls = useQuery({ queryKey: ["lock"], queryFn: api.lockStatus });
  const pe = useQuery({ queryKey: ["pdf-engine"], queryFn: api.pdfEngine });
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [cur, setCur] = useState(""), [pw, setPw] = useState(""), [pw2, setPw2] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const setT = (t: Theme) => { setTheme(t); saveTheme(t); };
  const enabled = ls.data?.enabled;
  async function lock(remove = false) {
    if (!remove && pw !== pw2) return toast.error("The two passwords do not match");
    try { await api.setLock(remove ? "" : pw, cur); toast.success(remove ? "Password removed" : "Password saved"); setCur(""); setPw(""); setPw2(""); qc.invalidateQueries({ queryKey: ["lock"] }); }
    catch (e) { toast.error(errMsg(e)); }
  }
  async function restore(f?: File) {
    if (!f) return;
    if (!window.confirm("Restore this backup? It REPLACES everything currently in the app (a copy of the current data is kept as workpapers.before-restore.db in the data folder).")) return;
    try { await api.restore(f); toast.success("Backup restored"); qc.invalidateQueries(); } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <main className="mx-auto max-w-[760px] px-6 py-6">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Settings &amp; backup</h1>
      <p className="mb-5 text-sm text-muted-foreground">Appearance, security and protection of your data on this computer.</p>

      <Card icon={Palette} title="Appearance">
        <div className="flex gap-2">{(["light", "dark"] as const).map((m) => <Button key={m} variant={theme.mode === m ? "default" : "outline"} size="sm" onClick={() => setT({ ...theme, mode: m })}>{m === "light" ? "Light" : "Dark"}</Button>)}</div>
        <div className="flex flex-wrap gap-2">{Object.entries(ACCENTS).map(([k, a]) => (
          <button key={k} onClick={() => setT({ ...theme, accent: k })} className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${theme.accent === k ? "ring-2 ring-ring" : ""}`}>
            <span className="h-4 w-4 rounded-full" style={{ background: a.accent }} />{a.label}</button>))}</div>
      </Card>

      <Card icon={Download} title="Backup and restore">
        <p className="text-muted-foreground">A backup is one .zip file with all your engagements, working papers, documents, firm settings and clause library. Make one regularly and keep a copy on a pen drive or in a safe place.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => api.backup().catch((e) => toast.error(errMsg(e)))}><Download /> Download backup</Button>
          <input ref={file} type="file" accept=".zip" className="hidden" onChange={(e) => { restore(e.target.files?.[0]); e.target.value = ""; }} />
          <Button variant="outline" onClick={() => file.current?.click()}><Upload /> Restore from backup…</Button>
        </div>
      </Card>

      <Card icon={Lock} title="App password">
        <p className="text-muted-foreground">{enabled ? "A password is set. The app asks for it every time it is opened." : "Optional. Set a password so that the app asks for it every time it is opened. It protects against casual opening; for full protection also use a Windows login password."}</p>
        {enabled && <div className="space-y-1"><Label>Current password</Label><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>{enabled ? "New password" : "Password"}</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <div className="space-y-1"><Label>Repeat password</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div></div>
        <div className="flex gap-2"><Button onClick={() => lock()} disabled={!pw}>{enabled ? "Change password" : "Set password"}</Button>
          {enabled && <Button variant="outline" onClick={() => lock(true)} disabled={!cur}>Remove password</Button>}</div>
        <p className="text-xs text-muted-foreground">Forgotten password: close the app, create an empty file named <code>reset-lock.txt</code> in the data folder (%LOCALAPPDATA%\WorkPaperPro) and start the app again. Your data is not affected.</p>
      </Card>

      <Card icon={Download} title="PDF engine">
        <p>{pe.data ? (pe.data.engine === "libreoffice" ? "LibreOffice found: PDF export, preview and combined PDF are available." : pe.data.engine === "word" ? "Microsoft Word found: PDF export, preview and combined PDF are available." : "No PDF engine found. Install LibreOffice (free) or use Microsoft Word to enable PDF export, preview and combined PDF. Word export works without it.") : "Checking…"}</p>
      </Card>
    </main>
  );
}
