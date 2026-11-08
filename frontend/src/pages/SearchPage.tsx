import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Users } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate } from "./EngagementsPage";

export function SearchPage({ q }: { q: string }) {
  const r = useQuery({ queryKey: ["search", q], queryFn: () => api.search(q) });
  return (
    <main className="mx-auto max-w-[900px] px-6 py-6">
      <h1 className="mb-1 text-xl font-semibold text-primary">Search results for “{q}”</h1>
      {r.isLoading && <p className="text-sm text-muted-foreground">Searching…</p>}
      {r.data && <>
        <h2 className="mb-2 mt-4 flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-accent" /> Clients ({r.data.engagements.length})</h2>
        <div className="mb-4 divide-y overflow-hidden rounded-lg border bg-card">
          {r.data.engagements.map((e) => <Link key={e.id} to="/e/$id" params={{ id: String(e.id) }} className="block px-4 py-2.5 text-sm hover:bg-muted/50"><b className="text-primary">{e.client_name}</b> <span className="text-muted-foreground">· {e.task} · FY ending {fmtDate(e.fy_end)}</span></Link>)}
          {r.data.engagements.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No matching clients.</p>}
        </div>
        <h2 className="mb-2 flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-accent" /> Documents ({r.data.documents.length})</h2>
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {r.data.documents.map((d) => <Link key={d.id} to="/e/$id/docs/$did" params={{ id: String(d.engagement_id), did: String(d.id) }} className="block px-4 py-2.5 text-sm hover:bg-muted/50"><b className="text-primary">{d.title}</b> <span className="text-muted-foreground">· {d.client_name} · {new Date(d.updated).toLocaleDateString("en-IN")}</span></Link>)}
          {r.data.documents.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No matching documents.</p>}
        </div></>}
    </main>
  );
}
