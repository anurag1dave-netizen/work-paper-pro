export type Role = "C" | "T" | "A";
export type Stage = "prepared" | "reviewed" | "approved";
export type WpStatus = "not_started" | "draft" | Stage;
export interface TeamMember { name: string; initials: string; role: Role }
export interface EngagementInput { client_name: string; fy_end: string; firm_name: string; firm_frn: string; client_cin?: string; client_pan?: string; task: string; due_date?: string; allow_same_signoff: boolean; team: TeamMember[] }
export interface Director { name: string; din: string; designation: string; category: string; appointed: string; address: string }
export interface Shareholder { name: string; address: string; shares: number | string; face_value: number | string }
export interface Profile { cin?: string; pan?: string; reg_address?: string; nominal_capital?: number | string; paid_up_capital?: number | string; directors?: Director[]; shareholders?: Shareholder[] }
export interface Engagement extends EngagementInput { id: string; counts: Partial<Record<WpStatus, number>>; profile?: Profile; docs?: number; total_wps?: number }
export interface Firm { name: string; frn: string; pan: string; address: string; place: string; logo?: string; tagline: string; contact: string; letterhead: boolean; partners: { name: string; mno: string }[] }
export interface DocField { key: string; label: string; type: "text" | "textarea" | "date" | "money" | "select" | "partner" | "director" | "list" | "clauses"; library?: string; options?: string[]; columns?: DocField[]; placeholder?: string }
export interface DocTemplate { id: string; title: string; category: string; description: string; fields: DocField[] }
export interface DocRow { id: number; tmpl: string; title: string; updated: string }
export interface DocFull extends DocRow { vals: Record<string, any> }
export interface CatalogRow { id: string; code: string; title: string; chapter: number; chapter_name: string; tables: number; illustrative: boolean; order: number }
export interface Signoff { person: string; initials: string; ts: string; note?: string }
export type Signoffs = Partial<Record<Stage, Signoff>>;
export interface ProgressRow extends CatalogRow { status: WpStatus; placeholders?: number; signoffs: Signoffs; edits?: number }
export interface ParaBlock { k: "p"; i: number; text: string; v?: string; ov?: boolean; list?: boolean; bold?: boolean; hl?: boolean; gfx?: boolean }
export interface Cell { c: number; text: string; v?: string; ov?: boolean; cs?: number; rs?: number; ro?: boolean; bold?: boolean; shaded?: boolean }
export interface TableBlock { k: "t"; i: number; ncols: number; rows: { r: number; cells: Cell[] }[] }
export type Block = ParaBlock | TableBlock | { k: "x"; i: number };
export interface WpHeader { client: string; task: string; period: string; Prepared?: [string, string | null]; Reviewed?: [string, string | null]; Approved?: [string, string | null] }
export interface WorkingPaper { wp: { id: string; code: string; title: string; chapter: number; chapter_name: string }; status: WpStatus; locked: boolean; placeholders: number; header: WpHeader; signoffs: Signoffs; blocks: Block[] }
export interface LogEntry { ts: string; wp_id: string | null; action: string; detail: string }
export const PLACEHOLDER_RE = /\b2[xX]{2}\d?\b|\b20[xX]{2}\b|\bXYZ\b|\bABC\b|…{2,}|\.{6,}|_{3,}|\{[^}]*\}/;
export function nextStage(status: WpStatus): Stage | null {
  if (status === "not_started" || status === "draft") return "prepared";
  if (status === "prepared") return "reviewed";
  if (status === "reviewed") return "approved";
  return null;
}
export const STAGE_ROLE: Record<Stage, Role> = { prepared: "C", reviewed: "T", approved: "A" };
export interface ClauseItem { id: string; title: string; text: string; on: boolean }
export interface ClauseSection { id: string; title: string; slot: string; items: ClauseItem[] }
export interface ClauseLib { mrl: ClauseSection[]; proposal: ClauseSection[] }
export interface Overview { clients: number; awaiting_review: number; approved: number; total_papers: number; documents_this_month: number; due: { id: number; client_name: string; due_date: string; days: number }[] }
export interface SearchResult { engagements: { id: number; client_name: string; task: string; fy_end: string }[]; documents: { id: number; engagement_id: number; title: string; template: string; client_name: string; updated: string }[] }
export interface DocCheck { blanks: number; tokens: number; where: string[] }
