import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function LogPage({ id }: { id: string }) {
  const eq = useQuery({ queryKey: ["engagement", id], queryFn: () => api.engagement(id) });
  const lq = useQuery({ queryKey: ["log", id], queryFn: () => api.log(id) });
  return (
    <main className="mx-auto max-w-[1100px] px-5 py-5">
      <Link to="/e/$id" params={{ id }} className="text-xs text-accent hover:underline">← Back to index</Link>
      <h1 className="mb-4 text-xl font-semibold text-primary">Activity log{eq.data ? ` — ${eq.data.client_name}` : ""}</h1>
      {lq.error && <p className="text-sm text-destructive">{(lq.error as Error).message}</p>}
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground"><tr><th className="w-48 px-3 py-2">When</th><th className="w-28 px-3 py-2">WP</th><th className="w-28 px-3 py-2">Action</th><th className="px-3 py-2">Detail</th></tr></thead>
          <tbody>
            {lq.data?.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-1.5 tabular-nums">{new Date(l.ts).toLocaleString("en-IN")}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{l.wp_id ? <Link to="/e/$id/wp/$wp" params={{ id, wp: l.wp_id }} className="hover:underline">{l.wp_id}</Link> : "—"}</td>
                <td className="px-3 py-1.5 capitalize">{l.action}</td>
                <td className="px-3 py-1.5">{l.detail}</td>
              </tr>
            ))}
            {lq.data?.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No activity yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
