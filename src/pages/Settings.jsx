import { useState, useEffect } from "react";
import { PLAYERS, COURSES, COURSE_KEYS, courseHandicap, TEAMS as DEFAULT_TEAMS } from "../lib/gameData";
import { getSettings, saveSettings, getCtpWinners, saveCtpWinner } from "../lib/supabase";

const PIN = "golf26";

export default function Settings({ onSave }) {
  const [unlocked, setUnlocked]     = useState(false);
  const [pinInput, setPinInput]     = useState("");
  const [pinError, setPinError]     = useState(false);
  const [handicaps, setHandicaps]   = useState({});
  const [teamNames, setTeamNames]   = useState({
    1: DEFAULT_TEAMS[1].name,
    2: DEFAULT_TEAMS[2].name,
  });
  // playerIds per team: { 1: [...], 2: [...] }
  const [teamRosters, setTeamRosters] = useState({
    1: PLAYERS.filter(p=>p.team===1).map(p=>p.id),
    2: PLAYERS.filter(p=>p.team===2).map(p=>p.id),
  });
  const [ctpCourse, setCtpCourse]   = useState("bearDance");
  const [ctpWinners, setCtpWinners] = useState([]);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [activeTab, setActiveTab]   = useState("teams");

  useEffect(() => {
    async function load() {
      const s = await getSettings();
      if (s?.handicaps) setHandicaps(s.handicaps);
      if (s?.teams) {
        setTeamNames({
          1: s.teams[1]?.name ?? DEFAULT_TEAMS[1].name,
          2: s.teams[2]?.name ?? DEFAULT_TEAMS[2].name,
        });
        setTeamRosters({
          1: s.teams[1]?.playerIds ?? PLAYERS.filter(p=>p.team===1).map(p=>p.id),
          2: s.teams[2]?.playerIds ?? PLAYERS.filter(p=>p.team===2).map(p=>p.id),
        });
      }
      const ctp = await getCtpWinners();
      setCtpWinners(ctp);
    }
    load();
  }, []);

  function tryUnlock() {
    if (pinInput === PIN) { setUnlocked(true); setPinError(false); }
    else setPinError(true);
  }

  async function handleSave() {
    setSaving(true);
    const existing = await getSettings();
    await saveSettings({
      ...existing,
      handicaps,
      teams: {
        1: { name: teamNames[1], playerIds: teamRosters[1] },
        2: { name: teamNames[2], playerIds: teamRosters[2] },
      },
    });
    setSaving(false); setSaved(true);
    onSave?.();
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleCtpSave(holeIndex, playerId) {
    await saveCtpWinner(ctpCourse, holeIndex, playerId || null);
    const updated = await getCtpWinners();
    setCtpWinners(updated);
    onSave?.();
  }

  // Toggle a player's team assignment
  function togglePlayerTeam(playerId, toTeam) {
    const otherTeam = toTeam === 1 ? 2 : 1;
    setTeamRosters(prev => ({
      ...prev,
      [toTeam]:    prev[toTeam].includes(playerId) ? prev[toTeam] : [...prev[toTeam], playerId],
      [otherTeam]: prev[otherTeam].filter(id => id !== playerId),
    }));
  }

  // Players not yet on either team
  const allAssigned = [...teamRosters[1], ...teamRosters[2]];
  const unassigned = PLAYERS.filter(p => !allAssigned.includes(p.id));

  const course = COURSES[ctpCourse];
  const par3s = course.par.map((p,i)=>({p,i})).filter(x=>x.p===3);

  if (!unlocked) {
    return (
      <div className="card" style={{maxWidth:380}}>
        <div className="card-header"><h2>Admin Access</h2></div>
        <div className="card-body">
          <p style={{fontSize:"0.85rem",color:"var(--gray-600)",marginBottom:"0.75rem"}}>
            Enter the PIN to edit teams, handicaps, CTP winners, and other settings.
          </p>
          <div style={{display:"flex",gap:"0.5rem"}}>
            <input type="password" className="form-input" placeholder="PIN" value={pinInput}
              style={{width:120}}
              onChange={e=>{ setPinInput(e.target.value); setPinError(false); }}
              onKeyDown={e=>e.key==="Enter"&&tryUnlock()} />
            <button className="btn btn-primary" onClick={tryUnlock}>Unlock</button>
          </div>
          {pinError && <p style={{color:"var(--red)",fontSize:"0.8rem",marginTop:"0.4rem"}}>Incorrect PIN.</p>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{display:"flex",gap:"0.4rem",marginBottom:"1rem",flexWrap:"wrap"}}>
        {[
          { id:"teams",     label:"Teams" },
          { id:"handicaps", label:"Handicaps" },
          { id:"ctp",       label:"CTP Winners" },
          { id:"reference", label:"Reference" },
        ].map(t=>(
          <button key={t.id} className={`btn btn-sm${activeTab===t.id?" btn-primary":" btn-ghost"}`} onClick={()=>setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TEAMS ── */}
      {activeTab === "teams" && (
        <div>
          <div className="card mb-2">
            <div className="card-header"><h2>Team Names</h2></div>
            <div className="card-body">
              <div className="grid-2">
                {[1,2].map(t=>(
                  <div key={t} style={{display:"flex",flexDirection:"column",gap:"0.4rem"}}>
                    <label className="form-label">Team {t} Name</label>
                    <input className="form-input"
                      value={teamNames[t]}
                      placeholder={`Team ${t} name`}
                      onChange={e=>setTeamNames(prev=>({...prev,[t]:e.target.value}))} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card mb-2">
            <div className="card-header"><h2>Team Rosters</h2>
              <span className="badge">Drag players between teams</span>
            </div>
            <div className="card-body">
              <p style={{fontSize:"0.82rem",color:"var(--gray-400)",marginBottom:"1rem"}}>
                Click a player's team button to move them. Each team needs 6 players.
              </p>
              <div className="grid-2" style={{marginBottom:"1rem"}}>
                {[1,2].map(t=>(
                  <div key={t}>
                    <div style={{
                      fontWeight:700, fontSize:"0.9rem", marginBottom:"0.5rem",
                      color: t===1?"var(--green-mid)":"var(--blue)",
                      borderBottom:`2px solid ${t===1?"var(--green-light)":"var(--blue)"}`,
                      paddingBottom:"0.3rem"
                    }}>
                      {teamNames[t]} ({teamRosters[t].length})
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:"0.35rem"}}>
                      {teamRosters[t].map(id=>{
                        const p = PLAYERS.find(x=>x.id===id);
                        const otherTeam = t===1?2:1;
                        return (
                          <div key={id} style={{
                            display:"flex",alignItems:"center",justifyContent:"space-between",
                            padding:"0.4rem 0.6rem",borderRadius:4,
                            background: t===1?"#e8f5ee":"#e8eef5",
                            border:`1px solid ${t===1?"var(--green-light)":"var(--blue)"}`,
                          }}>
                            <span style={{fontWeight:600,fontSize:"0.85rem"}}>{p?.name}</span>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={()=>togglePlayerTeam(id, otherTeam)}
                              title={`Move to ${teamNames[otherTeam]}`}
                              style={{fontSize:"0.7rem"}}
                            >
                              → {teamNames[otherTeam].split(" ")[0]}
                            </button>
                          </div>
                        );
                      })}
                      {teamRosters[t].length === 0 && (
                        <div style={{fontSize:"0.8rem",color:"var(--gray-400)",fontStyle:"italic",padding:"0.5rem"}}>No players assigned</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {unassigned.length > 0 && (
                <div style={{marginBottom:"1rem"}}>
                  <div style={{fontWeight:700,fontSize:"0.82rem",color:"var(--red)",marginBottom:"0.5rem"}}>
                    ⚠ Unassigned ({unassigned.length})
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem"}}>
                    {unassigned.map(p=>(
                      <div key={p.id} style={{display:"flex",gap:"0.3rem",alignItems:"center",border:"1px solid var(--gray-200)",borderRadius:4,padding:"0.3rem 0.5rem",background:"var(--gray-100)"}}>
                        <span style={{fontSize:"0.82rem",fontWeight:600}}>{p.name}</span>
                        <button className="btn btn-ghost btn-sm" onClick={()=>togglePlayerTeam(p.id,1)}>→ T1</button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>togglePlayerTeam(p.id,2)}>→ T2</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving?"Saving…":saved?"✓ Saved":"Save Teams"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── HANDICAPS ── */}
      {activeTab === "handicaps" && (
        <div className="card">
          <div className="card-header">
            <h2>GHIN Handicaps</h2>
            <span className="badge">Lock in July 20</span>
          </div>
          <div className="card-body">
            <p style={{fontSize:"0.82rem",color:"var(--gray-400)",marginBottom:"1rem"}}>
              These override the placeholder handicaps. Course handicaps are auto-calculated per course.
            </p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:"0.5rem",marginBottom:"1rem"}}>
              {PLAYERS.map(p=>{
                const val = handicaps[p.id] ?? p.ghin;
                return (
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:"0.5rem",border:"1px solid var(--gray-200)",borderRadius:5,padding:"0.5rem 0.75rem"}}>
                    <span style={{fontWeight:600,minWidth:60,fontSize:"0.85rem"}}>{p.name}</span>
                    <input type="number" step="0.1" min="0" max="54"
                      className="form-input" style={{width:70}} value={val}
                      onChange={e=>setHandicaps(prev=>({...prev,[p.id]:e.target.value}))} />
                    <span style={{fontSize:"0.72rem",color:"var(--gray-400)"}}>GHIN</span>
                  </div>
                );
              })}
            </div>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving?"Saving…":saved?"✓ Saved":"Save Handicaps"}
            </button>
          </div>
        </div>
      )}

      {/* ── CTP ── */}
      {activeTab === "ctp" && (
        <div className="card">
          <div className="card-header"><h2>Closest to Pin Winners</h2></div>
          <div className="card-body">
            <div className="form-group" style={{marginBottom:"1rem"}}>
              <label className="form-label">Course</label>
              <select className="form-select" style={{width:"auto"}} value={ctpCourse} onChange={e=>setCtpCourse(e.target.value)}>
                {COURSE_KEYS.map(ck=>(
                  <option key={ck} value={ck}>{COURSES[ck].name} — {COURSES[ck].day}</option>
                ))}
              </select>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:"0.5rem"}}>
              {par3s.map(({i})=>{
                const current = ctpWinners.find(c=>c.course_key===ctpCourse&&c.hole_index===i);
                return (
                  <div key={i} style={{border:`1px solid ${current?"var(--gold)":"var(--gray-200)"}`,borderRadius:5,padding:"0.6rem 0.75rem",background:current?"#fffbf0":""}}>
                    <div className="form-label" style={{marginBottom:"0.3rem"}}>Hole {i+1} (Par 3)</div>
                    <select className="form-select" style={{width:"100%"}} value={current?.player_id||""}
                      onChange={e=>handleCtpSave(i,e.target.value)}>
                      <option value="">— No winner yet —</option>
                      {PLAYERS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── REFERENCE ── */}
      {activeTab === "reference" && (
        <div className="card">
          <div className="card-header"><h2>Course Handicap Reference</h2></div>
          <div className="card-body" style={{padding:0}}>
            <table className="leaderboard">
              <thead>
                <tr>
                  <th>Player</th><th>Team</th><th>GHIN</th>
                  {COURSE_KEYS.map(ck=><th key={ck}>{COURSES[ck].name.split(" ")[0]}</th>)}
                </tr>
              </thead>
              <tbody>
                {PLAYERS.map(p=>{
                  const ghin = parseFloat(handicaps[p.id]??p.ghin);
                  const inT1 = teamRosters[1].includes(p.id);
                  const inT2 = teamRosters[2].includes(p.id);
                  const tNum = inT1?1:inT2?2:null;
                  return (
                    <tr key={p.id}>
                      <td style={{fontWeight:600}}>{p.name}</td>
                      <td>{tNum ? <span className={`tag tag-team${tNum}`}>{teamNames[tNum]}</span> : <span style={{color:"var(--gray-400)"}}>—</span>}</td>
                      <td className="text-mono">{ghin}</td>
                      {COURSE_KEYS.map(ck=>(
                        <td key={ck} className="text-mono">{courseHandicap(ghin, COURSES[ck].slope)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
