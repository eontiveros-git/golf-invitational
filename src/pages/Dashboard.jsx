import { useState } from "react";
import { useAppData } from "../lib/useAppData";
import { COURSES, COURSE_KEYS, courseHandicap } from "../lib/gameData";
import { overallStandings, skinPayouts, dailyLowNet, calcBestBall, calcSingles, getRoundTotals } from "../lib/scoring";

function toPar(n) {
  if (n===0) return <span style={{color:"var(--gray-600)"}}>E</span>;
  if (n<0)   return <span style={{color:"var(--green-mid)",fontWeight:700}}>{n}</span>;
  return <span style={{color:"var(--red)",fontWeight:700}}>+{n}</span>;
}
function fmtMoney(n) {
  const r = Math.round(n);
  if (r===0) return <span style={{color:"var(--gray-400)"}}>Even</span>;
  if (r>0)   return <span style={{color:"var(--green-mid)",fontWeight:700}}>+${r}</span>;
  return <span style={{color:"var(--red)",fontWeight:700}}>-${Math.abs(r)}</span>;
}

export default function Dashboard({ onNavigate }) {
  const { rounds, matchups, ctpWinners, loading, ghinOverrides, roundsByCourse, grossByCoursePlayer, teams, players, courses } = useAppData();
  const [sortBy, setSortBy] = useState("net");
  const [resultsTab, setResultsTab] = useState(null); // null = overview, else courseKey

  if (loading) return <div className="spinner"/>;

  const pName = id => players.find(p=>p.id===id)?.name ?? id;

  // ── Ryder Cup ──────────────────────────────────────────────────────────
  let rcTeam1=0, rcTeam2=0;
  const mvpPoints = {};
  players.forEach(p=>(mvpPoints[p.id]=0));
  matchups.forEach(m => {
    const gMap = grossByCoursePlayer[m.course_key]||{};
    const isSingles = m.course_key==="frostCreek";
    const t1=m.team1_players||[], t2=m.team2_players||[];
    if (isSingles&&t1[0]&&t2[0]&&gMap[t1[0]]&&gMap[t2[0]]) {
      const r=calcSingles(m.course_key,t1[0],t2[0],gMap,ghinOverrides,courses);
      rcTeam1+=(r.rcPoints[t1[0]]||0); rcTeam2+=(r.rcPoints[t2[0]]||0);
      [t1[0],t2[0]].forEach(id=>{mvpPoints[id]+=(r.rcPoints[id]||0);});
    } else if (!isSingles&&t1.length===2&&t2.length===2&&(t1.some(id=>gMap[id])||t2.some(id=>gMap[id]))) {
      const r=calcBestBall(m.course_key,t1,t2,gMap,ghinOverrides,courses);
      rcTeam1+=r.rcPoints.team1; rcTeam2+=r.rcPoints.team2;
      t1.forEach(id=>{mvpPoints[id]+=r.rcPoints.team1/2;});
      t2.forEach(id=>{mvpPoints[id]+=r.rcPoints.team2/2;});
    }
  });
  const maxMvp = Math.max(0,...Object.values(mvpPoints));
  const mvpPlayers = maxMvp>0 ? players.filter(p=>mvpPoints[p.id]===maxMvp) : [];

  // ── Money (net nightly pots only) ──────────────────────────────────────
  const dailyMoney = {};
  players.forEach(p=>{dailyMoney[p.id]={total:0};COURSE_KEYS.forEach(ck=>{dailyMoney[p.id][ck]=0;});});
  COURSE_KEYS.forEach(ck=>{
    const cr=roundsByCourse[ck]||[];
    if(!cr.length) return;
    const {netTotals:skinNet}=skinPayouts(ck,cr,ghinOverrides,courses);
    const {netPayouts:lnNet}=dailyLowNet(ck,cr,ghinOverrides,courses);
    const ctpNet={};
    cr.forEach(r=>(ctpNet[r.playerId]=0));
    ctpWinners.filter(c=>c.course_key===ck).forEach(c=>{
      if(!c.player_id) return;
      cr.forEach(r=>{ctpNet[r.playerId]=(ctpNet[r.playerId]||0)-5;});
      ctpNet[c.player_id]=(ctpNet[c.player_id]||0)+5*cr.length;
    });
    players.forEach(p=>{
      const amt=(skinNet[p.id]||0)+(lnNet[p.id]||0)+(ctpNet[p.id]||0);
      dailyMoney[p.id][ck]+=amt;
      dailyMoney[p.id].total+=amt;
    });
  });

  // ── Overall standings ──────────────────────────────────────────────────
  const standings = overallStandings(rounds,ghinOverrides,courses)
    .filter(s=>s.rounds>0)
    .sort((a,b)=>sortBy==="gross"?a.totalGross-b.totalGross:a.totalNet-b.totalNet);

  const roundsPlayed = COURSE_KEYS.filter(ck=>(roundsByCourse[ck]?.length||0)>0);

  // ── If a results sub-tab is selected, show that course's detail ────────
  if (resultsTab) {
    const ck = resultsTab;
    const course = courses[ck]||COURSES[ck];
    const cr = roundsByCourse[ck]||[];
    const gMap = grossByCoursePlayer[ck]||{};
    const {skins,perSkin,remainder:skinRem,totals:skinTotals}=cr.length?skinPayouts(ck,cr,ghinOverrides,courses):{skins:[],perSkin:0,remainder:0,totals:{}};
    const wonSkins=skins.filter(s=>s.winnerId);
    const {first:dlnFirst,second:dlnSecond}=cr.length?dailyLowNet(ck,cr,ghinOverrides,courses):{first:[],second:[]};
    const courseMatchups=matchups.filter(m=>m.course_key===ck);
    const matchResults=courseMatchups.map(m=>{
      const isSingles=ck==="frostCreek";
      const t1=m.team1_players||[],t2=m.team2_players||[];
      if(isSingles&&t1[0]&&t2[0]&&gMap[t1[0]]&&gMap[t2[0]])
        return{...m,result:calcSingles(ck,t1[0],t2[0],gMap,ghinOverrides,courses)};
      if(!isSingles&&t1.length===2&&t2.length===2&&(t1.some(id=>gMap[id])||t2.some(id=>gMap[id])))
        return{...m,result:calcBestBall(ck,t1,t2,gMap,ghinOverrides,courses)};
      return{...m,result:null};
    });
    const rndLeader=cr.map(r=>({playerId:r.playerId,...getRoundTotals(ck,r.playerId,r.grossScores,ghinOverrides,courses)})).sort((a,b)=>a.net-b.net);
    const par3Holes=course.par.map((p,i)=>({p,i})).filter(x=>x.p===3);
    const courseCtp=ctpWinners.filter(c=>c.course_key===ck);

    return (
      <div>
        {/* Back nav */}
        <div style={{display:"flex",gap:"0.5rem",marginBottom:"1rem",flexWrap:"wrap",alignItems:"center"}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setResultsTab(null)}>← Overview</button>
          <span style={{fontWeight:700,fontSize:"var(--text-lg)"}}>{course.name} — {course.day}</span>
          <span style={{fontSize:"var(--text-xs)",color:"var(--gray-400)"}}>{course.tees} Tees · {course.rating} / {course.slope}</span>
        </div>
        <div style={{display:"flex",gap:"0.4rem",flexWrap:"wrap",marginBottom:"1rem"}}>
          {COURSE_KEYS.map(k=>(
            <button key={k} className={`btn btn-sm${k===ck?" btn-primary":" btn-ghost"}`} onClick={()=>setResultsTab(k)}>
              {COURSES[k].name.split(" ")[0]}
            </button>
          ))}
        </div>

        {cr.length===0 ? (
          <div className="card"><div className="card-body"><p className="text-muted">No scores entered for {course.name} yet.</p></div></div>
        ) : (
          <>
            {/* Leaderboard */}
            <div className="card mb-2">
              <div className="card-header"><h2>Leaderboard</h2><span className="badge">{cr.length}/12 players</span></div>
              <div className="card-body" style={{padding:0}}>
                <table className="leaderboard">
                  <thead><tr><th>#</th><th>Player</th><th>Team</th><th>CH</th><th>Gross</th><th>G+/-</th><th>Net</th><th>N+/-</th></tr></thead>
                  <tbody>
                    {rndLeader.map((s,i)=>{
                      const p=players.find(x=>x.id===s.playerId);
                      const ch=courseHandicap(ghinOverrides[p?.id]??p?.ghin??0,course.slope,course.rating,course.par.reduce((a,b)=>a+b,0));
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

            <div className="grid-2 mb-2">
              {/* Skins */}
              <div className="card">
                <div className="card-header"><h2>Skins</h2><span className="badge">{wonSkins.length} won · ${perSkin}{skinRem>0?`–${perSkin+1}`:""}/skin</span></div>
                <div className="card-body">
                  <div className="skins-grid" style={{marginBottom:"0.75rem"}}>
                    {skins.map(s=>(
                      <div key={s.hole} className={`skin-hole${s.winnerId?" won":s.tied?.length?" tied":" empty"}`}>
                        <span className="hole-num">{s.hole}</span>
                        <span style={{fontSize:"0.7rem"}}>{s.winnerId?pName(s.winnerId).split(" ")[0]:s.tied?.length?"TIE":"—"}</span>
                      </div>
                    ))}
                  </div>
                  {wonSkins.length>0&&(
                    <table className="leaderboard">
                      <thead><tr><th>Player</th><th>Skins</th><th>Winnings</th></tr></thead>
                      <tbody>
                        {players.filter(p=>wonSkins.some(s=>s.winnerId===p.id))
                          .sort((a,b)=>wonSkins.filter(s=>s.winnerId===b.id).length-wonSkins.filter(s=>s.winnerId===a.id).length)
                          .map(p=>(
                            <tr key={p.id}>
                              <td style={{fontWeight:600}}>{p.name}</td>
                              <td className="text-mono">{wonSkins.filter(s=>s.winnerId===p.id).length}</td>
                              <td className="prize">${skinTotals[p.id]||0}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Low Net + CTP */}
              <div>
                <div className="card mb-2">
                  <div className="card-header"><h2>Daily Low Net</h2><span className="badge">1st $80 · 2nd $40</span></div>
                  <div className="card-body">
                    {dlnFirst.length>0?(
                      <table className="leaderboard">
                        <thead><tr><th>Place</th><th>Player</th><th>Net</th><th>Payout</th></tr></thead>
                        <tbody>
                          {dlnFirst.map(r=><tr key={r.playerId}><td>1st</td><td style={{fontWeight:600}}>{pName(r.playerId)}</td><td className="text-mono">{r.net}</td><td className="prize">${80/dlnFirst.length}</td></tr>)}
                          {dlnSecond.map(r=><tr key={r.playerId}><td>2nd</td><td style={{fontWeight:600}}>{pName(r.playerId)}</td><td className="text-mono">{r.net}</td><td className="prize">${40/dlnSecond.length}</td></tr>)}
                        </tbody>
                      </table>
                    ):<p className="text-muted">No scores yet.</p>}
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><h2>Closest to Pin</h2></div>
                  <div className="card-body">
                    <div className="ctp-grid">
                      {par3Holes.map(({i})=>{
                        const winner=courseCtp.find(c=>c.hole_index===i);
                        return(
                          <div key={i} className={`ctp-item${winner?" won":""}`}>
                            <div className="ctp-label">Hole {i+1}</div>
                            <div className="ctp-winner">{winner?`🏆 ${pName(winner.player_id)}`:"—"}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Match Play */}
            {matchResults.length>0&&(
              <div className="card">
                <div className="card-header">
                  <h2>{ck==="frostCreek"?"Singles":"Best Ball"} Results</h2>
                  <span className="badge">{ck==="frostCreek"?"6 matches · 1 pt ea":"3 matches · 1 pt ea"}</span>
                </div>
                <div className="card-body">
                  {matchResults.map((m,mi)=>{
                    const res=m.result;
                    const isSingles=ck==="frostCreek";
                    const t1=m.team1_players||[],t2=m.team2_players||[];
                    let badgeCls="pending",badgeTxt="Pending";
                    if(res){
                      const mp=res.matchPlay;
                      if(isSingles){
                        const rc1=res.rcPoints[t1[0]],rc2=res.rcPoints[t2[0]];
                        if(rc1>rc2){badgeCls="win1";badgeTxt=mp?.isFinal?`${pName(t1[0])} wins ${mp.label}`:`${pName(t1[0])} ${mp?.label||""}`;}
                        else if(rc2>rc1){badgeCls="win2";badgeTxt=mp?.isFinal?`${pName(t2[0])} wins ${mp.label}`:`${pName(t2[0])} ${mp?.label||""}`;}
                        else{badgeCls="halved";badgeTxt=mp?.label||"Halved";}
                      } else {
                        if(res.rcPoints.team1>res.rcPoints.team2){badgeCls="win1";badgeTxt=mp?.isFinal?`${teams[1].name} wins ${mp.label}`:`${teams[1].name} ${mp?.label||""}`;}
                        else if(res.rcPoints.team2>res.rcPoints.team1){badgeCls="win2";badgeTxt=mp?.isFinal?`${teams[2].name} wins ${mp.label}`:`${teams[2].name} ${mp?.label||""}`;}
                        else{badgeCls="halved";badgeTxt=mp?.label||"Halved";}
                      }
                    }
                    return(
                      <div key={mi} className="match-card">
                        <div className="match-card-header">
                          <span style={{fontWeight:700,color:"var(--green-mid)"}}>{t1.map(pName).join(" / ")}</span>
                          <span className="match-vs">vs</span>
                          <span style={{fontWeight:700,color:"var(--blue)"}}>{t2.map(pName).join(" / ")}</span>
                          <span className={`match-result-badge ${badgeCls}`}>{badgeTxt}</span>
                        </div>
                        {res&&(
                          <div style={{padding:"0.5rem 1rem",overflowX:"auto"}}>
                            <div style={{display:"flex",gap:"3px",minWidth:"max-content"}}>
                              {res.holes.map(h=>(
                                <div key={h.hole} style={{width:28,height:28,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:3,
                                  background:h.winner===1||h.winner===t1[0]?"var(--green-light)":h.winner===2||h.winner===t2[0]?"var(--blue)":h.winner==="half"?"var(--gray-200)":"var(--gray-100)",
                                  color:h.winner&&h.winner!=="half"?"#fff":"var(--gray-600)",fontSize:"0.6rem",fontWeight:700}}>
                                  <span style={{fontSize:"0.5rem",opacity:0.7}}>{h.hole}</span>
                                  <span>{h.winner==="half"?"½":h.winner===null?"·":""}</span>
                                </div>
                              ))}
                            </div>
                            {!isSingles&&res.holeWins&&(
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
          </>
        )}
      </div>
    );
  }

  // ── OVERVIEW (default) ─────────────────────────────────────────────────
  return (
    <div>
      {/* Ryder Cup Banner */}
      <div className="rc-banner mb-3">
        <div className="rc-team">
          <div className="rc-team-name">{teams[1].name}</div>
          <div className="rc-score">{rcTeam1%1===0?rcTeam1:rcTeam1.toFixed(1)}</div>
          <div className="rc-needed">Need 8 to win</div>
        </div>
        <div style={{textAlign:"center"}}>
          <div className="rc-divider">VS</div>
          {mvpPlayers.length>0&&(
            <div style={{marginTop:"0.5rem",background:"var(--gold)",color:"var(--green-deep)",borderRadius:4,padding:"0.2rem 0.6rem",fontSize:"var(--text-xs)",fontWeight:700}}>
              MVP: {mvpPlayers.map(p=>p.name).join(" / ")} ({maxMvp.toFixed(1)} pts)
            </div>
          )}
        </div>
        <div className="rc-team">
          <div className="rc-team-name">{teams[2].name}</div>
          <div className="rc-score">{rcTeam2%1===0?rcTeam2:rcTeam2.toFixed(1)}</div>
          <div className="rc-needed">Need 8 to win</div>
        </div>
      </div>

      <div className="grid-2 mb-3">
        {/* Leaderboard */}
        <div className="card">
          <div className="card-header">
            <h2>Overall Leaderboard</h2>
            <span className="badge">{roundsPlayed.length}/4 Rounds</span>
          </div>
          <div className="card-body" style={{padding:0}}>
            {standings.length===0?(
              <p className="text-muted" style={{padding:"1rem"}}>No scores entered yet.</p>
            ):(
              <table className="leaderboard">
                <thead><tr>
                  <th>#</th><th>Player</th><th>Team</th>
                  <th onClick={()=>setSortBy("gross")} style={{cursor:"pointer",color:sortBy==="gross"?"var(--gold)":undefined}}>Gross{sortBy==="gross"?" ▾":""}</th>
                  <th onClick={()=>setSortBy("net")}   style={{cursor:"pointer",color:sortBy==="net"?"var(--gold)":undefined}}>Net{sortBy==="net"?" ▾":""}</th>
                  <th>Rnds</th>
                </tr></thead>
                <tbody>
                  {standings.map((s,i)=>{
                    const p=players.find(x=>x.id===s.playerId);
                    return(
                      <tr key={s.playerId}>
                        <td className="text-mono">{i+1}</td>
                        <td style={{fontWeight:600}}>{p?.name}</td>
                        <td><span className={`tag tag-team${p?.team}`}>{teams[p?.team]?.name}</span></td>
                        <td className="text-mono" style={{fontWeight:sortBy==="gross"?700:400}}>{s.totalGross}</td>
                        <td className="text-mono" style={{fontWeight:sortBy==="net"?700:400}}>{s.totalNet}</td>
                        <td className="text-mono">{s.rounds}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Money */}
        <div className="card">
          <div className="card-header"><h2>Money Won</h2><span className="badge">Net · Skins + LN + CTP</span></div>
          <div className="card-body" style={{padding:0,overflowX:"auto"}}>
            <table className="leaderboard" style={{minWidth:360}}>
              <thead><tr>
                <th>Player</th>
                {roundsPlayed.map(ck=><th key={ck} style={{textAlign:"center"}}>{COURSES[ck].day.slice(0,3)}</th>)}
                <th style={{textAlign:"right"}}>Total</th>
              </tr></thead>
              <tbody>
                {players.map(p=>({p,total:Math.round(dailyMoney[p.id]?.total||0)}))
                  .sort((a,b)=>b.total-a.total)
                  .map(({p})=>(
                    <tr key={p.id}>
                      <td style={{fontWeight:600}}>{p.name}</td>
                      {roundsPlayed.map(ck=>{
                        const v=Math.round(dailyMoney[p.id]?.[ck]||0);
                        return <td key={ck} className="text-mono" style={{textAlign:"center",color:v>0?"var(--green-mid)":v<0?"var(--red)":"var(--gray-300)"}}>
                          {v>0?`+$${v}`:v<0?`-$${Math.abs(v)}`:"—"}
                        </td>;
                      })}
                      <td style={{textAlign:"right",fontFamily:"var(--font-mono)",fontWeight:700}}>
                        {fmtMoney(Math.round(dailyMoney[p.id]?.total||0))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Round cards → tap to drill in */}
      <div className="card mb-3">
        <div className="card-header"><h2>Results by Round</h2><span className="badge">Tap to view detail</span></div>
        <div className="card-body">
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:"0.75rem"}}>
            {COURSE_KEYS.map(ck=>{
              const course=courses[ck]||COURSES[ck];
              const cr=roundsByCourse[ck]||[];
              return(
                <div key={ck} onClick={()=>setResultsTab(ck)}
                  style={{border:"1px solid var(--gray-200)",borderRadius:5,padding:"0.75rem",cursor:"pointer",transition:"border-color 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor="var(--green-mid)"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="var(--gray-200)"}
                >
                  <div style={{fontWeight:700,fontSize:"var(--text-base)",marginBottom:"0.2rem"}}>{course.name}</div>
                  <div className="text-muted">{course.day} · {course.tees} Tees</div>
                  <div style={{marginTop:"0.4rem",display:"flex",alignItems:"center",gap:"0.5rem"}}>
                    <span className="text-mono" style={{fontWeight:700,fontSize:"1.1rem",color:cr.length===12?"var(--green-mid)":"var(--gold)"}}>{cr.length}/12</span>
                    <span className="text-muted">scorecards</span>
                    {cr.length>0&&<span style={{marginLeft:"auto",fontSize:"var(--text-xs)",color:"var(--green-mid)",fontWeight:600}}>View →</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CTP */}
      {ctpWinners.length>0&&(
        <div className="card">
          <div className="card-header"><h2>Closest to Pin</h2></div>
          <div className="card-body">
            <div className="ctp-grid">
              {ctpWinners.map(c=>{
                const p=players.find(x=>x.id===c.player_id);
                return(
                  <div key={`${c.course_key}-${c.hole_index}`} className="ctp-item won">
                    <div className="ctp-label">{COURSES[c.course_key].name} · Hole {c.hole_index+1}</div>
                    <div className="ctp-winner">🏆 {p?.name}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
