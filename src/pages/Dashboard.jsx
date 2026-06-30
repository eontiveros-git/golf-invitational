import { useState } from "react";
import { useAppData } from "../lib/useAppData";
import { COURSES, COURSE_KEYS } from "../lib/gameData";
import { overallStandings, skinPayouts, dailyLowNet, calcBestBall, calcSingles } from "../lib/scoring";

function fmtMoney(n) { return n <= 0 ? "—" : `$${Math.round(n)}`; }

export default function Dashboard() {
  const { rounds, matchups, ctpWinners, loading, ghinOverrides, roundsByCourse, grossByCoursePlayer, teams, players } = useAppData();
  const [sortBy, setSortBy] = useState("net"); // "net" | "gross"

  if (loading) return <div className="spinner" />;

  // ── Ryder Cup points ──────────────────────────────────────────────────
  let rcTeam1 = 0, rcTeam2 = 0;
  matchups.forEach(m => {
    const gMap = grossByCoursePlayer[m.course_key] || {};
    const isSingles = m.course_key === "frostCreek";
    const t1 = m.team1_players || [], t2 = m.team2_players || [];
    if (isSingles && t1[0] && t2[0] && gMap[t1[0]] && gMap[t2[0]]) {
      const r = calcSingles(m.course_key, t1[0], t2[0], gMap, ghinOverrides);
      rcTeam1 += r.rcPoints[t1[0]] || 0;
      rcTeam2 += r.rcPoints[t2[0]] || 0;
    } else if (!isSingles && t1.length===2 && t2.length===2 && (t1.some(id=>gMap[id])||t2.some(id=>gMap[id]))) {
      const r = calcBestBall(m.course_key, t1, t2, gMap, ghinOverrides);
      rcTeam1 += r.rcPoints.team1;
      rcTeam2 += r.rcPoints.team2;
    }
  });

  // ── Overall standings ─────────────────────────────────────────────────
  const standings = overallStandings(rounds, ghinOverrides)
    .filter(s => s.rounds > 0)
    .sort((a,b) => sortBy === "gross" ? a.totalGross - b.totalGross : a.totalNet - b.totalNet);

  // ── Daily money breakdown ─────────────────────────────────────────────
  const dailyMoney = {};
  players.forEach(p => {
    dailyMoney[p.id] = { bearDance:0, redSky:0, lakota:0, frostCreek:0, total:0 };
  });
  COURSE_KEYS.forEach(ck => {
    const cr = roundsByCourse[ck] || [];
    if (!cr.length) return;
    const { totals: st } = skinPayouts(ck, cr, ghinOverrides);
    const { payouts: dp } = dailyLowNet(ck, cr, ghinOverrides);
    players.forEach(p => {
      const amt = (st[p.id]||0) + (dp[p.id]||0);
      dailyMoney[p.id][ck] += amt;
      dailyMoney[p.id].total += amt;
    });
  });

  // ── MVP ───────────────────────────────────────────────────────────────
  const mvpPoints = {};
  players.forEach(p => (mvpPoints[p.id] = 0));
  matchups.forEach(m => {
    const gMap = grossByCoursePlayer[m.course_key] || {};
    const isSingles = m.course_key === "frostCreek";
    const t1 = m.team1_players||[], t2 = m.team2_players||[];
    if (isSingles && t1[0] && t2[0] && gMap[t1[0]] && gMap[t2[0]]) {
      const r = calcSingles(m.course_key, t1[0], t2[0], gMap, ghinOverrides);
      [t1[0],t2[0]].forEach(id => { mvpPoints[id] += r.rcPoints[id]||0; });
    } else if (!isSingles && t1.length===2 && t2.length===2 && (t1.some(id=>gMap[id])||t2.some(id=>gMap[id]))) {
      const r = calcBestBall(m.course_key, t1, t2, gMap, ghinOverrides);
      t1.forEach(id => { mvpPoints[id] += r.rcPoints.team1/2; });
      t2.forEach(id => { mvpPoints[id] += r.rcPoints.team2/2; });
    }
  });
  const maxMvp = Math.max(...Object.values(mvpPoints));
  const mvpPlayers = maxMvp > 0 ? players.filter(p => mvpPoints[p.id] === maxMvp) : [];

  const roundsPlayed = COURSE_KEYS.filter(ck => (roundsByCourse[ck]?.length||0) > 0);

  return (
    <div>
      {/* Ryder Cup Banner */}
      <div className="rc-banner mb-3">
        <div className="rc-team">
          <div className="rc-team-name">{teams[1].name}</div>
          <div className="rc-score">{rcTeam1 % 1 === 0 ? rcTeam1 : rcTeam1.toFixed(1)}</div>
          <div className="rc-needed">Need 8 to win</div>
        </div>
        <div style={{textAlign:"center"}}>
          <div className="rc-divider">VS</div>
          {mvpPlayers.length > 0 && (
            <div style={{marginTop:"0.5rem",background:"var(--gold)",color:"var(--green-deep)",borderRadius:4,padding:"0.2rem 0.6rem",fontSize:"0.7rem",fontWeight:700}}>
              MVP: {mvpPlayers.map(p=>p.name).join(" / ")} ({maxMvp.toFixed(1)} pts)
            </div>
          )}
        </div>
        <div className="rc-team">
          <div className="rc-team-name">{teams[2].name}</div>
          <div className="rc-score">{rcTeam2 % 1 === 0 ? rcTeam2 : rcTeam2.toFixed(1)}</div>
          <div className="rc-needed">Need 8 to win</div>
        </div>
      </div>

      <div className="grid-2 mb-3">
        {/* Overall Leaderboard */}
        <div className="card">
          <div className="card-header">
            <h2>Overall Leaderboard</h2>
            <span className="badge">{roundsPlayed.length}/4 Rounds</span>
          </div>
          <div className="card-body" style={{padding:0}}>
            {standings.length === 0 ? (
              <p className="text-muted" style={{padding:"1rem"}}>No scores entered yet.</p>
            ) : (
              <table className="leaderboard">
                <thead><tr>
                  <th>#</th><th>Player</th><th>Team</th>
                  <th
                    onClick={()=>setSortBy("gross")}
                    style={{cursor:"pointer", color: sortBy==="gross" ? "var(--gold)" : undefined}}
                    title="Sort by Gross"
                  >
                    Gross{sortBy==="gross" ? " ▾" : ""}
                  </th>
                  <th
                    onClick={()=>setSortBy("net")}
                    style={{cursor:"pointer", color: sortBy==="net" ? "var(--gold)" : undefined}}
                    title="Sort by Net"
                  >
                    Net{sortBy==="net" ? " ▾" : ""}
                  </th>
                  <th>Rnds</th>
                </tr></thead>
                <tbody>
                  {standings.map((s,i) => {
                    const p = players.find(x=>x.id===s.playerId);
                    return (
                      <tr key={s.playerId}>
                        <td className="text-mono">{i+1}</td>
                        <td style={{fontWeight:600}}>{p?.name}</td>
                        <td><span className={`tag tag-team${p?.team}`}>{teams[p?.team]?.name}</span></td>
                        <td className="text-mono" style={{fontWeight: sortBy==="gross"?700:400}}>{s.totalGross}</td>
                        <td className="text-mono" style={{fontWeight: sortBy==="net"?700:400}}>{s.totalNet}</td>
                        <td className="text-mono">{s.rounds}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Daily Money */}
        <div className="card">
          <div className="card-header"><h2>Money Won</h2><span className="badge">Skins + Low Net</span></div>
          <div className="card-body" style={{padding:0}}>
            <div style={{overflowX:"auto"}}>
              <table className="leaderboard" style={{minWidth:380}}>
                <thead>
                  <tr>
                    <th>Player</th>
                    {COURSE_KEYS.filter(ck=>(roundsByCourse[ck]?.length||0)>0).map(ck=>(
                      <th key={ck}>{COURSES[ck].day.slice(0,3)}</th>
                    ))}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {players
                    .map(p => ({ p, total: dailyMoney[p.id]?.total||0 }))
                    .sort((a,b) => b.total - a.total)
                    .map(({ p }) => (
                      <tr key={p.id}>
                        <td style={{fontWeight:600}}>{p.name}</td>
                        {COURSE_KEYS.filter(ck=>(roundsByCourse[ck]?.length||0)>0).map(ck=>(
                          <td key={ck} className="text-mono" style={{color:dailyMoney[p.id]?.[ck]>0?"var(--green-mid)":"var(--gray-400)"}}>
                            {fmtMoney(dailyMoney[p.id]?.[ck]||0)}
                          </td>
                        ))}
                        <td className="prize" style={{fontWeight:700}}>{fmtMoney(dailyMoney[p.id]?.total||0)}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Round Status */}
      <div className="card mb-3">
        <div className="card-header"><h2>Round Status</h2></div>
        <div className="card-body">
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:"0.75rem"}}>
            {COURSE_KEYS.map(ck => {
              const course = COURSES[ck];
              const cr = roundsByCourse[ck] || [];
              return (
                <div key={ck} style={{border:"1px solid var(--gray-200)",borderRadius:5,padding:"0.75rem"}}>
                  <div style={{fontWeight:700,fontSize:"0.85rem",marginBottom:"0.25rem"}}>{course.name}</div>
                  <div className="text-muted">{course.day} · {course.tees} Tees</div>
                  <div style={{marginTop:"0.4rem",display:"flex",alignItems:"center",gap:"0.5rem"}}>
                    <span className="text-mono" style={{fontWeight:700,fontSize:"1.1rem",color:cr.length===12?"var(--green-mid)":"var(--gold)"}}>{cr.length}/12</span>
                    <span className="text-muted">scorecards in</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CTP */}
      {ctpWinners.length > 0 && (
        <div className="card">
          <div className="card-header"><h2>Closest to Pin</h2></div>
          <div className="card-body">
            <div className="ctp-grid">
              {ctpWinners.map(c => {
                const player = players.find(p=>p.id===c.player_id);
                const course = COURSES[c.course_key];
                return (
                  <div key={`${c.course_key}-${c.hole_index}`} className="ctp-item won">
                    <div className="ctp-label">{course.name} · Hole {c.hole_index+1}</div>
                    <div className="ctp-winner">🏆 {player?.name}</div>
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
