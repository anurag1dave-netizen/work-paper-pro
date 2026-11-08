import type { DocCheck, Overview, SearchResult, ClauseLib, DocFull, DocRow, DocTemplate, Firm, Profile, CatalogRow, Engagement, EngagementInput, LogEntry, ProgressRow, Stage, WorkingPaper } from "./types";

// Same origin as the local Python server by default; override with VITE_API when running `vite dev`.
export const API_BASE: string = (import.meta as any).env?.VITE_API ?? "";

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

async function errorFrom(r: Response): Promise<ApiError> {
  let msg = `${r.status} ${r.statusText}`;
  try { const j = await r.json(); if (j?.detail) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* ignore */ }
  return new ApiError(msg, r.status);
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API_BASE}${path}`, { method, headers: body !== undefined ? { "Content-Type": "application/json" } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError("Cannot reach the local Work Paper Pro server. Start the app with run.bat.", 0);
  }
  if (!r.ok) throw await errorFrom(r);
  return r.json() as Promise<T>;
}

function filenameFrom(r: Response, fallback: string) {
  const cd = r.headers.get("content-disposition") ?? "";
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(cd);
  if (star) return decodeURIComponent(star[1].replace(/"/g, ""));
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1] : fallback;
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function download(path: string, fallback: string) {
  const r = await fetch(`${API_BASE}${path}`);
  if (!r.ok) throw await errorFrom(r);
  saveBlob(await r.blob(), filenameFrom(r, fallback));
}

async function reqRaw<T>(method: string, path: string, body: Blob): Promise<T> {
  let r: Response;
  try { r = await fetch(`${API_BASE}${path}`, { method, body }); } catch { throw new ApiError("Cannot reach the local Work Paper Pro server.", 0); }
  if (!r.ok) throw await errorFrom(r);
  return r.json() as Promise<T>;
}
async function downloadPost(path: string, body: unknown, fallback: string) {
  const r = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw await errorFrom(r);
  saveBlob(await r.blob(), filenameFrom(r, fallback));
}

const E = (id: string) => `/api/engagements/${encodeURIComponent(id)}`;
const W = (id: string, wp: string) => `${E(id)}/wps/${encodeURIComponent(wp)}`;
const norm = (e: any): Engagement => ({ ...e, id: String(e.id) });   // server ids are integers; routes use strings

export const api = {
  catalog: () => req<CatalogRow[]>("GET", "/api/catalog"),
  engagements: async () => (await req<any[]>("GET", "/api/engagements")).map(norm),
  engagement: async (id: string) => norm(await req("GET", E(id))),
  createEngagement: async (b: EngagementInput) => norm(await req("POST", "/api/engagements", b)),
  updateEngagement: async (id: string, b: EngagementInput) => norm(await req("PUT", E(id), b)),
  progress: (id: string) => req<ProgressRow[]>("GET", `${E(id)}/progress`),
  wp: (id: string, wp: string) => req<WorkingPaper>("GET", W(id, wp)),
  saveWp: (id: string, wp: string, overrides: Record<string, string>) => req<{ ok: boolean; edits: number }>("PUT", W(id, wp), { overrides }),
  signoff: (id: string, wp: string, b: { stage: Stage; person: string; initials: string; note: string }) => req<{ ok: boolean; status: string }>("POST", `${W(id, wp)}/signoff`, b),
  reopen: (id: string, wp: string, reason: string) => req<{ ok: boolean }>("POST", `${W(id, wp)}/reopen`, { reason }),
  log: (id: string) => req<LogEntry[]>("GET", `${E(id)}/log`),
  exportWp: (id: string, wp: string, format: "docx" | "pdf") => download(`${W(id, wp)}/export?format=${format}`, `${wp}.${format}`),
  exportAll: (id: string) => download(`${E(id)}/export-all`, `${id}-working-papers.zip`),
  overview: () => req<Overview>("GET", "/api/overview"),
  search: (q: string) => req<SearchResult>("GET", `/api/search?q=${encodeURIComponent(q)}`),
  duplicate: (id: string, b: { client_name?: string; fy_end?: string; papers: boolean; documents: boolean }) => req<{ id: number; papers: number; documents: number }>("POST", `${E(id)}/duplicate`, b),
  packDefault: () => req<string[]>("GET", "/api/pack-default"),
  makePack: (id: string, b: { templates: string[]; per_director: boolean }) => req<{ created: { id: number; title: string }[] }>("POST", `${E(id)}/pack`, b),
  checkDoc: (id: string, d: string) => req<DocCheck>("GET", `${E(id)}/docs/${d}/check`),
  pdfEngine: () => req<{ engine: string | null }>("GET", "/api/pdf-engine"),
  docsZip: (id: string, format: "docx" | "pdf", ids: number[]) => download(`${E(id)}/docs-zip?format=${format}&ids=${ids.join(",")}`, "documents.zip"),
  docsCombined: (id: string, ids: number[], numbering: boolean) => downloadPost(`${E(id)}/docs-combined`, { ids, numbering }, "combined.pdf"),
  importRows: (id: string, kind: "directors" | "shareholders", file: File, mode: "append" | "replace") =>
    reqRaw<{ imported: number; ignored_columns: string[] }>("POST", `${E(id)}/import/${kind}?filename=${encodeURIComponent(file.name)}&mode=${mode}`, file),
  backup: () => download("/api/backup", "WorkPaperPro-backup.zip"),
  restore: (file: File) => reqRaw<{ ok: boolean }>("POST", "/api/restore", file),
  lockStatus: () => req<{ enabled: boolean; unlocked: boolean }>("GET", "/api/lock/status"),
  unlock: (password: string) => req<{ ok: boolean }>("POST", "/api/lock/unlock", { password }),
  setLock: (password: string, current: string) => req<{ enabled: boolean }>("POST", "/api/lock/set", { password, current }),
  deleteEngagement: (id: string) => req<{ ok: boolean }>("DELETE", E(id)),
  clauses: () => req<ClauseLib>("GET", "/api/clauses"),
  saveClauses: (b: ClauseLib) => req<ClauseLib>("PUT", "/api/clauses", b),
  resetClauses: () => req<ClauseLib>("POST", "/api/clauses/reset", {}),
  firm: () => req<Firm>("GET", "/api/firm"),
  saveFirm: (b: Firm) => req<Firm>("PUT", "/api/firm", b),
  saveProfile: async (id: string, b: Profile) => norm(await req("PUT", `${E(id)}/profile`, b)),
  docTemplates: () => req<DocTemplate[]>("GET", "/api/doctemplates"),
  docs: (id: string) => req<DocRow[]>("GET", `${E(id)}/docs`),
  doc: (id: string, d: string) => req<DocFull>("GET", `${E(id)}/docs/${d}`),
  newDoc: (id: string, tmpl: string) => req<DocFull>("POST", `${E(id)}/docs`, { tmpl }),
  saveDoc: (id: string, d: string, vals: Record<string, any>, title?: string) => req<DocFull>("PUT", `${E(id)}/docs/${d}`, { vals, title }),
  delDoc: (id: string, d: string) => req<{ ok: boolean }>("DELETE", `${E(id)}/docs/${d}`),
  exportDoc: (id: string, d: string, format: "docx" | "pdf") => download(`${E(id)}/docs/${d}/export?format=${format}`, `document.${format}`),
  ping: async () => { try { await fetch(`${API_BASE}/api/ping`, { method: "POST" }); } catch { /* ignore */ } },
};
export function errMsg(e: unknown) { return e instanceof Error ? e.message : String(e); }
