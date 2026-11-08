// Appearance: light / dark and an accent colour. Stored per computer in the app's own browser profile.
export const ACCENTS: Record<string, { label: string; primary: string; accent: string; dark: [string, string] }> = {
  navy: { label: "Navy & teal", primary: "oklch(0.33 0.08 252)", accent: "oklch(0.5 0.085 225)", dark: ["oklch(0.68 0.11 250)", "oklch(0.62 0.1 215)"] },
  violet: { label: "Violet", primary: "oklch(0.37 0.14 295)", accent: "oklch(0.52 0.18 300)", dark: ["oklch(0.7 0.14 295)", "oklch(0.64 0.17 300)"] },
  crimson: { label: "Crimson", primary: "oklch(0.38 0.14 15)", accent: "oklch(0.52 0.19 20)", dark: ["oklch(0.7 0.14 15)", "oklch(0.66 0.17 22)"] },
  forest: { label: "Forest", primary: "oklch(0.36 0.08 160)", accent: "oklch(0.5 0.12 155)", dark: ["oklch(0.7 0.1 160)", "oklch(0.64 0.12 155)"] },
  amber: { label: "Amber", primary: "oklch(0.4 0.09 60)", accent: "oklch(0.58 0.14 55)", dark: ["oklch(0.74 0.11 65)", "oklch(0.7 0.14 55)"] },
};
export interface Theme { mode: "light" | "dark"; accent: string }
const KEY = "wpp-theme";
export function loadTheme(): Theme {
  try { const t = JSON.parse(localStorage.getItem(KEY) || "null"); if (t && ACCENTS[t.accent]) return t; } catch { /* ignore */ }
  return { mode: "light", accent: "navy" };
}
export function applyTheme(t: Theme) {
  const root = document.documentElement, a = ACCENTS[t.accent] ?? ACCENTS.navy, dark = t.mode === "dark";
  root.classList.toggle("dark", dark);
  const [p, ac] = dark ? a.dark : [a.primary, a.accent];
  root.style.setProperty("--primary", p); root.style.setProperty("--accent", ac); root.style.setProperty("--ring", ac);
  root.style.setProperty("--primary-foreground", dark ? "oklch(0.16 0.02 250)" : "oklch(0.98 0.005 240)");
  root.style.setProperty("--accent-foreground", dark ? "oklch(0.16 0.02 250)" : "oklch(0.98 0.005 240)");
}
export function saveTheme(t: Theme) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* ignore */ } applyTheme(t); }
