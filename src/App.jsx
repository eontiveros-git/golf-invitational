import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import ScoreEntry from "./pages/ScoreEntry";
import Matchups from "./pages/Matchups";
import Results from "./pages/Results";
import Settings from "./pages/Settings";
import Export from "./pages/Export";
import Champions from "./pages/Champions";
import { TOURNAMENT } from "./lib/gameData";
import "./index.css";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "scores",    label: "Enter Scores" },
  { id: "matchups",  label: "Matchups" },
  { id: "results",   label: "Results" },
  { id: "champions", label: "Champions" },
  { id: "export",    label: "Export" },
  { id: "settings",  label: "Settings" },
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
        {tab==="dashboard" && <Dashboard key={refresh} />}
        {tab==="scores"    && <ScoreEntry onSave={bump} />}
        {tab==="matchups"  && <Matchups onSave={bump} />}
        {tab==="results"   && <Results key={refresh} />}
        {tab==="champions" && <Champions key={refresh} onSave={bump} />}
        {tab==="export"    && <Export />}
        {tab==="settings"  && <Settings onSave={bump} />}
      </main>
    </div>
  );
}
