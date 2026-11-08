import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ClauseSection } from "@/lib/types";

const uid = () => Math.random().toString(36).slice(2, 9);

/** Tick-and-edit list of clause sections. Used per document and for the master library. */
export function ClauseEditor({ sections, onChange, library = false }: { sections: ClauseSection[]; onChange: (s: ClauseSection[]) => void; library?: boolean }) {
  const upSec = (i: number, patch: Partial<ClauseSection>) => onChange(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const upItem = (i: number, k: number, patch: object) => upSec(i, { items: sections[i].items.map((it, m) => (m === k ? { ...it, ...patch } : it)) });
  return (
    <div className="space-y-3">
      {sections.map((s, i) => {
        const on = s.items.filter((x) => x.on).length;
        return (
          <div key={s.id} className="rounded-lg border bg-card">
            <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
              <Input className="h-8 flex-1 bg-card font-medium" value={s.title} onChange={(e) => upSec(i, { title: e.target.value })} aria-label="Heading" />
              <span className="whitespace-nowrap text-xs text-muted-foreground">{on} of {s.items.length} {library ? "on by default" : "included"}</span>
              {!library && <>
                <Button size="sm" variant="ghost" onClick={() => upSec(i, { items: s.items.map((x) => ({ ...x, on: true })) })}>All</Button>
                <Button size="sm" variant="ghost" onClick={() => upSec(i, { items: s.items.map((x) => ({ ...x, on: false })) })}>None</Button></>}
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Remove section" title="Remove this heading and its clauses"
                onClick={() => { if (s.items.length === 0 || window.confirm(`Remove "${s.title}" and its ${s.items.length} clause(s)?`)) onChange(sections.filter((_, j) => j !== i)); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="divide-y">
              {s.items.map((it, k) => (
                <div key={it.id} className="flex items-start gap-2 p-2">
                  <input type="checkbox" className="mt-2.5 h-4 w-4 shrink-0 accent-[hsl(var(--accent,200_80%_35%))]" checked={it.on} onChange={(e) => upItem(i, k, { on: e.target.checked })} aria-label="Include clause" />
                  <div className={`min-w-0 flex-1 space-y-1 ${it.on ? "" : "opacity-60"}`}>
                    <Input className="h-7 text-xs" placeholder="Bold lead-in (optional)" value={it.title} onChange={(e) => upItem(i, k, { title: e.target.value })} />
                    <Textarea rows={Math.min(8, Math.max(2, Math.ceil(it.text.length / 110)))} value={it.text} onChange={(e) => upItem(i, k, { text: e.target.value })} />
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Delete clause" onClick={() => upSec(i, { items: s.items.filter((_, m) => m !== k) })}><Trash2 className="h-4 w-4" /></Button>
                </div>))}
              {s.items.length === 0 && <p className="p-3 text-sm text-muted-foreground">No clauses under this heading.</p>}
            </div>
            <div className="border-t p-2"><Button size="sm" variant="outline" onClick={() => upSec(i, { items: [...s.items, { id: uid(), title: "", text: "", on: true }] })}><Plus /> Add clause</Button></div>
          </div>);
      })}
      <Button variant="outline" onClick={() => onChange([...sections, { id: uid(), title: "New heading", slot: sections[0]?.slot ?? "main", items: [] }])}><Plus /> Add heading</Button>
    </div>
  );
}
