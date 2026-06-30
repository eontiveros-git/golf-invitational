import { useState } from "react";
import { useAppData } from "../lib/useAppData";
import { COURSES, COURSE_KEYS, courseHandicap } from "../lib/gameData";
import { calcSkins, skinPayouts, dailyLowNet, calcBestBall, calcSingles, getRoundTotals } from "../lib/scoring";

function toPar(n) {
  if (n===0) return <span style={{color:"var(--gray-600)"}}>E</span>;
  if (n<0)   return <span style={{color:"var(--green-mid)",fontWeight:700}}>{n}</span>;
  return <span style={{color:"var(--red)",fontWeight:700}}>+{n}</span>;
}
function fmtMoney(n) { return n>0?`$${n%1===0?n:n.toFixed(2)}`:"—"; }

export default function Results() {
  const { rounds, matchups, ctpWinners, loading, ghinOverrides, roundsByCourse, grossByCoursePlayer, teams, players } = useAppData();
  const [tab, setTab] = useState("bearDance");

  if (loading) return <div className="spinner"/>;

  const pName = id => players.find(p=>p.id===id)?.name ?? id;

  const course = COURSES[tab];
  const cr = roundsByCourse[tab] || [];
  const gMap = grossByCoursePlayer[tab] || {};

  const { skins, perSkin } = cr.length ? skinPayouts(tab, cr, ghinOverrides) : { skins:[], perSkin:0, totals:{} };
  const wonSkins = skins.filter(s=>s.winnerId);

  const { first: dlnFirst, second: dlnSecond } = cr.length
    ? dailyLowNet(tab, cr, ghinOverrides)
    : { first:[], second:[] };

  const courseMatchups = matchups.filter(m=>m.course_key===tab);
  const matchResults = courseMatchups.map(m => {
    const isSingles = tab==="frostCreek";
    const t1=m.team1_players||[], t2=m.team2_players||[];
    if (isSingles && t1[0]&&t2[0]&&gMap[t1[0]]&&gMap[t2[0]]) {
      return {...m, result: calcSingles(tab,t1[0],t2[0],gMap,ghinOverrides)};
    } else if (!isSingles && t1.length===2&&t2.length===2&&(t1.some(id=>gMap[id])||t2.some(id=>gMap[id]))) {
      return {...m, result: calcBestBall(tab,t1,t2,gMap,ghinOverrides)};
    }
    return {...m, result:null};
  });

  const rndLeader = cr
    .map(r => ({playerId:r.playerId, ...getRoundTotals(tab,r.playerId,r.grossScores,ghinOverrides)}))
    .sort((a,b)=>a.net-b.net);

  const courseCtp = ctpWinners.filter(c=>c.course_key===tab);
  const par3Holes = course.par.map((p,i)=>({p,i})).filter(x=>x.p===3);

  return (
    <div>
      <div style={{display:"flex",gap:"0.4rem",marginBottom:"1rem",flexWrap:"wrap"}}>
        {COURSE_KEYS.map(ck=>(
          <button key={ck} className={`btn btn-sm${tab===ck?" btn-primary":" btn-ghost"}`} onClick={()=>setTab(ck)}>
            {COURSES[ck].name}
          </button>
        ))}
      </div>

      {cr.length === 0 ? (
        <div className="card"><div className="card-body"><p className="text-muted">No scores entered for {course.name} yet.</p></div></div>
      ) : (
        <>
          {/* Leaderboard */}
          <div className="card mb-2">
            <div className="card-header">
              <h2>Leaderboard — {course.name}</h2>
              <span className="badge">{cr.length}/12 players</span>
            </div>
            <div className="card-body" style={{padding:0}}>
              <table className="leaderboard">
                <thead><tr><th>#</th><th>Player</th><th>Team</th><th>CH</th><th>Gross</th><th>G +/-</th><th>Net</th><th>N +/-</th></tr></thead>
                <tbody>
                  {rndLeader.map((s,i)=>{
                    const p = players.find(x=>x.id===s.playerId);
                    const ghin = ghinOverrides[p?.id]??p?.ghin??0;
                    const ch = courseHandicap(ghin, course.slope);
                    return (
                      <tr key={s.playerId}>
                        <td className="text-mono">{i+1}</td>
                        <td style={{fontWeight:600}}>{p?.name}</td>
                        <td><span className={`tag tag-team${p?.team}`}>{teams[p?.team]?.name}</span></td>
                        <td className="text-mono">{ch}</td>
                        <td className="text-mono">{s.gross}</td>
                        <td>{toPar(s.grossToPar)}</td>
                        <td className="text-mono" style={{fontWeight:700}}>{s.net}</td>
                        <td>{toPar(s.netToPar)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Skins */}
          <div className="card mb-2">
            <div className="card-header">
              <h2>Skins</h2>
              <span className="badge">{wonSkins.length} won · ${Math.round(perSkin)}/skin</span>
            </div>
            <div className="card-body">
              <div className="skins-grid" style={{marginBottom:"1rem"}}>
                {skins.map(s=>(
                  <div key={s.hole} className={`skin-hole${s.winnerId?" won":s.tied?.length?" tied":" empty"}`}>
                    <span className="hole-num">{s.hole}</span>
                    <span style={{fontSize:"0.7rem",marginTop:"1px"}}>
                      {s.winnerId ? pName(s.winnerId).split(" ")[0] : s.tied?.length?"TIE":"—"}
                    </span>
                  </div>
                ))}
              </div>
              {wonSkins.length > 0 && (
                <table className="leaderboard">
                  <thead><tr><th>Player</th><th>Skins</th><th>Winnings</th></tr></thead>
                  <tbody>
                    {players.filter(p=>wonSkins.some(s=>s.winnerId===p.id))
                      .sort((a,b)=>wonSkins.filter(s=>s.winnerId===b.id).length - wonSkins.filter(s=>s.winnerId===a.id).length)
                      .map(p=>(
                        <tr key={p.id}>
                          <td style={{fontWeight:600}}>{p.name}</td>
                          <td className="text-mono">{wonSkins.filter(s=>s.winnerId===p.id).length}</td>
                          <td className="prize">{fmtMoney(wonSkins.filter(s=>s.winnerId===p.id).length * perSkin)}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Daily Low Net */}
          <div className="card mb-2">
            <div className="card-header"><h2>Daily Low Net</h2><span className="badge">1st $80 · 2nd $40</span></div>
            <div className="card-body">
              {dlnFirst.length > 0 ? (
                <table className="leaderboard">
                  <thead><tr><th>Place</th><th>Player</th><th>Net</th><th>Winnings</th></tr></thead>
                  <tbody>
                    {dlnFirst.map(r=>(
                      <tr key={r.playerId}>
                        <td className="text-mono">1st</td>
                        <td style={{fontWeight:600}}>{pName(r.playerId)}</td>
                        <td className="text-mono">{r.net}</td>
                        <td className="prize">{fmtMoney(80/dlnFirst.length)}</td>
                      </tr>
                    ))}
                    {dlnSecond.map(r=>(
                      <tr key={r.playerId}>
                        <td className="text-mono">2nd</td>
                        <td style={{fontWeight:600}}>{pName(r.playerId)}</td>
                        <td className="text-mono">{r.net}</td>
                        <td className="prize">{fmtMoney(40/dlnSecond.length)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-muted">No scores yet.</p>}
            </div>
          </div>

          {/* Match Play */}
          {matchResults.length > 0 && (
            <div className="card mb-2">
              <div className="card-header">
                <h2>{tab==="frostCreek"?"Singles":"Best Ball"} Results</h2>
                <span className="badge">{tab==="frostCreek"?"6 matches · 1 pt ea":"3 matches · 1 pt ea"}</span>
              </div>
              <div className="card-body">
                {matchResults.map((m,mi)=>{
                  const res = m.result;
                  const isSingles = tab==="frostCreek";
                  const t1=m.team1_players||[], t2=m.team2_players||[];
                  let badgeCls="pending", badgeTxt="Pending";
                  if (res) {
                    if (isSingles) {
                      const rc1=res.rcPoints[t1[0]], rc2=res.rcPoints[t2[0]];
                      if (rc1>rc2)      { badgeCls="win1"; badgeTxt=`${pName(t1[0])} wins`; }
                      else if (rc2>rc1) { badgeCls="win2"; badgeTxt=`${pName(t2[0])} wins`; }
                      else              { badgeCls="halved"; badgeTxt="Halved"; }
                    } else {
                      if (res.rcPoints.team1>res.rcPoints.team2)      { badgeCls="win1"; badgeTxt=`${teams[1].name} wins`; }
                      else if (res.rcPoints.team2>res.rcPoints.team1) { badgeCls="win2"; badgeTxt=`${teams[2].name} wins`; }
                      else { badgeCls="halved"; badgeTxt="Halved 1.5-1.5"; }
                    }
                  }
                  return (
                    <div key={mi} className="match-card">
                      <div className="match-card-header">
                        <span style={{fontWeight:700,color: isSingles ? (players.find(p=>p.id===t1[0])?.team===1?"var(--green-mid)":"var(--blue)") : "var(--green-mid)"}}>
                          {t1.map(pName).join(" / ")}
                        </span>
                        <span className="match-vs">vs</span>
                        <span style={{fontWeight:700,color: isSingles ? (players.find(p=>p.id===t2[0])?.team===1?"var(--green-mid)":"var(--blue)") : "var(--blue)"}}>
                          {t2.map(pName).join(" / ")}
                        </span>
                        <span className={`match-result-badge ${badgeCls}`}>{badgeTxt}</span>
                      </div>
                      {res && (
                        <div style={{padding:"0.5rem 1rem",overflowX:"auto"}}>
                          <div style={{display:"flex",gap:"3px",minWidth:"max-content"}}>
                            {res.holes.map(h=>(
                              <div key={h.hole} style={{
                                width:28,height:28,display:"flex",flexDirection:"column",
                                alignItems:"center",justifyContent:"center",borderRadius:3,
                                background: h.winner===1||h.winner===t1[0]?"var(--green-light)"
                                          : h.winner===2||h.winner===t2[0]?"var(--blue)"
                                          : h.winner==="half"?"var(--gray-200)":"var(--gray-100)",
                                color: h.winner&&h.winner!=="half"?"#fff":"var(--gray-600)",
                                fontSize:"0.6rem",fontWeight:700,
                              }}>
                                <span style={{fontSize:"0.5rem",opacity:0.7}}>{h.hole}</span>
                                <span>{h.winner==="half"?"½":h.winner===null?"·":""}</span>
                              </div>
                            ))}
                          </div>
                          {!isSingles && res.holeWins && (
                            <div style={{marginTop:"0.4rem",fontSize:"0.78rem",display:"flex",flexDirection:"column",gap:"0.1rem"}}>
                              <span style={{color:"var(--green-mid)",fontWeight:600}}>{teams[1].name} {res.holeWins.team1}</span>
                              <span style={{color:"var(--blue)",fontWeight:600}}>{teams[2].name} {res.holeWins.team2}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTP */}
          {par3Holes.length > 0 && (
            <div className="card">
              <div className="card-header"><h2>Closest to Pin</h2><span className="badge">Par 3s</span></div>
              <div className="card-body">
                <div className="ctp-grid">
                  {par3Holes.map(({i})=>{
                    const winner = courseCtp.find(c=>c.hole_index===i);
                    return (
                      <div key={i} className={`ctp-item${winner?" won":""}`}>
                        <div className="ctp-label">Hole {i+1}</div>
                        <div className="ctp-winner">{winner?`🏆 ${pName(winner.player_id)}`:"—"}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
