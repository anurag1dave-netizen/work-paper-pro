import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileCheck2, Home, Library, Lock, Moon, Search, Settings2, Sun, Building2 } from "lucide-react";
import { api } from "@/lib/api";
import { applyTheme, loadTheme, saveTheme, type Theme } from "@/lib/theme";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/clauses", label: "Clause library", icon: Library },
  { to: "/firm", label: "Firm settings", icon: Building2 },
  { to: "/settings", label: "Settings & backup", icon: Settings2 },
  { to: "/help", label: "User manual", icon: BookOpen },
] as const;

export function Shell() {
  const fq = useQuery({ queryKey: ["firm"], queryFn: api.firm });
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [q, setQ] = useState("");
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const toggle = () => { const t: Theme = { ...theme, mode: theme.mode === "dark" ? "light" : "dark" }; setTheme(t); saveTheme(t); };
  useEffect(() => { applyTheme(theme); }, [theme]);
  const firm = fq.data;
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col bg-[var(--sidebar)] text-white print:hidden">
        <Link to="/" className="flex items-center gap-2.5 px-4 pb-3 pt-4">
          {firm?.logo ? <img src={firm.logo} alt="" className="h-9 w-9 rounded-md bg-white object-contain p-0.5" />
            : <span className="grid h-9 w-9 place-items-center rounded-md bg-accent text-accent-foreground"><FileCheck2 className="h-5 w-5" /></span>}
          <span className="min-w-0"><span className="block text-sm font-semibold leading-tight">Work Paper Pro</span>
            <span className="block truncate text-[11px] leading-tight opacity-75">{firm?.name || "Set up your firm"}</span></span>
        </Link>
        <form className="px-3 pb-3" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) nav({ to: "/search/$q", params: { q: q.trim() } }); }}>
          <label className="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1.5 text-xs">
            <Search className="h-3.5 w-3.5 opacity-70" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients, documents" className="w-full bg-transparent outline-none placeholder:text-white/50" />
          </label>
        </form>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map(({ to, label, icon: I }) => {
            const on = to === "/" ? path === "/" || path.startsWith("/e/") || path.startsWith("/search") : path.startsWith(to);
            return <Link key={to} to={to} className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${on ? "bg-white/20 font-semibold" : "hover:bg-white/10"}`}><I className="h-4 w-4" />{label}</Link>;
          })}
        </nav>
        <div className="space-y-2 border-t border-white/15 p-3 text-xs">
          <button onClick={toggle} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/10">
            {theme.mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{theme.mode === "dark" ? "Light mode" : "Dark mode"}</button>
          <div className="flex items-center gap-1.5 px-2 opacity-75"><Lock className="h-3 w-3" /> Local &amp; private</div>
        </div>
      </aside>
      <div className="min-w-0 flex-1"><Outlet /></div>
    </div>
  );
}
