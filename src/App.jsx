import { useState, useEffect, useRef } from "react";
import Dashboard from "./pages/Dashboard";
import ScoreEntry from "./pages/ScoreEntry";
import Settlement from "./pages/Settlement";
import Export from "./pages/Export";
import Admin from "./pages/Admin";
import { TOURNAMENT } from "./lib/gameData";
import "./index.css";

const TABS = [
  { id: "dashboard",  label: "Dashboard" },
  { id: "scores",     label: "Enter Scores" },
  { id: "settlement", label: "Settlement" },
  { id: "export",     label: "Export" },
  { id: "admin",      label: "Admin" },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const tabRef = useRef(tab);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  const [refresh, setRefresh] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const bump = () => setRefresh(r => r+1);

  // Handle browser back/forward (including iOS swipe-back). We keep tab state
  // in history.state so back navigates between tabs instead of leaving the app —
  // which is what people expect from a PWA. A guard entry sits before the
  // initial tab so the very first back-swipe just re-seeds the guard rather
  // than closing the app.
  useEffect(() => {
    if (!window.history.state?.__harlan) {
      window.history.replaceState({ __harlan: "guard" }, "");
      window.history.pushState({ __harlan: true, __tab: "dashboard" }, "");
    }
    const onPop = e => {
      const st = e.state;
      if (st?.__harlan === "guard") {
        // user swiped back off the initial tab — push them back onto it
        window.history.pushState({ __harlan: true, __tab: tabRef.current }, "");
        return;
      }
      if (st?.__tab) setTab(st.__tab);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (nextTab) => {
    if (nextTab === tab) return;
    window.history.pushState({ __harlan: true, __tab: nextTab }, "");
    setTab(nextTab);
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    bump();
    // brief visual feedback — the actual reload is instant via component remount
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <div className="top-bar-logo">{TOURNAMENT.name} {TOURNAMENT.year}</div>
          <div className="top-bar-sub">{TOURNAMENT.edition} · {TOURNAMENT.location} · {TOURNAMENT.dates}</div>
        </div>
        <button
          className="refresh-btn"
          onClick={handleRefresh}
          aria-label="Refresh"
          title="Refresh"
          disabled={refreshing}>
          <span className={refreshing ? "refresh-icon spinning" : "refresh-icon"}>↻</span>
        </button>
      </header>
      <nav className="nav-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`nav-tab${tab===t.id?" active":""}`} onClick={()=>navigate(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="page">
        {tab==="dashboard"  && <Dashboard  key={refresh} onNavigate={navigate} />}
        {tab==="scores"     && <ScoreEntry key={refresh} onSave={bump} />}
        {tab==="settlement" && <Settlement key={refresh} />}
        {tab==="export"     && <Export     key={refresh} />}
        {tab==="admin"      && <Admin      key={refresh} onSave={bump} />}
      </main>
    </div>
  );
}
