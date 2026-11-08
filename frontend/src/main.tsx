import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, RouterProvider, createHashHistory, createRootRoute, createRoute, createRouter, Link } from "@tanstack/react-router";
import "./styles.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Shell } from "@/components/Shell";
import { SearchPage } from "@/pages/SearchPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { LockScreen } from "@/pages/LockScreen";
import { applyTheme, loadTheme } from "@/lib/theme";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EngagementsPage } from "@/pages/EngagementsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { EditorPage } from "@/pages/EditorPage";
import { LogPage } from "@/pages/LogPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { DocumentsPage } from "@/pages/DocumentsPage";
import { DocEditorPage } from "@/pages/DocEditorPage";
import { ClausesPage } from "@/pages/ClausesPage";
import { HelpPage } from "@/pages/HelpPage";
import { FirmPage } from "@/pages/FirmPage";
import { api } from "@/lib/api";

applyTheme(loadTheme());
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 0 } } });

function Root() {
  // heartbeat: lets the Python launcher close itself when this window is closed
  useEffect(() => { api.ping(); const t = window.setInterval(api.ping, 8000); return () => window.clearInterval(t); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <Gate />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function Gate() {
  const qc = useQueryClient();
  const ls = useQuery({ queryKey: ["lock"], queryFn: api.lockStatus });
  if (ls.isLoading) return <main className="p-10 text-muted-foreground">Loading…</main>;
  if (ls.data && ls.data.enabled && !ls.data.unlocked) return <LockScreen onUnlocked={() => qc.invalidateQueries()} />;
  return <Shell />;
}

const rootRoute = createRootRoute({
  component: Root,
  notFoundComponent: () => (<main className="p-10 text-center"><p className="mb-3">Page not found.</p><Link to="/" className="text-accent underline">Back to engagements</Link></main>),
  errorComponent: ({ error }) => (<main className="p-10 text-destructive">Something went wrong: {(error as Error).message}</main>),
});
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: EngagementsPage });
const engRoute = createRoute({ getParentRoute: () => rootRoute, path: "/e/$id", component: function R() { const { id } = engRoute.useParams(); return <Outlet key={id} />; } });
const dashRoute = createRoute({ getParentRoute: () => engRoute, path: "/", component: function R() { return <DashboardPage id={dashRoute.useParams().id} />; } });
const logRoute = createRoute({ getParentRoute: () => engRoute, path: "/log", component: function R() { return <LogPage id={logRoute.useParams().id} />; } });
const wpRoute = createRoute({ getParentRoute: () => engRoute, path: "/wp/$wp", component: function R() { const p = wpRoute.useParams(); return <EditorPage key={p.wp} id={p.id} wpId={p.wp} />; } });

const firmRoute = createRoute({ getParentRoute: () => rootRoute, path: "/firm", component: FirmPage });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage });
const searchRoute = createRoute({ getParentRoute: () => rootRoute, path: "/search/$q", component: function R() { const { q } = searchRoute.useParams(); return <SearchPage key={q} q={q} />; } });
const clausesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/clauses", component: ClausesPage });
const helpRoute = createRoute({ getParentRoute: () => rootRoute, path: "/help", component: HelpPage });
const profileRoute = createRoute({ getParentRoute: () => engRoute, path: "/profile", component: function R() { return <ProfilePage id={profileRoute.useParams().id} />; } });
const docsRoute = createRoute({ getParentRoute: () => engRoute, path: "/docs", component: function R() { return <DocumentsPage id={docsRoute.useParams().id} />; } });
const docRoute = createRoute({ getParentRoute: () => engRoute, path: "/docs/$did", component: function R() { const p = docRoute.useParams(); return <DocEditorPage key={p.did} id={p.id} did={p.did} />; } });

const routeTree = rootRoute.addChildren([indexRoute, firmRoute, clausesRoute, helpRoute, settingsRoute, searchRoute, engRoute.addChildren([dashRoute, logRoute, wpRoute, profileRoute, docsRoute, docRoute])]);
const router = createRouter({ routeTree, history: createHashHistory() });
declare module "@tanstack/react-router" { interface Register { router: typeof router } }

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>);
