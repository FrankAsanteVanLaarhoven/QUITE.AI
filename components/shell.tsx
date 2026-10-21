"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { ConsoleStateProvider, useConsole } from "@/components/state";

type User = { name: string; email: string; role: string; workspace: string };

const NAV = [
  { href: "/overview", label: "Overview" },
  { href: "/requests", label: "Requests" },
  { href: "/chat", label: "Chat" },
  { href: "/approvals", label: "Approvals" },
  { href: "/policies", label: "Policies" },
  { href: "/teams", label: "Teams" },
  { href: "/people", label: "People" },
  { href: "/budgets", label: "Budgets" },
  { href: "/credits", label: "Credits" },
  { href: "/models", label: "Models" },
  { href: "/audit", label: "Audit" },
];

const UserContext = createContext<User | null>(null);

export function useWorkspaceUser(): User {
  const value = useContext(UserContext);
  if (!value) throw new Error("Workspace user is missing.");
  return value;
}

export function Shell({ user, environment, children }: { user: User; environment: string; children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <UserContext.Provider value={user}>
        <ConsoleStateProvider>
          <Frame user={user} environment={environment}>
            {children}
          </Frame>
        </ConsoleStateProvider>
      </UserContext.Provider>
    </QueryClientProvider>
  );
}

function Frame({ user, environment, children }: { user: User; environment: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { panel, commands, contextOpen, setContextOpen, navOpen, setNavOpen } = useConsole();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [navPinned, setNavPinned] = useState(false);
  const [navHover, setNavHover] = useState(false);
  const [contextPinned, setContextPinned] = useState(false);
  const [contextHover, setContextHover] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const approvals = useQuery({
    queryKey: ["approvals"],
    queryFn: () => api<{ approvals: unknown[] }>("/api/approvals"),
    refetchInterval: 15000,
  });
  const waiting = approvals.data?.approvals.length ?? 0;
  const navExpanded = navOpen || navPinned || (canHover && navHover);
  const contextExpanded = contextOpen || contextPinned || (canHover && contextHover);

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 761px)");
    const apply = () => setCanHover(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(true);
        return;
      }
      if (typing) return;
      if (event.key === "?") setHelp(true);
      if (event.key === "Escape") {
        setPalette(false);
        setHelp(false);
        setContextOpen(false);
        setNavOpen(false);
        setNavPinned(false);
        setContextPinned(false);
        setNavHover(false);
        setContextHover(false);
      }
      if (event.key.toLowerCase() === "a") commands.accept?.();
      if (event.key.toLowerCase() === "p") commands.premium?.();
      if (event.key.toLowerCase() === "w") commands.pin?.();
      if (event.key.toLowerCase() === "y") commands.approve?.();
      if (event.key.toLowerCase() === "n") commands.reject?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commands, setContextOpen, setNavOpen]);

  async function switchEnv(next: string) {
    await api("/api/environment", { method: "POST", body: JSON.stringify({ environment: next }) });
    router.refresh();
    window.location.reload();
  }

  return (
    <div className="shell">
      <a className="skip" href="#content">Skip to content</a>
      <aside
        className="sidebar"
        data-open={navOpen ? "true" : "false"}
        data-expanded={navExpanded ? "true" : "false"}
        aria-label="Workspace"
        onMouseEnter={() => { if (canHover) setNavHover(true); }}
        onMouseLeave={() => setNavHover(false)}
      >
        <div className="sidebar-panel">
          <div className="brand">
            <button className="rail-toggle" type="button" aria-expanded={navPinned} aria-label={navPinned ? "Collapse workspace" : "Pin workspace open"} onClick={() => setNavPinned((value) => !value)}>
              <Mark />
            </button>
            <div className="brand-copy">
              <strong>Quiet</strong>
              <span>{user.workspace}</span>
            </div>
          </div>
          <button className="search-btn" onClick={() => setPalette(true)} aria-label="Search or jump">
            <span className="search-copy">Search or jump</span> <span className="mono">⌘K</span>
          </button>
          <nav className="nav" aria-label="Primary">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} aria-label={item.label} aria-current={pathname === item.href ? "page" : undefined} onClick={() => setNavOpen(false)}>
                <span className="rail-mark" aria-hidden="true">{item.label.slice(0, 1)}</span>
                <span className="rail-label">{item.label}</span>
                {item.href === "/approvals" && waiting > 0 ? <span className="count">{waiting}</span> : null}
              </Link>
            ))}
          </nav>
          <div className="env-block">
            <div className="label" style={{ padding: "0 8px 8px" }}>Environment</div>
            <div className="env" role="group" aria-label="Environment">
              {["production", "staging"].map((item) => (
                <button key={item} type="button" aria-pressed={environment === item} onClick={() => switchEnv(item)}>
                  {item === "production" ? "Production" : "Staging"}
                </button>
              ))}
            </div>
          </div>
          <div className="user">
            <div className="brand-copy">
              <strong>{user.name}</strong>
              <div className="faint">{user.role}</div>
            </div>
            <form action="/api/auth/logout" method="post">
              <button className="btn" type="submit" aria-label="Sign out"><span className="rail-mark" aria-hidden="true">Out</span><span className="rail-label">Sign out</span></button>
            </form>
          </div>
        </div>
      </aside>
      <main className="main" id="content">
        <div className="row" style={{ marginBottom: 16 }}>
          <button className="btn menu-only" type="button" onClick={() => setNavOpen(true)}>Menu</button>
          <span className="faint">{environment === "production" ? "Production" : "Staging"}</span>
          <button className="btn details-only" type="button" onClick={() => setContextOpen(true)}>Details</button>
        </div>
        {children}
      </main>
      <aside
        className="context"
        data-open={contextOpen ? "true" : "false"}
        data-expanded={contextExpanded ? "true" : "false"}
        aria-label="Decision context"
        onMouseEnter={() => { if (canHover && window.innerWidth > 1100) setContextHover(true); }}
        onMouseLeave={() => setContextHover(false)}
      >
        <div className="context-panel">
          <div className="row">
            <button className="rail-toggle context-pin" type="button" aria-expanded={contextPinned} aria-label={contextPinned ? "Collapse details" : "Pin details open"} onClick={() => { setContextPinned((value) => !value); setContextOpen(false); }}>
              <span className="rail-mark" aria-hidden="true">D</span>
              <span className="rail-label">Details</span>
            </button>
            <button className="btn details-only" type="button" onClick={() => setContextOpen(false)}>Close</button>
          </div>
          <div className="context-body">
            {panel ? (
              <>
                <h2>{panel.title}</h2>
                {panel.sections.map((section) => (
                  <section key={section.label}>
                    <div className="label">{section.label}</div>
                    <p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{section.text}</p>
                  </section>
                ))}
              </>
            ) : (
              <p className="muted">Select a decision, team, or policy to see why it is there.</p>
            )}
          </div>
        </div>
      </aside>
      {palette ? <Palette onClose={() => setPalette(false)} /> : null}
      {help ? <Help onClose={() => setHelp(false)} /> : null}
    </div>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const items = useMemo(() => NAV.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())), [query]);
  return (
    <div className="palette" role="presentation" onMouseDown={onClose}>
      <form
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          const item = items[index];
          if (!item) return;
          router.push(item.href);
          onClose();
        }}
      >
        <input
          autoFocus
          aria-label="Search pages"
          placeholder="Jump to a page"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIndex((value) => Math.min(items.length - 1, value + 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setIndex((value) => Math.max(0, value - 1));
            }
            if (event.key === "Escape") onClose();
          }}
        />
        <div role="listbox" aria-label="Pages">
          {items.map((item, itemIndex) => (
            <button key={item.href} type="button" role="option" aria-selected={itemIndex === index} onMouseEnter={() => setIndex(itemIndex)} onClick={() => { router.push(item.href); onClose(); }}>
              {item.label}
            </button>
          ))}
          {items.length === 0 ? <p className="muted" style={{ padding: 16 }}>Nothing matches. Try Overview, Requests, or Policies.</p> : null}
        </div>
      </form>
    </div>
  );
}

function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="palette" onMouseDown={onClose}>
      <div className="card" style={{ width: "min(420px, calc(100vw - 32px))" }} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-labelledby="help-title">
        <h2 id="help-title" className="section-title">Keyboard</h2>
        <p className="lede">⌘K opens the command palette. A accepts, P uses premium, W pins the workflow, Y approves, N rejects. J and K move through a list. Escape closes this layer.</p>
        <button className="btn" type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0A0A0B" stroke="rgba(255,255,255,0.14)" />
      <path d="M8 16h10" stroke="#9BB6FF" strokeWidth="1.5" />
      <circle cx="22" cy="16" r="2.2" fill="#9BB6FF" />
    </svg>
  );
}

export function ScreenState({ pending, error, onRetry, children }: { pending: boolean; error: Error | null; onRetry: () => void; children: React.ReactNode }) {
  if (pending) {
    return (
      <div className="stack" aria-busy="true" aria-live="polite">
        <p className="label">Loading the ledger</p>
        <div className="card">Quiet is reading this workspace. The figures will replace this note.</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="notice" data-tone="critical" role="alert">
        <strong>Quiet could not load this view.</strong>
        <p>{error.message}</p>
        <button className="btn" type="button" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  return children;
}
