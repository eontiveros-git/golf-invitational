import { useState, useEffect, useRef } from "react";
import { COURSES, COURSE_KEYS, courseHandicap, strokesPerHole } from "../lib/gameData";
import { getRounds, saveRound, deleteRound, getSettings } from "../lib/supabase";
import { getRoundTotals } from "../lib/scoring";
import { useAppData } from "../lib/useAppData";

function scoreClass(score, par) {
  const d = score - par;
  if (d <= -2) return "eagle";
  if (d === -1) return "birdie";
  if (d === 1)  return "bogey";
  if (d >= 2)   return "double";
  return "";
}

const NUMPAD = [1,2,3,4,5,6,7,8,9,10,11,12];

export default function ScoreEntry({ onSave }) {
  const { players, ghinOverrides: appGhinOverrides } = useAppData();
  const [courseKey, setCourseKey] = useState("bearDance");
  const [scores, setScores]   = useState({}); // { playerId: [18 values] }
  const [saved, setSaved]     = useState({}); // { playerId: true }
  const [saving, setSaving]   = useState(null);
  const [ghinOverrides, setGhinOverrides] = useState({});
  const [activePlayer, setActivePlayer] = useState(null);
  const [mode, setMode] = useState("quick"); // "quick" | "full"
  const [activeHole, setActiveHole] = useState(0);
  const [flashSaved, setFlashSaved] = useState(false);
  const saveTimer = useRef(null);

  const course = COURSES[courseKey];

  useEffect(() => {
    if (players.length && !activePlayer) setActivePlayer(players[0].id);
  }, [players]);

  useEffect(() => {
    async function load() {
      const [allRounds, s] = await Promise.all([getRounds(), getSettings()]);
      const courseRounds = allRounds.filter(r => r.course_key === courseKey);
      const loaded = {};
      const savedMap = {};
      courseRounds.forEach(r => {
        loaded[r.player_id] = [...r.gross_scores];
        savedMap[r.player_id] = true;
      });
      setScores(loaded);
      setSaved(savedMap);
      setActiveHole(0);
      if (s?.handicaps) {
        const ov = {};
        Object.entries(s.handicaps).forEach(([id,v]) => { if (v!==null&&v!=="") ov[id]=parseFloat(v); });
        setGhinOverrides(ov);
      }
    }
    load();
  }, [courseKey]);

  function getScore(pid, hole) {
    return scores[pid]?.[hole] ?? "";
  }
  function setScoreLocal(pid, hole, val) {
    const v = val === "" || val === null ? null : parseInt(val, 10);
    setScores(prev => {
      const arr = prev[pid] ? [...prev[pid]] : new Array(18).fill(null);
      arr[hole] = v;
      return { ...prev, [pid]: arr };
    });
    setSaved(prev => ({ ...prev, [pid]: false }));
  }

  // Quick mode: auto-saves with debounce whenever all 18 holes are filled,
  // and allows partial save (saves whatever is entered, backfilling nulls won't write until complete)
  async function autoSave(pid, arr) {
    const complete = arr.length === 18 && arr.every(v => v !== null && v !== undefined && !isNaN(v));
    if (!complete) return;
    setSaving(pid);
    await saveRound(courseKey, pid, arr.map(Number));
    setSaved(prev => ({ ...prev, [pid]: true }));
    setSaving(null);
    setFlashSaved(true);
    setTimeout(()=>setFlashSaved(false), 1200);
    onSave?.();
  }

  function tapScore(pid, hole, val) {
    setScoreLocal(pid, hole, val);
    setScores(prev => {
      const arr = prev[pid] ? [...prev[pid]] : new Array(18).fill(null);
      // re-read after local update by recomputing here
      const updated = [...arr];
      updated[hole] = val;
      // debounce auto-save
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(()=>autoSave(pid, updated), 400);
      return { ...prev, [pid]: updated };
    });
    // auto-advance to next hole
    if (hole < 17) setActiveHole(hole+1);
  }

  async function handleSaveFull(pid) {
    const arr = scores[pid];
    if (!arr || arr.some(v => v === null || v === undefined || isNaN(v))) {
      alert("Please enter all 18 scores before saving.");
      return;
    }
    setSaving(pid);
    await saveRound(courseKey, pid, arr.map(Number));
    setSaved(prev => ({ ...prev, [pid]: true }));
    setSaving(null);
    onSave?.();
  }

  async function handleDelete(pid) {
    if (!confirm(`Remove ${players.find(p=>p.id===pid)?.name}'s ${course.name} round?`)) return;
    await deleteRound(courseKey, pid);
    setScores(prev => { const n={...prev}; delete n[pid]; return n; });
    setSaved(prev => { const n={...prev}; delete n[pid]; return n; });
    onSave?.();
  }

  if (!activePlayer) return <div className="spinner"/>;

  const player = players.find(p=>p.id===activePlayer);
  const ch = courseHandicap(ghinOverrides[activePlayer] ?? player.ghin, course.slope);
  const strokes = strokesPerHole(ch, course.hdcp);
  const playerScores = scores[activePlayer];
  const allFilled = playerScores && playerScores.length === 18 && playerScores.every(v => v !== null && !isNaN(v));

  const frontPar  = course.par.slice(0,9).reduce((a,b)=>a+b,0);
  const backPar   = course.par.slice(9).reduce((a,b)=>a+b,0);
  const frontGross = playerScores ? playerScores.slice(0,9).reduce((a,b)=>a+(b||0),0) : null;
  const backGross  = playerScores ? playerScores.slice(9).reduce((a,b)=>a+(b||0),0) : null;
  const totals = (allFilled && playerScores) ? getRoundTotals(courseKey, activePlayer, playerScores, ghinOverrides) : null;

  const currentVal = getScore(activePlayer, activeHole);
  const currentPar = course.par[activeHole];
  const currentStrokes = strokes[activeHole];

  // count filled holes for active player
  const filledCount = (playerScores||[]).filter(v=>v!==null&&v!==undefined&&!isNaN(v)).length;

  return (
    <div>
      {/* Course + mode selector */}
      <div className="card mb-2">
        <div className="card-body">
          <div className="form-row" style={{marginBottom:"0.5rem"}}>
            <div className="form-group">
              <label className="form-label">Course</label>
              <select className="form-select" value={courseKey} onChange={e=>setCourseKey(e.target.value)}>
                {COURSE_KEYS.map(ck => (
                  <option key={ck} value={ck}>{COURSES[ck].name} — {COURSES[ck].day}</option>
                ))}
              </select>
            </div>
            <div style={{flex:1,display:"flex",alignItems:"flex-end",gap:"0.5rem",flexWrap:"wrap"}}>
              <span style={{fontSize:"0.8rem",color:"var(--gray-400)",paddingBottom:"0.45rem"}}>
                {course.tees} Tees · Rating {course.rating} · Slope {course.slope}
              </span>
            </div>
          </div>
          <div style={{display:"flex",gap:"0.4rem"}}>
            <button className={`btn btn-sm${mode==="quick"?" btn-primary":" btn-ghost"}`} onClick={()=>setMode("quick")}>
              ⚡ Quick Entry
            </button>
            <button className={`btn btn-sm${mode==="full"?" btn-primary":" btn-ghost"}`} onClick={()=>setMode("full")}>
              📋 Full Scorecard
            </button>
          </div>
        </div>
      </div>

      {/* Player pills */}
      <div className="card mb-2">
        <div className="card-header"><h2>{course.name}</h2></div>
        <div className="card-body">
          <div style={{display:"flex",flexWrap:"wrap",gap:"0.4rem",marginBottom:"1rem"}}>
            {players.map(p => {
              const isSaved = saved[p.id];
              const isActive = p.id === activePlayer;
              const count = (scores[p.id]||[]).filter(v=>v!==null&&v!==undefined&&!isNaN(v)).length;
              return (
                <button
                  key={p.id}
                  onClick={() => { setActivePlayer(p.id); setActiveHole(0); }}
                  className="btn btn-sm"
                  style={{
                    background: isActive ? "var(--green-mid)" : isSaved ? "#e8f5ee" : count>0 ? "#fff9e6" : "var(--gray-100)",
                    color: isActive ? "#fff" : isSaved ? "var(--green-mid)" : "var(--gray-800)",
                    border: isActive ? "none" : `1px solid ${isSaved?"var(--green-mid)":count>0?"var(--gold)":"var(--gray-200)"}`,
                    fontWeight: 600,
                  }}
                >
                  {isSaved ? "✓ " : count>0 ? `${count}/18 ` : ""}{p.name}
                </button>
              );
            })}
          </div>

          <div style={{display:"flex",alignItems:"center",gap:"0.75rem",flexWrap:"wrap",marginBottom:"0.75rem"}}>
            <span style={{fontWeight:700,fontSize:"1rem"}}>{player.name}</span>
            <span className={`tag tag-team${player.team}`}>CH {ch}</span>
            {totals && (
              <>
                <span className="text-mono" style={{fontSize:"0.85rem"}}>Gross: <strong>{totals.gross}</strong></span>
                <span className="text-mono" style={{fontSize:"0.85rem"}}>Net: <strong>{totals.net}</strong></span>
              </>
            )}
            {flashSaved && <span style={{fontSize:"0.78rem",color:"var(--green-mid)",fontWeight:700}}>✓ Saved</span>}
          </div>

          {/* ── QUICK MODE ── */}
          {mode === "quick" && (
            <div>
              {/* Hole strip */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(9,1fr)",gap:"3px",marginBottom:"3px"}}>
                {Array.from({length:9},(_,i)=>{
                  const v = getScore(activePlayer, i);
                  const cl = v!==""?scoreClass(Number(v),course.par[i]):"";
                  const isActiveHole = activeHole===i;
                  return (
                    <button key={i} onClick={()=>setActiveHole(i)}
                      style={{
                        aspectRatio:"1", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                        borderRadius:5, border: isActiveHole ? "3px solid var(--green-mid)" : "1px solid var(--gray-200)",
                        background: cl==="eagle"?"#ffd700":cl==="birdie"?"var(--gold-light)":cl==="bogey"?"#fee2e2":cl==="double"?"var(--red)":v!==""?"var(--gray-100)":"var(--white)",
                        color: cl==="double"?"#fff":"var(--gray-800)",
                        cursor:"pointer", padding:0,
                      }}>
                      <span style={{fontSize:"0.6rem",opacity:0.6}}>{i+1}</span>
                      <span style={{fontSize:"1.1rem",fontWeight:700}}>{v!==""?v:""}</span>
                      {strokes[i]>0 && <span style={{fontSize:"0.5rem",color:"var(--gold)"}}>{"•".repeat(strokes[i])}</span>}
                    </button>
                  );
                })}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(9,1fr)",gap:"3px",marginBottom:"1rem"}}>
                {Array.from({length:9},(_,i)=>{
                  const h = i+9;
                  const v = getScore(activePlayer, h);
                  const cl = v!==""?scoreClass(Number(v),course.par[h]):"";
                  const isActiveHole = activeHole===h;
                  return (
                    <button key={h} onClick={()=>setActiveHole(h)}
                      style={{
                        aspectRatio:"1", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                        borderRadius:5, border: isActiveHole ? "3px solid var(--green-mid)" : "1px solid var(--gray-200)",
                        background: cl==="eagle"?"#ffd700":cl==="birdie"?"var(--gold-light)":cl==="bogey"?"#fee2e2":cl==="double"?"var(--red)":v!==""?"var(--gray-100)":"var(--white)",
                        color: cl==="double"?"#fff":"var(--gray-800)",
                        cursor:"pointer", padding:0,
                      }}>
                      <span style={{fontSize:"0.6rem",opacity:0.6}}>{h+1}</span>
                      <span style={{fontSize:"1.1rem",fontWeight:700}}>{v!==""?v:""}</span>
                      {strokes[h]>0 && <span style={{fontSize:"0.5rem",color:"var(--gold)"}}>{"•".repeat(strokes[h])}</span>}
                    </button>
                  );
                })}
              </div>

              {/* Current hole info + number pad */}
              <div style={{border:"2px solid var(--green-mid)",borderRadius:8,padding:"0.75rem",background:"#f0faf4"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.6rem"}}>
                  <div>
                    <span style={{fontFamily:"var(--font-body)",fontSize:"1.1rem",fontWeight:700,color:"var(--green-deep)"}}>Hole {activeHole+1}</span>
                    <span style={{marginLeft:"0.6rem",fontSize:"0.85rem",color:"var(--gray-600)"}}>Par {currentPar}</span>
                    {currentStrokes>0 && <span style={{marginLeft:"0.5rem",fontSize:"0.75rem",color:"var(--gold)",fontWeight:700}}>+{currentStrokes} stroke{currentStrokes>1?"s":""}</span>}
                  </div>
                  <div style={{display:"flex",gap:"0.4rem"}}>
                    <button className="btn btn-ghost btn-sm" disabled={activeHole===0} onClick={()=>setActiveHole(h=>Math.max(0,h-1))}>← Prev</button>
                    <button className="btn btn-ghost btn-sm" disabled={activeHole===17} onClick={()=>setActiveHole(h=>Math.min(17,h+1))}>Next →</button>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"0.4rem"}}>
                  {NUMPAD.map(n=>(
                    <button key={n}
                      onClick={()=>tapScore(activePlayer, activeHole, n)}
                      style={{
                        padding:"0.9rem 0", fontSize:"1.25rem", fontWeight:700,
                        fontFamily:"var(--font-mono)", borderRadius:6, border:"none", cursor:"pointer",
                        background: Number(currentVal)===n ? "var(--green-mid)" : "var(--white)",
                        color: Number(currentVal)===n ? "#fff" : "var(--gray-800)",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                      }}>
                      {n}
                    </button>
                  ))}
                </div>
                <div style={{marginTop:"0.5rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>tapScore(activePlayer, activeHole, null)}>Clear</button>
                  <span style={{fontSize:"0.78rem",color:"var(--gray-400)"}}>{filledCount}/18 holes entered</span>
                </div>
              </div>

              {saving===activePlayer && <p style={{fontSize:"0.78rem",color:"var(--gray-400)",marginTop:"0.5rem"}}>Saving…</p>}
              {saved[activePlayer] && (
                <button className="btn btn-ghost btn-sm" style={{marginTop:"0.75rem"}} onClick={()=>handleDelete(activePlayer)}>Remove round</button>
              )}
            </div>
          )}

          {/* ── FULL SCORECARD MODE ── */}
          {mode === "full" && (
            <>
              <div className="scorecard-wrap">
                <table className="scorecard">
                  <thead>
                    <tr>
                      <th>Hole</th>
                      {course.par.slice(0,9).map((_,i)=><th key={i}>{i+1}</th>)}
                      <th className="subtotal">Out</th>
                      {course.par.slice(9).map((_,i)=><th key={i+9}>{i+10}</th>)}
                      <th className="subtotal">In</th>
                      <th className="subtotal">Tot</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="par-row">
                      <td className="row-label">Par</td>
                      {course.par.slice(0,9).map((p,i)=><td key={i}>{p}</td>)}
                      <td className="subtotal">{frontPar}</td>
                      {course.par.slice(9).map((p,i)=><td key={i+9}>{p}</td>)}
                      <td className="subtotal">{backPar}</td>
                      <td className="subtotal">{frontPar+backPar}</td>
                    </tr>
                    <tr>
                      <td className="row-label">Hdcp</td>
                      {course.hdcp.slice(0,9).map((h,i)=><td key={i} style={{fontSize:"0.65rem",color:"var(--gray-400)"}}>{h}</td>)}
                      <td className="subtotal">—</td>
                      {course.hdcp.slice(9).map((h,i)=><td key={i+9} style={{fontSize:"0.65rem",color:"var(--gray-400)"}}>{h}</td>)}
                      <td className="subtotal">—</td>
                      <td className="subtotal">—</td>
                    </tr>
                    <tr>
                      <td className="row-label">Strks</td>
                      {strokes.slice(0,9).map((s,i)=><td key={i} style={{fontSize:"0.75rem",fontWeight:700,color:s>0?"var(--gold)":"var(--gray-200)"}}>{s>0?s:"—"}</td>)}
                      <td className="subtotal">—</td>
                      {strokes.slice(9).map((s,i)=><td key={i+9} style={{fontSize:"0.75rem",fontWeight:700,color:s>0?"var(--gold)":"var(--gray-200)"}}>{s>0?s:"—"}</td>)}
                      <td className="subtotal">—</td>
                      <td className="subtotal">{ch}</td>
                    </tr>
                    <tr>
                      <td className="row-label">Gross</td>
                      {course.par.slice(0,9).map((_,i) => {
                        const v = getScore(activePlayer, i);
                        const cl = v !== "" ? scoreClass(Number(v), course.par[i]) : "";
                        return (
                          <td key={i} className={cl}>
                            <input type="number" min="1" max="15"
                              className={`score-input${v!==""?" filled":""}`}
                              value={v}
                              onChange={e=>setScoreLocal(activePlayer, i, e.target.value)} />
                          </td>
                        );
                      })}
                      <td className="subtotal">{frontGross||"—"}</td>
                      {course.par.slice(9).map((_,i) => {
                        const v = getScore(activePlayer, i+9);
                        const cl = v !== "" ? scoreClass(Number(v), course.par[i+9]) : "";
                        return (
                          <td key={i+9} className={cl}>
                            <input type="number" min="1" max="15"
                              className={`score-input${v!==""?" filled":""}`}
                              value={v}
                              onChange={e=>setScoreLocal(activePlayer, i+9, e.target.value)} />
                          </td>
                        );
                      })}
                      <td className="subtotal">{backGross||"—"}</td>
                      <td className="subtotal">{frontGross&&backGross?frontGross+backGross:"—"}</td>
                    </tr>
                    {allFilled && totals && (
                      <tr>
                        <td className="row-label" style={{color:"var(--green-mid)"}}>Net</td>
                        {Array.from({length:9},(_,i) => {
                          const gs = playerScores[i];
                          const net = gs - strokes[i];
                          const cl = scoreClass(net, course.par[i]);
                          return <td key={i} className={cl} style={{fontSize:"0.75rem"}}>{net}</td>;
                        })}
                        <td className="subtotal">{playerScores.slice(0,9).reduce((a,b)=>a+b,0)-strokes.slice(0,9).reduce((a,b)=>a+b,0)}</td>
                        {Array.from({length:9},(_,i) => {
                          const gs = playerScores[i+9];
                          const net = gs - strokes[i+9];
                          const cl = scoreClass(net, course.par[i+9]);
                          return <td key={i+9} className={cl} style={{fontSize:"0.75rem"}}>{net}</td>;
                        })}
                        <td className="subtotal">{playerScores.slice(9).reduce((a,b)=>a+b,0)-strokes.slice(9).reduce((a,b)=>a+b,0)}</td>
                        <td className="subtotal" style={{color:"var(--gold)"}}>{totals.net}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{display:"flex",gap:"0.5rem",marginTop:"0.75rem",flexWrap:"wrap"}}>
                <button className="btn btn-primary" onClick={()=>handleSaveFull(activePlayer)} disabled={saving===activePlayer}>
                  {saving===activePlayer ? "Saving…" : saved[activePlayer] ? "✓ Saved" : "Save Scores"}
                </button>
                {saved[activePlayer] && (
                  <button className="btn btn-ghost btn-sm" onClick={()=>handleDelete(activePlayer)}>Remove</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Summary table */}
      <div className="card">
        <div className="card-header"><h2>All Scores — {course.name}</h2></div>
        <div className="card-body" style={{padding:0}}>
          <table className="leaderboard">
            <thead><tr><th>Player</th><th>CH</th><th>Gross</th><th>Net</th><th>Net +/-</th><th>Status</th></tr></thead>
            <tbody>
              {players.map(p => {
                const ch2 = courseHandicap(ghinOverrides[p.id]??p.ghin, course.slope);
                const gs = scores[p.id];
                const t = gs && gs.every(v=>v!=null&&!isNaN(v)) ? getRoundTotals(courseKey, p.id, gs.map(Number), ghinOverrides) : null;
                const count = (gs||[]).filter(v=>v!==null&&v!==undefined&&!isNaN(v)).length;
                return (
                  <tr key={p.id} onClick={()=>{setActivePlayer(p.id); setActiveHole(0);}} style={{cursor:"pointer", background:activePlayer===p.id?"var(--gray-100)":""}}>
                    <td style={{fontWeight:600}}>{p.name}</td>
                    <td className="text-mono">{ch2}</td>
                    <td className="text-mono">{t?.gross ?? "—"}</td>
                    <td className="text-mono">{t?.net ?? "—"}</td>
                    <td className="text-mono">{t ? (t.netToPar>0?"+":"")+t.netToPar : "—"}</td>
                    <td>
                      <span style={{fontSize:"0.75rem",color:saved[p.id]?"var(--green-mid)":count>0?"var(--gold)":"var(--gray-400)"}}>
                        {saved[p.id]?"✓ Saved":count>0?`${count}/18`:"—"}
                      </span>
                    </td>
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
