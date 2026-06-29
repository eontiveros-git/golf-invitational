import { useState, useEffect } from "react";
import { COURSES, COURSE_KEYS, PLAYERS } from "../lib/gameData";
import { getRounds, saveRound, deleteRound } from "../lib/supabase";
import { getSettings } from "../lib/supabase";
import { courseHandicap, strokesPerHole, playerMap } from "../lib/gameData";
import { getRoundTotals } from "../lib/scoring";

const PAR_COLORS = { eagle:"eagle", birdie:"birdie", even:"", bogey:"bogey", double:"double" };
function scoreClass(score, par) {
  const d = score - par;
  if (d <= -2) return "eagle";
  if (d === -1) return "birdie";
  if (d === 1)  return "bogey";
  if (d >= 2)   return "double";
  return "";
}

export default function ScoreEntry({ onSave }) {
  const [courseKey, setCourseKey] = useState("bearDance");
  const [scores, setScores]   = useState({}); // { playerId: [18 values] }
  const [saved, setSaved]     = useState({}); // { playerId: true }
  const [saving, setSaving]   = useState(null);
  const [ghinOverrides, setGhinOverrides] = useState({});
  const [activePlayer, setActivePlayer] = useState(PLAYERS[0].id);

  const course = COURSES[courseKey];

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
      if (s?.handicaps) {
        const ov = {};
        Object.entries(s.handicaps).forEach(([id,v]) => { if (v!==null&&v!=="") ov[id]=parseFloat(v); });
        setGhinOverrides(ov);
      }
    }
    load();
  }, [courseKey]);

  const pmap = playerMap(ghinOverrides);

  function getScore(pid, hole) {
    return scores[pid]?.[hole] ?? "";
  }
  function setScore(pid, hole, val) {
    const v = val === "" ? null : parseInt(val, 10);
    setScores(prev => {
      const arr = prev[pid] ? [...prev[pid]] : new Array(18).fill(null);
      arr[hole] = v;
      return { ...prev, [pid]: arr };
    });
    setSaved(prev => ({ ...prev, [pid]: false }));
  }

  async function handleSave(pid) {
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
    if (!confirm(`Remove ${PLAYERS.find(p=>p.id===pid)?.name}'s ${course.name} round?`)) return;
    await deleteRound(courseKey, pid);
    setScores(prev => { const n={...prev}; delete n[pid]; return n; });
    setSaved(prev => { const n={...prev}; delete n[pid]; return n; });
    onSave?.();
  }

  const player = PLAYERS.find(p=>p.id===activePlayer);
  const ch = courseHandicap(pmap[activePlayer]?.ghin ?? player.ghin, course.slope);
  const strokes = strokesPerHole(ch, course.hdcp);
  const playerScores = scores[activePlayer];
  const allFilled = playerScores && playerScores.length === 18 && playerScores.every(v => v !== null && !isNaN(v));

  const frontPar  = course.par.slice(0,9).reduce((a,b)=>a+b,0);
  const backPar   = course.par.slice(9).reduce((a,b)=>a+b,0);
  const frontGross = playerScores ? playerScores.slice(0,9).reduce((a,b)=>a+(b||0),0) : null;
  const backGross  = playerScores ? playerScores.slice(9).reduce((a,b)=>a+(b||0),0) : null;
  const totals = (allFilled && playerScores) ? getRoundTotals(courseKey, activePlayer, playerScores, ghinOverrides) : null;

  return (
    <div>
      {/* Course selector */}
      <div className="card mb-2">
        <div className="card-body">
          <div className="form-row" style={{marginBottom:0}}>
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
        </div>
      </div>

      {/* Player status pills */}
      <div className="card mb-2">
        <div className="card-header"><h2>Scorecards — {course.name}</h2></div>
        <div className="card-body">
          <div style={{display:"flex",flexWrap:"wrap",gap:"0.4rem",marginBottom:"1rem"}}>
            {PLAYERS.map(p => {
              const isSaved = saved[p.id];
              const isActive = p.id === activePlayer;
              const hasScores = scores[p.id]?.some(v=>v!==null&&!isNaN(v));
              return (
                <button
                  key={p.id}
                  onClick={() => setActivePlayer(p.id)}
                  className="btn btn-sm"
                  style={{
                    background: isActive ? "var(--green-mid)" : isSaved ? "#e8f5ee" : hasScores ? "#fff9e6" : "var(--gray-100)",
                    color: isActive ? "#fff" : isSaved ? "var(--green-mid)" : "var(--gray-800)",
                    border: isActive ? "none" : `1px solid ${isSaved?"var(--green-mid)":hasScores?"var(--gold)":"var(--gray-200)"}`,
                    fontWeight: 600,
                  }}
                >
                  {isSaved ? "✓ " : ""}{p.name}
                </button>
              );
            })}
          </div>

          {/* Score grid for active player */}
          <div style={{marginBottom:"0.75rem",display:"flex",alignItems:"center",gap:"0.75rem",flexWrap:"wrap"}}>
            <span style={{fontWeight:700,fontSize:"1rem"}}>{player.name}</span>
            <span className="tag tag-team1" style={{background: player.team===1?"#e8f5ee":"#e8eef5", color:player.team===1?"var(--green-mid)":"var(--blue)"}}>
              GHIN {pmap[activePlayer]?.ghin.toFixed(1)} → CH {ch}
            </span>
            {totals && (
              <>
                <span className="text-mono" style={{fontSize:"0.85rem"}}>Gross: <strong>{totals.gross}</strong></span>
                <span className="text-mono" style={{fontSize:"0.85rem"}}>Net: <strong>{totals.net}</strong></span>
              </>
            )}
          </div>

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
                        <input
                          type="number" min="1" max="15"
                          className={`score-input${v!==""?" filled":""}`}
                          value={v}
                          onChange={e=>setScore(activePlayer, i, e.target.value)}
                        />
                      </td>
                    );
                  })}
                  <td className="subtotal">{frontGross||"—"}</td>
                  {course.par.slice(9).map((_,i) => {
                    const v = getScore(activePlayer, i+9);
                    const cl = v !== "" ? scoreClass(Number(v), course.par[i+9]) : "";
                    return (
                      <td key={i+9} className={cl}>
                        <input
                          type="number" min="1" max="15"
                          className={`score-input${v!==""?" filled":""}`}
                          value={v}
                          onChange={e=>setScore(activePlayer, i+9, e.target.value)}
                        />
                      </td>
                    );
                  })}
                  <td className="subtotal">{backGross||"—"}</td>
                  <td className="subtotal">{frontGross&&backGross ? frontGross+backGross : "—"}</td>
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
            <button
              className="btn btn-primary"
              onClick={()=>handleSave(activePlayer)}
              disabled={saving===activePlayer}
            >
              {saving===activePlayer ? "Saving…" : saved[activePlayer] ? "✓ Saved" : "Save Scores"}
            </button>
            {saved[activePlayer] && (
              <button className="btn btn-ghost btn-sm" onClick={()=>handleDelete(activePlayer)}>Remove</button>
            )}
          </div>
        </div>
      </div>

      {/* Summary table */}
      <div className="card">
        <div className="card-header"><h2>All Scores — {course.name}</h2></div>
        <div className="card-body" style={{padding:0}}>
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Player</th><th>CH</th><th>Gross</th><th>Net</th><th>Net +/-</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {PLAYERS.map(p => {
                const ch2 = courseHandicap(pmap[p.id]?.ghin??p.ghin, course.slope);
                const gs = scores[p.id];
                const t = gs && gs.every(v=>v!=null&&!isNaN(v)) ? getRoundTotals(courseKey, p.id, gs.map(Number), ghinOverrides) : null;
                return (
                  <tr key={p.id} onClick={()=>setActivePlayer(p.id)} style={{cursor:"pointer", background:activePlayer===p.id?"var(--gray-100)":""}}>
                    <td style={{fontWeight:600}}>{p.name}</td>
                    <td className="text-mono">{ch2}</td>
                    <td className="text-mono">{t?.gross ?? "—"}</td>
                    <td className="text-mono">{t?.net ?? "—"}</td>
                    <td className="text-mono">{t ? (t.netToPar>0?"+":"")+t.netToPar : "—"}</td>
                    <td><span style={{fontSize:"0.75rem",color:saved[p.id]?"var(--green-mid)":"var(--gray-400)"}}>{saved[p.id]?"✓ Saved":"—"}</span></td>
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
