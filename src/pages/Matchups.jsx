import { useState, useEffect } from "react";
import { COURSES, COURSE_KEYS, courseHandicap } from "../lib/gameData";
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

  const course = COURSES[courseKey];
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

  async function handleSave() {
    setSaving(true);
    for (const m of matches) await saveMatchup(courseKey, m.index, m.team1, m.team2);
    setSaving(false); setSaved(true);
    onSave?.();
  }

  const isSingles = courseKey === "frostCreek";

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
            <div style={{flex:1,display:"flex",alignItems:"flex-end"}}>
              <span style={{fontSize:"0.8rem",color:"var(--gray-400)",paddingBottom:"0.45rem"}}>
                {course.tees} Tees · Rating {course.rating} · Slope {course.slope}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-2">
        <div className="card-header">
          <h2>{isSingles?"Singles Matches":"Best Ball Pairings"} — {course.name}</h2>
          <span className="badge">{isSingles?"6 Matches · 1 Pt Each":"3 Matches · 1 Pt Each"}</span>
        </div>
        <div className="card-body">
          {matches.map((m,mi) => {
            const used = new Set([
              ...matches.filter((_,x)=>x!==mi).flatMap(mm=>[...(mm.team1||[]),...(mm.team2||[])]).filter(Boolean)
            ]);
            return (
              <div key={mi} className="match-card">
                <div className="match-card-header">
                  <span style={{fontFamily:"var(--font-body)",fontWeight:700,fontSize:"0.85rem",color:"var(--gray-600)",letterSpacing:"0.04em",textTransform:"uppercase"}}>Match {mi+1}</span>
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
                        {team1Players.map(p=>{
                          const ch = courseHandicap(ghinOverrides[p.id]??p.ghin, course.slope);
                          return (
                            <option key={p.id} value={p.id} disabled={used.has(p.id)&&pid!==p.id}>
                              {p.name} (CH {ch})
                            </option>
                          );
                        })}
                      </select>
                    ))}
                  </div>
                  <div style={{fontFamily:"var(--font-body)",fontSize:"0.85rem",fontWeight:700,color:"var(--gray-400)",letterSpacing:"0.1em",textAlign:"center"}}>VS</div>
                  {/* Team 2 */}
                  <div style={{display:"flex",flexDirection:"column",gap:"0.4rem"}}>
                    <div className="tag tag-team2" style={{marginBottom:"0.25rem",display:"inline-block",width:"fit-content"}}>{teams[2].name}</div>
                    {(m.team2||[]).map((pid,si)=>(
                      <select key={si} className="form-select" value={pid||""}
                        onChange={e=>setSlot(mi,"team2",si,e.target.value)}>
                        <option value="">— Select player —</option>
                        {team2Players.map(p=>{
                          const ch = courseHandicap(ghinOverrides[p.id]??p.ghin, course.slope);
                          return (
                            <option key={p.id} value={p.id} disabled={used.has(p.id)&&pid!==p.id}>
                              {p.name} (CH {ch})
                            </option>
                          );
                        })}
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
    </div>
  );
}
