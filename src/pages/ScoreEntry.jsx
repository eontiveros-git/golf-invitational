import { useState, useEffect, useRef } from "react";
import { COURSES as DEFAULT_COURSES, COURSE_KEYS, courseHandicap, strokesPerHole } from "../lib/gameData";
import { getRounds, saveRound, deleteRound, getSettings, getCtpWinners, saveCtpWinner } from "../lib/supabase";
import { getRoundTotals, matchHandicaps } from "../lib/scoring";
import { useAppData } from "../lib/useAppData";
import { ConfirmDialog, Toast } from "../components/Confirm";

function scoreClass(score, par) {
  const d = score - par;
  if (d <= -2) return "eagle";
  if (d === -1) return "birdie";
  if (d === 1)  return "bogey";
  if (d === 2)  return "double";
  if (d >= 3)   return "triple";
  return "";
}

const NUMPAD = [1,2,3,4,5,6,7,8,9,10,11,12];

export default function ScoreEntry({ onSave }) {
  const { players, ghinOverrides: appGhinOverrides, courses, matchups, teams } = useAppData();

  // Default to the next day that still has scores to enter.
  // Once all 12 rounds are in for a course, the dropdown advances to the next.
  // Computed once on mount so it doesn't jump while the user is actively entering.
  const [courseKey, setCourseKey] = useState(() => {
    try {
      // We don't have rounds in scope here yet, so fall back to bearDance;
      // the useEffect below promotes it after the initial load.
      return "bearDance";
    } catch { return "bearDance"; }
  });
  const [initialAdvanceDone, setInitialAdvanceDone] = useState(false);
  const [scores, setScores]   = useState({});
  const [saved, setSaved]     = useState({});
  const [saving, setSaving]   = useState(null);
  const [ghinOverrides, setGhinOverrides] = useState({});
  const [activePlayer, setActivePlayer] = useState(null);
  const [mode, setMode] = useState("quick");
  const [activeHole, setActiveHole] = useState(0);
  const [flashSaved, setFlashSaved] = useState(false);
  const [ctpWinners, setCtpWinners] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null); // playerId pending removal
  const [toast, setToast] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);     // which match is active in match mode
  const [matchPlayerIdx, setMatchPlayerIdx] = useState(0); // which of the 4 players is currently receiving input
  const saveTimer = useRef(null);

  const course = (courses && courses[courseKey]) || DEFAULT_COURSES[courseKey];

  useEffect(() => {
    if (players.length && !activePlayer) setActivePlayer(players[0].id);
  }, [players]);

  useEffect(() => {
    async function load() {
      const [allRounds, s, allCtp] = await Promise.all([getRounds(), getSettings(), getCtpWinners()]);

      // ── On first load only: promote to the next unfinished day.
      // "Finished" = 12 completed rounds saved for that course.
      // After the user manually picks a course, we respect their choice.
      if (!initialAdvanceDone) {
        const target = COURSE_KEYS.find(ck => {
          const count = allRounds.filter(r =>
            r.course_key === ck &&
            Array.isArray(r.gross_scores) &&
            r.gross_scores.length === 18 &&
            r.gross_scores.every(v => v != null && !isNaN(v))
          ).length;
          return count < 12;
        }) || COURSE_KEYS[COURSE_KEYS.length - 1]; // all four done → last day
        setInitialAdvanceDone(true);
        if (target !== courseKey) {
          setCourseKey(target);
          return; // effect will re-run with the new key; skip loading data for the old one
        }
      }

      const courseRounds = allRounds.filter(r => r.course_key === courseKey);
      const loaded = {};
      const savedMap = {};
      courseRounds.forEach(r => {
        loaded[r.player_id] = [...r.gross_scores];
        savedMap[r.player_id] = true;
      });
      setScores(loaded);
      setSaved(savedMap);
      setCtpWinners(allCtp);
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
      setToast("Enter all 18 scores before saving.");
      return;
    }
    setSaving(pid);
    await saveRound(courseKey, pid, arr.map(Number));
    setSaved(prev => ({ ...prev, [pid]: true }));
    setSaving(null);
    onSave?.();
  }

  async function handleDelete(pid) {
    await deleteRound(courseKey, pid);
    setScores(prev => { const n={...prev}; delete n[pid]; return n; });
    setSaved(prev => { const n={...prev}; delete n[pid]; return n; });
    setConfirmDelete(null);
    setToast(`${players.find(p=>p.id===pid)?.name}'s round removed.`);
    onSave?.();
  }

  if (!activePlayer) return <div className="spinner"/>;

  const player = players.find(p=>p.id===activePlayer);
  const ch = courseHandicap(ghinOverrides[activePlayer] ?? player.ghin, course.slope, course.rating, course.par.reduce((a,b)=>a+b,0));
  const strokes = strokesPerHole(ch, course.hdcp);
  const playerScores = scores[activePlayer];
  const allFilled = playerScores && playerScores.length === 18 && playerScores.every(v => v !== null && !isNaN(v));

  const frontPar  = course.par.slice(0,9).reduce((a,b)=>a+b,0);
  const backPar   = course.par.slice(9).reduce((a,b)=>a+b,0);
  const frontGross = playerScores ? playerScores.slice(0,9).reduce((a,b)=>a+(b||0),0) : null;
  const backGross  = playerScores ? playerScores.slice(9).reduce((a,b)=>a+(b||0),0) : null;
  const totals = (allFilled && playerScores) ? getRoundTotals(courseKey, activePlayer, playerScores, ghinOverrides, courses) : null;

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
                  <option key={ck} value={ck}>{DEFAULT_COURSES[ck].name} — {DEFAULT_COURSES[ck].day}</option>
                ))}
              </select>
            </div>
            <div style={{flex:1,display:"flex",alignItems:"flex-end",gap:"0.5rem",flexWrap:"wrap"}}>
              <span style={{fontSize:"0.8rem",color:"var(--gray-400)",paddingBottom:"0.45rem"}}>
                {course.tees} Tees · Rating {course.rating} · Slope {course.slope}
              </span>
            </div>
          </div>
          <div style={{display:"flex",gap:"0.4rem",flexWrap:"wrap"}}>
            <button className={`btn btn-sm${mode==="quick"?" btn-primary":" btn-ghost"}`} onClick={()=>setMode("quick")}>
              ⚡ Quick Entry
            </button>
            <button className={`btn btn-sm${mode==="full"?" btn-primary":" btn-ghost"}`} onClick={()=>setMode("full")}>
              📋 Full Scorecard
            </button>
            <button className={`btn btn-sm${mode==="match"?" btn-primary":" btn-ghost"}`} onClick={()=>setMode("match")}>
              ⛳ Match Mode
            </button>
          </div>
        </div>
      </div>

      {/* Player pills */}
      <div className="card mb-2">
        <div className="card-header"><h2>{course.name}</h2></div>
        <div className="card-body">
          {mode !== "match" && (
            <>
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
            </>
          )}

          {/* ── QUICK MODE ── */}
          {mode === "quick" && (
            <div>
              {/* Hole strip — front 9 */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(9,1fr)",gap:"3px",marginBottom:"3px"}}>
                {Array.from({length:9},(_,i)=>{
                  const v = getScore(activePlayer, i);
                  const cl = v!==""?scoreClass(Number(v),course.par[i]):"";
                  const isActiveHole = activeHole===i;
                  return (
                    <button key={i} onClick={()=>setActiveHole(i)}
                      style={{
                        aspectRatio:"1", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                        borderRadius:5,
                        border: isActiveHole ? "3px solid var(--pine-mid)" : "1px solid var(--gray-200)",
                        background: isActiveHole ? "#f0f7f3"
                          : cl==="eagle"  ? "#c8e6c9"
                          : cl==="birdie" ? "#dcedc8"
                          : cl==="bogey"  ? "#ffcdd2"
                          : cl==="double" ? "#ef9a9a"
                          : cl==="triple" ? "#e57373"
                          : v!==""        ? "var(--gray-100)"
                          : "var(--white)",
                        cursor:"pointer", padding:"0.2rem 0",
                      }}>
                      <span style={{fontSize:"0.55rem",opacity:0.5,lineHeight:1}}>{i+1}</span>
                      <span style={{fontSize:"0.9rem",fontWeight:700,margin:"1px 0",
                        color: cl==="triple"?"#fff":cl==="double"?"var(--red)":cl==="bogey"?"var(--red)":cl==="birdie"||cl==="eagle"?"var(--pine-deep)":"var(--gray-800)"
                      }}>{v!==""?v:"·"}</span>
                      {strokes[i]>0 && <span style={{fontSize:"0.45rem",color:"var(--copper)",lineHeight:1}}>{"●".repeat(strokes[i])}</span>}
                    </button>
                  );
                })}
              </div>
              {/* Hole strip — back 9 */}
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
                        borderRadius:5,
                        border: isActiveHole ? "3px solid var(--pine-mid)" : "1px solid var(--gray-200)",
                        background: isActiveHole ? "#f0f7f3"
                          : cl==="eagle"  ? "#c8e6c9"
                          : cl==="birdie" ? "#dcedc8"
                          : cl==="bogey"  ? "#ffcdd2"
                          : cl==="double" ? "#ef9a9a"
                          : cl==="triple" ? "#e57373"
                          : v!==""        ? "var(--gray-100)"
                          : "var(--white)",
                        cursor:"pointer", padding:"0.2rem 0",
                      }}>
                      <span style={{fontSize:"0.55rem",opacity:0.5,lineHeight:1}}>{h+1}</span>
                      <span style={{fontSize:"0.9rem",fontWeight:700,margin:"1px 0",
                        color: cl==="triple"?"#fff":cl==="double"?"var(--red)":cl==="bogey"?"var(--red)":cl==="birdie"||cl==="eagle"?"var(--pine-deep)":"var(--gray-800)"
                      }}>{v!==""?v:"·"}</span>
                      {strokes[h]>0 && <span style={{fontSize:"0.45rem",color:"var(--copper)",lineHeight:1}}>{"●".repeat(strokes[h])}</span>}
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
                <button className="btn btn-ghost btn-sm" style={{marginTop:"0.75rem"}} onClick={()=>setConfirmDelete(activePlayer)}>Remove round</button>
              )}
            </div>
          )}

          {/* ── MATCH MODE — enter one hole for all 4 players in a match ── */}
          {mode === "match" && (() => {
            try {
            const courseMatches = (matchups||[]).filter(m=>m.course_key===courseKey)
              .sort((a,b)=>a.match_index-b.match_index);
            if (!courseMatches.length) return (
              <div style={{padding:"1rem",background:"var(--gray-100)",borderRadius:6,fontSize:"var(--text-sm)",color:"var(--gray-600)"}}>
                No matchups set for {course.name} yet. Set them under Admin → Matchups.
              </div>
            );
            const activeMatch = courseMatches[Math.min(matchIdx, courseMatches.length-1)];
            const matchIds = [...(activeMatch.team1_players||[]),...(activeMatch.team2_players||[])].filter(Boolean);
            if (!matchIds.length) return (
              <div style={{padding:"1rem",background:"var(--gray-100)",borderRadius:6,fontSize:"var(--text-sm)",color:"var(--gray-600)"}}>
                Match {activeMatch.match_index+1} has no players assigned yet.
              </div>
            );

            const { fullCH, matchH } = matchHandicaps(courseKey, matchIds, ghinOverrides, courses, activeMatch.match_handicaps||{});
            const nameOf = id => players.find(p=>p.id===id)?.name ?? id;
            const cellFor = (pid, h) => {
              const v = scores[pid]?.[h];
              return v==null||isNaN(v) ? "" : String(v);
            };

            const setMatchScore = (pid, hole, val) => {
              setScores(prev => {
                const arr = prev[pid] ? [...prev[pid]] : new Array(18).fill(null);
                arr[hole] = val;
                clearTimeout(saveTimer.current);
                saveTimer.current = setTimeout(()=>autoSave(pid, arr), 400);
                return { ...prev, [pid]: arr };
              });
            };

            const activePid = matchIds[Math.min(matchPlayerIdx, matchIds.length-1)];
            const holeAllFilled = matchIds.every(pid => {
              const v = scores[pid]?.[activeHole];
              return v!=null && !isNaN(v);
            });

            const t1 = activeMatch.team1_players||[], t2 = activeMatch.team2_players||[];
            const strokesById = Object.fromEntries(matchIds.map(id => [id, strokesPerHole(matchH[id], course.hdcp)]));

            // Live match status computed only from holes that all 4 have entered
            let margin = 0, played = 0;
            for (let h=0; h<18; h++) {
              const netsById = {};
              matchIds.forEach(id => {
                const g = scores[id]?.[h];
                if (g==null || isNaN(g)) return;
                netsById[id] = g - strokesById[id][h];
              });
              const t1Nets = t1.map(id => netsById[id]).filter(v => v!=null);
              const t2Nets = t2.map(id => netsById[id]).filter(v => v!=null);
              if (!t1Nets.length || !t2Nets.length) continue;
              played = h+1;
              const t1Best = Math.min(...t1Nets), t2Best = Math.min(...t2Nets);
              if (t1Best < t2Best) margin += 1;
              else if (t2Best < t1Best) margin -= 1;
            }
            const remaining = 18 - played;
            const isFinal = played > 0 && Math.abs(margin) > remaining;
            const statusLabel = played === 0 ? "—"
              : margin === 0 ? `All Square thru ${played}`
              : isFinal ? `${Math.abs(margin)} & ${remaining}`
              : `${Math.abs(margin)} ${margin>0?"UP":"DN"} thru ${played}`;

            return (
              <div>
                {/* Match picker */}
                <div style={{display:"flex",gap:"0.4rem",flexWrap:"wrap",marginBottom:"0.75rem"}}>
                  {courseMatches.map((m,i) => (
                    <button key={i}
                      onClick={()=>{setMatchIdx(i); setMatchPlayerIdx(0);}}
                      className={`btn btn-sm${matchIdx===i?" btn-primary":" btn-ghost"}`}>
                      Match {m.match_index+1}
                    </button>
                  ))}
                </div>

                {/* Live status banner */}
                <div style={{
                  padding:"0.6rem 0.9rem", borderRadius:6, marginBottom:"0.75rem",
                  background:"var(--pine-deep)", color:"var(--aspen)",
                  display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:"0.5rem",
                }}>
                  <div style={{fontSize:"var(--text-sm)"}}>
                    <span style={{color:"var(--pine-light)"}}>{teams[1]?.name}</span>
                    <span style={{margin:"0 0.4rem",color:"var(--gray-400)"}}>vs</span>
                    <span style={{color:"var(--pine-light)"}}>{teams[2]?.name}</span>
                  </div>
                  <div style={{fontFamily:"var(--font-mono)",fontWeight:700,fontSize:"var(--text-base)",
                    color: margin>0?"var(--pine-light)":margin<0?"var(--copper-light)":"var(--aspen)"}}>
                    {statusLabel}
                  </div>
                </div>

                {/* Hole picker strip — front 9 */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(9,1fr)",gap:"3px",marginBottom:"3px"}}>
                  {Array.from({length:9},(_,i)=>{
                    const done = matchIds.every(pid => scores[pid]?.[i] != null);
                    const any  = matchIds.some(pid => scores[pid]?.[i] != null);
                    return (
                      <button key={i} onClick={()=>{setActiveHole(i); setMatchPlayerIdx(0);}}
                        style={{
                          aspectRatio:"1.4",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                          borderRadius:5,cursor:"pointer",padding:"0.2rem 0",
                          border: activeHole===i ? "3px solid var(--pine-mid)" : "1px solid var(--gray-200)",
                          background: done ? "#e8f5ee" : any ? "#fff9e6" : "var(--white)",
                        }}>
                        <span style={{fontSize:"0.6rem",opacity:0.6,lineHeight:1}}>{i+1}</span>
                        <span style={{fontSize:"0.65rem",fontWeight:600,color:"var(--gray-600)"}}>par {course.par[i]}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Back 9 */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(9,1fr)",gap:"3px",marginBottom:"1rem"}}>
                  {Array.from({length:9},(_,i)=>{
                    const h = i+9;
                    const done = matchIds.every(pid => scores[pid]?.[h] != null);
                    const any  = matchIds.some(pid => scores[pid]?.[h] != null);
                    return (
                      <button key={h} onClick={()=>{setActiveHole(h); setMatchPlayerIdx(0);}}
                        style={{
                          aspectRatio:"1.4",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                          borderRadius:5,cursor:"pointer",padding:"0.2rem 0",
                          border: activeHole===h ? "3px solid var(--pine-mid)" : "1px solid var(--gray-200)",
                          background: done ? "#e8f5ee" : any ? "#fff9e6" : "var(--white)",
                        }}>
                        <span style={{fontSize:"0.6rem",opacity:0.6,lineHeight:1}}>{h+1}</span>
                        <span style={{fontSize:"0.65rem",fontWeight:600,color:"var(--gray-600)"}}>par {course.par[h]}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Player rows for the current hole — the whole point of match mode */}
                <div style={{
                  border:"2px solid var(--copper)", borderRadius:6, padding:"0.75rem",
                  marginBottom:"0.75rem", background:"#fefaf3",
                }}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"0.5rem"}}>
                    <div style={{fontWeight:700,fontSize:"var(--text-base)"}}>
                      Hole {activeHole+1} · Par {course.par[activeHole]}
                    </div>
                    <div style={{fontSize:"var(--text-xs)",color:"var(--gray-600)"}}>
                      Hdcp {course.hdcp[activeHole]}
                    </div>
                  </div>

                  {matchIds.map((pid, pi) => {
                    const team = t1.includes(pid) ? 1 : 2;
                    const isActive = pi === matchPlayerIdx;
                    const val = cellFor(pid, activeHole);
                    const s = strokesById[pid][activeHole] || 0;
                    return (
                      <div key={pid}
                        onClick={()=>setMatchPlayerIdx(pi)}
                        style={{
                          display:"flex", alignItems:"center", gap:"0.75rem",
                          padding:"0.55rem 0.6rem", marginBottom:"0.3rem",
                          borderRadius:5, cursor:"pointer",
                          border: isActive ? "2px solid var(--pine-mid)" : "1px solid var(--gray-200)",
                          background: isActive ? "#f0f7f3" : "var(--white)",
                        }}>
                        <span className={`match-band match-band-t${team}`} style={{height:"1.2em",width:4}}/>
                        <div style={{flex:1}}>
                          <span style={{fontWeight:700,fontSize:"var(--text-sm)"}}>{nameOf(pid)}</span>
                          <span style={{fontSize:"var(--text-xs)",color:"var(--gray-400)",marginLeft:6}}>
                            +{matchH[pid]}{s>0?<span style={{color:"var(--copper)"}}>{" ●".repeat(s)}</span>:null}
                          </span>
                        </div>
                        <span style={{fontFamily:"var(--font-mono)",fontSize:"1.4rem",fontWeight:700,minWidth:32,textAlign:"right",
                          color: val==="" ? "var(--gray-300)" : "var(--gray-800)"}}>
                          {val==="" ? "·" : val}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Numpad — entering fills active player then jumps to next unfilled */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:"0.35rem"}}>
                  {NUMPAD.map(n => (
                    <button key={n} className="btn"
                      onClick={()=>{
                        setMatchScore(activePid, activeHole, n);
                        // find next player on this hole who's still empty (respecting order after current)
                        const nextEmpty = matchIds.findIndex((id,i) =>
                          i > matchPlayerIdx && (scores[id]?.[activeHole]==null || id===activePid && false)
                        );
                        // simpler: just advance one player
                        const nextIdx = matchPlayerIdx < matchIds.length-1 ? matchPlayerIdx+1 : matchPlayerIdx;
                        setMatchPlayerIdx(nextIdx);
                        // Advance hole if this entry completed the hole for everyone
                        const willAllFill = matchIds.every(id => id===activePid ? true : (scores[id]?.[activeHole]!=null));
                        if (willAllFill && activeHole<17) {
                          setTimeout(()=>{setActiveHole(activeHole+1); setMatchPlayerIdx(0);}, 250);
                        }
                      }}
                      style={{padding:"0.9rem 0",fontSize:"1.2rem",fontWeight:700}}>
                      {n}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:"0.4rem",marginTop:"0.5rem"}}>
                  <button className="btn btn-ghost btn-sm" style={{flex:1}}
                    onClick={()=>setMatchScore(activePid, activeHole, null)}>Clear</button>
                  <button className="btn btn-ghost btn-sm" style={{flex:1}}
                    onClick={()=>{if(activeHole>0){setActiveHole(activeHole-1);setMatchPlayerIdx(0);}}}>← Hole</button>
                  <button className="btn btn-ghost btn-sm" style={{flex:1}}
                    onClick={()=>{if(activeHole<17){setActiveHole(activeHole+1);setMatchPlayerIdx(0);}}}>Hole →</button>
                </div>

                {holeAllFilled && activeHole===17 && (
                  <div style={{marginTop:"0.75rem",padding:"0.6rem",background:"#e8f5ee",borderRadius:6,textAlign:"center",fontWeight:600,color:"var(--pine-deep)"}}>
                    ✓ All 4 players complete through 18. Auto-saved.
                  </div>
                )}
              </div>
            );
            } catch (err) {
              return (
                <div style={{padding:"1rem",background:"#fee2e2",borderRadius:6,fontSize:"var(--text-sm)",color:"var(--red)"}}>
                  <div style={{fontWeight:700,marginBottom:"0.4rem"}}>Match Mode couldn't load.</div>
                  <div style={{fontFamily:"var(--font-mono)",fontSize:"var(--text-xs)"}}>{String(err?.message||err)}</div>
                  <div style={{marginTop:"0.5rem"}}>Try Quick Entry or Full Scorecard while I debug.</div>
                </div>
              );
            }
          })()}

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
                        <td className="row-label" style={{color:"var(--pine-mid)"}}>Net</td>
                        {Array.from({length:9},(_,i) => {
                          const gs = playerScores[i];
                          const net = gs - strokes[i];
                          const cl = scoreClass(net, course.par[i]);
                          return <td key={i} className={cl} style={{fontSize:"0.75rem",textAlign:"center",padding:"0.2rem"}}>
                            <span className="score-mark">{net}</span>
                          </td>;
                        })}
                        <td className="subtotal">{playerScores.slice(0,9).reduce((a,b)=>a+b,0)-strokes.slice(0,9).reduce((a,b)=>a+b,0)}</td>
                        {Array.from({length:9},(_,i) => {
                          const gs = playerScores[i+9];
                          const net = gs - strokes[i+9];
                          const cl = scoreClass(net, course.par[i+9]);
                          return <td key={i+9} className={cl} style={{fontSize:"0.75rem",textAlign:"center",padding:"0.2rem"}}>
                            <span className="score-mark">{net}</span>
                          </td>;
                        })}
                        <td className="subtotal">{playerScores.slice(9).reduce((a,b)=>a+b,0)-strokes.slice(9).reduce((a,b)=>a+b,0)}</td>
                        <td className="subtotal" style={{color:"var(--copper)"}}>{totals.net}</td>
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
                  <button className="btn btn-ghost btn-sm" onClick={()=>setConfirmDelete(activePlayer)}>Remove</button>
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
                const ch2 = courseHandicap(ghinOverrides[p.id]??p.ghin, course.slope, course.rating, course.par.reduce((a,b)=>a+b,0));
                const gs = scores[p.id];
                const t = gs && gs.every(v=>v!=null&&!isNaN(v)) ? getRoundTotals(courseKey, p.id, gs.map(Number), ghinOverrides, courses) : null;
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
      {/* ── MATCH HANDICAPS ── */}
      {(() => {
        const courseMatches = (matchups||[]).filter(m=>m.course_key===courseKey)
          .sort((a,b)=>a.match_index-b.match_index);
        if (!courseMatches.length) return null;
        const pName = id => players.find(p=>p.id===id)?.name ?? id;
        return (
          <div className="card">
            <div className="card-header">
              <h2>Match Handicaps</h2>
              <span className="badge">{course.name} · low man scratch</span>
            </div>
            <div className="card-body" style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
              {courseMatches.map((m,mi)=>{
                const ids=[...(m.team1_players||[]),...(m.team2_players||[])].filter(Boolean);
                if(ids.length<2) return null;
                const { fullCH, matchH, low } = matchHandicaps(courseKey, ids, ghinOverrides, courses, m.match_handicaps||{});
                const row = side => (side||[]).filter(Boolean).map(id=>{
                  const isOv = m.match_handicaps?.[id]!==undefined && m.match_handicaps?.[id]!=="" && m.match_handicaps?.[id]!==null;
                  return (
                    <div key={id} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:"0.5rem",padding:"0.15rem 0"}}>
                      <span style={{fontWeight:600,fontSize:"var(--text-sm)"}}>{pName(id)}</span>
                      <span style={{fontSize:"var(--text-xs)",color:"var(--gray-400)"}}>
                        CH {fullCH[id]} → <span style={{fontFamily:"var(--font-mono)",fontWeight:700,fontSize:"var(--text-base)",color:matchH[id]===0?"var(--pine-mid)":"var(--gray-800)"}}>{matchH[id]===0?"scr":`+${matchH[id]}`}</span>
                        {isOv && <span title="manual override" style={{marginLeft:3,color:"var(--copper)"}}>✎</span>}
                      </span>
                    </div>
                  );
                });
                return (
                  <div key={mi} style={{border:"1px solid var(--gray-200)",borderRadius:5,overflow:"hidden"}}>
                    <div style={{background:"var(--gray-100)",padding:"0.3rem 0.6rem",fontSize:"0.62rem",fontWeight:700,color:"var(--gray-600)",textTransform:"uppercase",letterSpacing:"0.06em"}}>
                      Match {m.match_index+1}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem",padding:"0.5rem 0.6rem"}}>
                      <div>{row(m.team1_players)}</div>
                      <div style={{borderLeft:"1px solid var(--gray-200)",paddingLeft:"0.5rem"}}>{row(m.team2_players)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── CTP ── */}
      {(() => {
        const par3Holes = course.par.map((p,i)=>({p,i})).filter(x=>x.p===3);
        if (!par3Holes.length) return null;
        async function handleCtpSave(holeIndex, playerId) {
          await saveCtpWinner(courseKey, holeIndex, playerId || null);
          const updated = await getCtpWinners();
          setCtpWinners(updated);
          onSave?.();
        }
        return (
          <div className="card">
            <div className="card-header">
              <h2>Closest to Pin</h2>
              <span className="badge">{par3Holes.length} par 3s · {course.name}</span>
            </div>
            <div className="card-body">
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:"0.5rem"}}>
                {par3Holes.map(({i})=>{
                  const current = ctpWinners.find(c=>c.course_key===courseKey&&c.hole_index===i);
                  const winner = current?.player_id ? players.find(p=>p.id===current.player_id) : null;
                  return (
                    <div key={i} style={{border:`1px solid ${winner?"var(--copper)":"var(--gray-200)"}`,borderRadius:5,padding:"0.6rem 0.75rem",background:winner?"var(--copper-pale)":""}}>
                      <div className="form-label" style={{marginBottom:"0.3rem"}}>Hole {i+1} · Par 3</div>
                      <select className="form-select" style={{width:"100%"}}
                        value={current?.player_id||""}
                        onChange={e=>handleCtpSave(i,e.target.value)}>
                        <option value="">— No winner yet —</option>
                        {players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {winner && (
                        <div style={{marginTop:"0.3rem",fontSize:"var(--text-xs)",color:"var(--copper)",fontWeight:600}}>
                          🏆 {winner.name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Remove round"
        message={confirmDelete
          ? `Remove ${players.find(p=>p.id===confirmDelete)?.name}'s ${course.name} round? Their scores for this course will be deleted.`
          : ""}
        confirmLabel="Remove"
        onConfirm={()=>handleDelete(confirmDelete)}
        onCancel={()=>setConfirmDelete(null)}
      />
      <Toast message={toast} onDone={()=>setToast("")} />
    </div>
  );
}
