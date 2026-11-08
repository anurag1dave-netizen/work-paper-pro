import { useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errMsg } from "@/lib/api";

export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await api.unlock(pw); onUnlocked(); } catch (x) { toast.error(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <form onSubmit={go} className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg">
        <div className="mb-4 grid h-11 w-11 place-items-center rounded-lg bg-primary text-primary-foreground"><Lock className="h-5 w-5" /></div>
        <h1 className="text-lg font-semibold text-primary">Work Paper Pro is locked</h1>
        <p className="mb-4 text-sm text-muted-foreground">Enter the password to open your engagements.</p>
        <Input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" />
        <Button className="mt-3 w-full" disabled={busy || !pw}>Unlock</Button>
        <p className="mt-3 text-xs text-muted-foreground">Forgotten it? See "Forgotten password" in the User manual.</p>
      </form>
    </main>
  );
}
