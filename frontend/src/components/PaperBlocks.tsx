import { memo } from "react";
import type { Block, ParaBlock, TableBlock, WorkingPaper } from "@/lib/types";
import { PLACEHOLDER_RE } from "@/lib/types";
import { LABEL } from "@/components/StatusBadge";

const isPh = (s: string) => PLACEHOLDER_RE.test(s);

function HeaderCard({ data }: { data: WorkingPaper }) {
  const h = data.header;
  const sig = (label: "Prepared" | "Reviewed" | "Approved") => {
    const s = h[label];
    return (
      <div className="flex-1 border-l border-paper-ink/30 px-3 py-1.5 first:border-l-0">
        <div className="text-[11px] uppercase tracking-wide opacity-60">{label} by</div>
        <div className="font-semibold">{s ? `${s[0]}${s[1] ? ` (${s[1]})` : ""}` : "—"}</div>
      </div>
    );
  };
  return (
    <div className="mb-6 border border-paper-ink text-sm">
      <div className="grid grid-cols-[1fr_auto] border-b border-paper-ink">
        <div className="px-3 py-2"><div className="text-base font-bold">{h.client}</div><div>{h.task} — {h.period}</div></div>
        <div className="border-l border-paper-ink px-3 py-2 text-right"><div className="text-[11px] uppercase tracking-wide opacity-60">Ref</div><div className="text-base font-bold">{data.wp.code}</div></div>
      </div>
      <div className="border-b border-paper-ink px-3 py-1.5"><span className="font-bold">{data.wp.title}</span><span className="ml-2 opacity-70">· Status: {LABEL[data.status]}</span></div>
      <div className="flex">{sig("Prepared")}{sig("Reviewed")}{sig("Approved")}</div>
    </div>
  );
}

function Para({ b, locked }: { b: ParaBlock; locked: boolean }) {
  const val = b.v ?? b.text;
  const cls = ["wp-p", b.bold && "bold", b.list && "li", b.hl && "hl", val.trim() === "" && "empty", b.ov && "wp-edited", isPh(val) && "ph"].filter(Boolean).join(" ");
  return <div className={cls} data-key={"p" + b.i} contentEditable={locked ? false : "plaintext-only"} suppressContentEditableWarning spellCheck={false}>{val}</div>;
}

function Table({ b, locked }: { b: TableBlock; locked: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="wp-table"><tbody>
        {b.rows.map((row) => (
          <tr key={row.r}>
            {row.cells.map((c) => {
              const val = c.v ?? c.text;
              const cls = [c.bold && "bold", c.shaded && "shaded", c.ro && "ro", !c.ro && val.trim() === "" && "empty", c.ov && "wp-edited", !c.ro && isPh(val) && "ph"].filter(Boolean).join(" ");
              const editable = !c.ro && !locked;
              return (
                <td key={c.c} colSpan={c.cs ?? 1} rowSpan={c.rs ?? 1} className={cls}
                  data-key={c.ro ? undefined : `c${b.i}.${row.r}.${c.c}`}
                  contentEditable={editable ? "plaintext-only" : false} suppressContentEditableWarning spellCheck={false}>{val}</td>
              );
            })}
          </tr>
        ))}
      </tbody></table>
    </div>
  );
}

function blockList(blocks: Block[], locked: boolean) {
  const out: React.ReactNode[] = [];
  let prevEmpty = false;
  for (const b of blocks) {
    if (b.i === 0 || b.k === "x") continue;
    if (b.k === "p") {
      const empty = (b.v ?? b.text).trim() === "";
      if (empty && prevEmpty) continue;
      prevEmpty = empty;
      out.push(<Para key={b.i} b={b} locked={locked} />);
    } else { prevEmpty = false; out.push(<Table key={b.i} b={b} locked={locked} />); }
  }
  return out;
}

export const PaperBlocks = memo(function PaperBlocks({ data, locked }: { data: WorkingPaper; locked: boolean }) {
  return <><HeaderCard data={data} />{blockList(data.blocks, locked)}</>;
});

export function initialOverrides(blocks: Block[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (const b of blocks) {
    if (b.i === 0) continue;
    if (b.k === "p" && b.ov) o["p" + b.i] = b.v ?? "";
    if (b.k === "t") for (const r of b.rows) for (const c of r.cells) if (c.ov) o[`c${b.i}.${r.r}.${c.c}`] = c.v ?? "";
  }
  return o;
}
