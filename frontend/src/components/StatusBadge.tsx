import { cn } from "@/lib/utils";
import type { WpStatus } from "@/lib/types";

const STYLE: Record<WpStatus, string> = {
  not_started: "bg-status-none/15 text-status-none border-status-none/30",
  draft: "bg-status-draft/15 text-status-draft border-status-draft/40",
  prepared: "bg-status-prepared/15 text-status-prepared border-status-prepared/40",
  reviewed: "bg-status-reviewed/15 text-status-reviewed border-status-reviewed/40",
  approved: "bg-status-approved/15 text-status-approved border-status-approved/40",
};
export const LABEL: Record<WpStatus, string> = {
  not_started: "Not started", draft: "Draft", prepared: "Prepared", reviewed: "Reviewed", approved: "Approved",
};

export function StatusBadge({ status, count, className }: { status: WpStatus; count?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold", STYLE[status], className)}>
      {count !== undefined && <span className="tabular-nums">{count}</span>}
      {LABEL[status].toLowerCase()}
    </span>
  );
}
