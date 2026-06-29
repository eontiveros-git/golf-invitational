import { useState, useEffect } from "react";
import { COURSES, COURSE_KEYS } from "../lib/gameData";
import { getMatchups, saveMatchup } from "../lib/supabase";
import { useAppData } from "../lib/useAppData";

function getMatchTemplate(courseKey) {
  if (courseKey === "frostCreek") return Array.from({length:6},(_,i)=>({index:i,type:"singles",team1:[null],team2:[null]}));
  return Array.from({length:3},(_,i)=>({index:i,type:"bestball",team1:[null,null],team2:[null,null]}));
}

export default function Matchups({ onSave }) {
  const { teams, players, ghinOverrides } = useAppData();
  const [courseKey, setCourseKey] = useState("bearDance");
  const [matches, setMatches]     = useState(getMatchTemplate("bearDance"));
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    async function load() {
      setMatches(getMatchTemplate(courseKey));
      const all = await getMatchups();
      const forCourse = all.filter(m=>m.course_key===courseKey);
      if (forCourse.length > 0) {
        const tpl = getMatchTemplate(courseKey);
        forCourse.forEach(m => {
          if (tpl[m.match_index]) {
            tpl[m.match_index].team1 = m.team1_players;
            tpl[m.match_index].team2 = m.team2_players;
          }
        });
        setMatches(tpl);
      }
      setSaved(false);
    }
    load();
  }, [courseKey]);

  const team1Players = players.filter(p=>p.team===1);
  const team2Players = players.filter(p=>p.team===2);

  function setSlot(matchIdx, side, slotIdx, playerId) {
    setMatches(prev => prev.map((m,i) => {
      if (i !== matchIdx) return m;
      const arr = [...(m[side]||[])];
      arr[slotIdx] = playerId || null;
      return {...m, [side]: arr};
    }));
    setSaved(false);
  }

  // Collect all assigned player ids except current slot
  function getUsed(matchIdx, side, slotIdx) {
    const used = new Set();
    matches.forEach((m,mi) => {
      [...(m.team1||[]), ...(m.team2||[])].forEach((id, si) => {
        if (!id) return;
        const isCurrent = mi===matchIdx && ((side==="team1" && m.team1?.[slotIdx]===id && si===slotIdx) || (side==="team2" && m.team2?.[slotIdx]===id && si===slotIdx));
        if (!isCurrent) used.add(id);
      });
    });
    return used;
  }

  async function handleSave() {
    setSaving(true);
    for (const m of matches) await saveMatchup(courseKey, m.index, m.team1, m.team2);
    setSaving(false); setSaved(true);
    onSave?.();
  }

  const isSingles = courseKey === "frostCreek";
  const course = COURSES[courseKey];

  return (
    <div>
      <div className="card mb-2">
        <div className="card-body">
          <div className="form-row" style={{marginBottom:0}}>
            <div className="form-group">
              <label className="form-label">Round</label>
              <select className="form-select" value={courseKey} onChange={e=>setCourseKey(e.target.value)}>
                {COURSE_KEYS.map(ck=>(
                  <option key={ck} value={ck}>{COURSES[ck].name} — {COURSES[ck].day}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-2">
        <div className="card-header">
          <h2>{isSingles?"Singles Matches":"Best Ball Pairings"} — {course.name}</h2>
          <span className="badge">{isSingles?"6 Pts Each":"3 Pts Each"}</span>
        </div>
        <div className="card-body">
          {matches.map((m,mi) => {
            const used = new Set([
              ...matches.filter((_,x)=>x!==mi).flatMap(mm=>[...(mm.team1||[]),...(mm.team2||[])]).filter(Boolean)
            ]);
            return (
              <div key={mi} className="match-card">
                <div className="match-card-header">
                  <span style={{fontFamily:"var(--font-display)",fontSize:"1rem",color:"var(--gray-600)"}}>Match {mi+1}</span>
                  <span style={{fontSize:"0.75rem",color:"var(--gray-400)"}}>
                    {isSingles?"Singles · 6 Ryder Cup points":`Best Ball · ${teams[1].name} vs ${teams[2].name}`}
                  </span>
                </div>
                <div style={{padding:"0.75rem",display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:"0.75rem",alignItems:"center"}}>
                  {/* Team 1 */}
                  <div style={{display:"flex",flexDirection:"column",gap:"0.4rem"}}>
                    <div className="tag tag-team1" style={{marginBottom:"0.25rem",display:"inline-block",width:"fit-content"}}>{teams[1].name}</div>
                    {(m.team1||[]).map((pid,si)=>(
                      <select key={si} className="form-select" value={pid||""}
                        onChange={e=>setSlot(mi,"team1",si,e.target.value)}>
                        <option value="">— Select player —</option>
                        {team1Players.map(p=>(
                          <option key={p.id} value={p.id} disabled={used.has(p.id)&&pid!==p.id}>
                            {p.name} (GHIN {(ghinOverrides[p.id]??p.ghin).toFixed(1)})
                          </option>
                        ))}
                      </select>
                    ))}
                  </div>
                  <div style={{fontFamily:"var(--font-display)",fontSize:"1.4rem",color:"var(--gray-400)",textAlign:"center"}}>VS</div>
                  {/* Team 2 */}
                  <div style={{display:"flex",flexDirection:"column",gap:"0.4rem"}}>
                    <div className="tag tag-team2" style={{marginBottom:"0.25rem",display:"inline-block",width:"fit-content"}}>{teams[2].name}</div>
                    {(m.team2||[]).map((pid,si)=>(
                      <select key={si} className="form-select" value={pid||""}
                        onChange={e=>setSlot(mi,"team2",si,e.target.value)}>
                        <option value="">— Select player —</option>
                        {team2Players.map(p=>(
                          <option key={p.id} value={p.id} disabled={used.has(p.id)&&pid!==p.id}>
                            {p.name} (GHIN {(ghinOverrides[p.id]??p.ghin).toFixed(1)})
                          </option>
                        ))}
                      </select>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{marginTop:"0.75rem",display:"flex",gap:"0.5rem",alignItems:"center"}}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving?"Saving…":saved?"✓ Saved":"Save Matchups"}
            </button>
            {saved && <span className="text-muted">Matchups saved</span>}
          </div>
        </div>
      </div>

      {/* Handicap Reference */}
      <div className="card">
        <div className="card-header"><h2>Handicap Reference</h2><span className="badge">{course.name}</span></div>
        <div className="card-body" style={{padding:0}}>
          <table className="leaderboard">
            <thead><tr><th>Player</th><th>Team</th><th>GHIN</th><th>Course Hdcp</th></tr></thead>
            <tbody>
              {players.map(p => {
                const ghin = ghinOverrides[p.id]??p.ghin;
                const ch = Math.round(ghin * (course.slope/113));
                return (
                  <tr key={p.id}>
                    <td style={{fontWeight:600}}>{p.name}</td>
                    <td><span className={`tag tag-team${p.team}`}>{teams[p.team]?.name}</span></td>
                    <td className="text-mono">{ghin}</td>
                    <td className="text-mono" style={{fontWeight:700}}>{ch}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
