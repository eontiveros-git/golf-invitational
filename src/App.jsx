import { useState } from "react";
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
  const [refresh, setRefresh] = useState(0);
  const bump = () => setRefresh(r => r+1);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <div className="top-bar-logo">{TOURNAMENT.name} {TOURNAMENT.year}</div>
          <div className="top-bar-sub">{TOURNAMENT.edition} · {TOURNAMENT.location} · {TOURNAMENT.dates}</div>
        </div>
      </header>
      <nav className="nav-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`nav-tab${tab===t.id?" active":""}`} onClick={()=>setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="page">
        {tab==="dashboard"  && <Dashboard  key={refresh} onNavigate={setTab} />}
        {tab==="scores"     && <ScoreEntry onSave={bump} />}
        {tab==="settlement" && <Settlement key={refresh} />}
        {tab==="export"     && <Export />}
        {tab==="admin"      && <Admin      onSave={bump} />}
      </main>
    </div>
  );
}
