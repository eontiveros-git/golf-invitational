import { useAppData } from "../lib/useAppData";
import { COURSES, COURSE_KEYS } from "../lib/gameData";
import { skinPayouts, dailyLowNet, calcSettlement } from "../lib/scoring";

function fmt(n) { return `$${Math.abs(Math.round(n))}`; }
function fmtSigned(n) {
  const r = Math.round(n);
  if (r === 0) return <span style={{color:"var(--gray-400)"}}>$0</span>;
  if (r > 0)   return <span style={{color:"var(--green-mid)",fontWeight:700}}>+${r}</span>;
  return <span style={{color:"var(--red)",fontWeight:700}}>-${Math.abs(r)}</span>;
}

export default function Settlement() {
  const { rounds, matchups, ctpWinners, loading, ghinOverrides, roundsByCourse, grossByCoursePlayer, players, teams } = useAppData();

  if (loading) return <div className="spinner"/>;

  const roundsPlayed = COURSE_KEYS.filter(ck=>(roundsByCourse[ck]?.length||0)>0);
  const hasData = roundsPlayed.length > 0;

  // ── Daily breakdown per player per course ─────────────────────────────
  const dailyBreakdown = {};
  players.forEach(p => { dailyBreakdown[p.id] = {}; });

  COURSE_KEYS.forEach(ck => {
    const cr = roundsByCourse[ck]||[];
    if (!cr.length) return;
    const { totals: skinTotals } = skinPayouts(ck, cr, ghinOverrides);
    const { payouts: lnPayouts } = dailyLowNet(ck, cr, ghinOverrides);
    const ctpForCourse = ctpWinners.filter(c=>c.course_key===ck);
    players.forEach(p => {
      const ctpWon = ctpForCourse.filter(c=>c.player_id===p.id).length * 60;
      dailyBreakdown[p.id][ck] = {
        skins:  Math.round(skinTotals[p.id]||0),
        lowNet: Math.round(lnPayouts[p.id]||0),
        ctp:    ctpWon,
      };
    });
  });

  // ── Full settlement ───────────────────────────────────────────────────
  const { balance, transactions } = calcSettlement(
    rounds, matchups, ctpWinners, ghinOverrides,
    roundsByCourse, grossByCoursePlayer, players
  );

  const sortedPlayers = [...players].sort((a,b) => balance[b.id] - balance[a.id]);

  return (
    <div>
      {!hasData ? (
        <div className="card"><div className="card-body"><p className="text-muted">No scores entered yet.</p></div></div>
      ) : (
        <>
          {/* Daily Winnings Table */}
          <div className="card mb-3">
            <div className="card-header">
              <h2>Daily Winnings</h2>
              <span className="badge">Skins + Low Net + CTP</span>
            </div>
            <div className="card-body" style={{padding:0,overflowX:"auto"}}>
              <table className="leaderboard" style={{minWidth:540}}>
                <thead>
                  <tr>
                    <th>Player</th>
                    {roundsPlayed.map(ck=>(
                      <th key={ck} colSpan={3} style={{textAlign:"center",borderLeft:"1px solid rgba(255,255,255,0.1)"}}>
                        {COURSES[ck].day.slice(0,3)}
                      </th>
                    ))}
                    <th>Total</th>
                  </tr>
                  <tr>
                    <th style={{background:"var(--green-deep)",borderTop:"1px solid rgba(255,255,255,0.1)"}}></th>
                    {roundsPlayed.map(ck=>(
                      [["s","Skins"],["l","LN"],["c","CTP"]].map(([key,label])=>(
                        <th key={ck+key} style={{background:"var(--green-deep)",fontSize:"0.62rem",color:"var(--green-light)",borderTop:"1px solid rgba(255,255,255,0.1)"}}>
                          {label}
                        </th>
                      ))
                    ))}
                    <th style={{background:"var(--green-deep)",borderTop:"1px solid rgba(255,255,255,0.1)"}}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map(p=>{
                    const dayTotal = roundsPlayed.reduce((sum,ck)=>{
                      const d = dailyBreakdown[p.id][ck];
                      return sum + (d?.skins||0) + (d?.lowNet||0) + (d?.ctp||0);
                    }, 0);
                    return (
                      <tr key={p.id}>
                        <td style={{fontWeight:600}}>{p.name}</td>
                        {roundsPlayed.map(ck=>{
                          const d = dailyBreakdown[p.id][ck];
                          return [
                            <td key={ck+"s"} className="text-mono" style={{color:d?.skins>0?"var(--green-mid)":"var(--gray-300)",textAlign:"center"}}>
                              {d?.skins>0?`$${d.skins}`:"—"}
                            </td>,
                            <td key={ck+"l"} className="text-mono" style={{color:d?.lowNet>0?"var(--green-mid)":"var(--gray-300)",textAlign:"center"}}>
                              {d?.lowNet>0?`$${d.lowNet}`:"—"}
                            </td>,
                            <td key={ck+"c"} className="text-mono" style={{color:d?.ctp>0?"var(--gold)":"var(--gray-300)",textAlign:"center"}}>
                              {d?.ctp>0?`$${d.ctp}`:"—"}
                            </td>,
                          ];
                        })}
                        <td className="prize" style={{fontWeight:700}}>
                          {dayTotal>0?`$${dayTotal}`:"—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Net Position */}
          <div className="card mb-3">
            <div className="card-header">
              <h2>Net Position</h2>
              <span className="badge">After all buy-ins & winnings</span>
            </div>
            <div className="card-body" style={{padding:0}}>
              <table className="leaderboard">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Team</th>
                    <th title="Skins + Low Net + CTP + Ryder Cup + MVP">Winnings</th>
                    <th title="$35/day played + $50 RC + $10 MVP">Buy-ins</th>
                    <th>Net</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map(p=>{
                    const net = Math.round(balance[p.id]);
                    const daysPlayed = COURSE_KEYS.filter(ck=>roundsByCourse[ck]?.some(r=>r.playerId===p.id)).length;
                    const buyIn = daysPlayed*35 + 60; // $35/day + $50 RC + $10 MVP
                    const winnings = Math.round(balance[p.id] + buyIn);
                    return (
                      <tr key={p.id}>
                        <td style={{fontWeight:600}}>{p.name}</td>
                        <td><span className={`tag tag-team${p.team}`}>{teams[p.team]?.name}</span></td>
                        <td className="text-mono" style={{color:"var(--green-mid)"}}>{winnings>0?`$${winnings}`:"—"}</td>
                        <td className="text-mono" style={{color:"var(--gray-600)"}}>-${buyIn}</td>
                        <td>{fmtSigned(net)}</td>
                        <td style={{fontSize:"0.8rem"}}>
                          {net>0 ? <span style={{color:"var(--green-mid)",fontWeight:600}}>Collecting {fmt(net)}</span>
                          : net<0 ? <span style={{color:"var(--red)",fontWeight:600}}>Owes {fmt(net)}</span>
                          : <span style={{color:"var(--gray-400)"}}>Even</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{padding:"0.6rem 1rem",background:"var(--gray-100)",fontSize:"0.75rem",color:"var(--gray-600)",borderTop:"1px solid var(--gray-200)"}}>
                Buy-ins: $35/day (skins $20 + low net $10 + CTP $5) + $50 Ryder Cup + $10 MVP. Ryder Cup and MVP finalized after all rounds.
              </div>
            </div>
          </div>

          {/* Settlement transactions */}
          {transactions.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2>Who Pays Who</h2>
                <span className="badge">{transactions.length} transactions</span>
              </div>
              <div className="card-body">
                <p style={{fontSize:"0.82rem",color:"var(--gray-400)",marginBottom:"1rem"}}>
                  Minimum transactions to settle all balances. Nightly: pay out skins + low net + CTP. Final night: full settlement including Ryder Cup and MVP.
                </p>
                <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
                  {transactions.map((t,i)=>{
                    const fromPlayer = players.find(p=>p.id===t.from);
                    const toPlayer   = players.find(p=>p.id===t.to);
                    return (
                      <div key={i} style={{
                        display:"flex",alignItems:"center",gap:"0.75rem",
                        padding:"0.65rem 1rem",borderRadius:5,
                        border:"1px solid var(--gray-200)",background:"var(--white)",
                      }}>
                        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",minWidth:100}}>
                          <span className={`tag tag-team${fromPlayer?.team}`} style={{fontSize:"0.6rem"}}></span>
                          <span style={{fontWeight:600,fontSize:"var(--text-base)"}}>{fromPlayer?.name}</span>
                        </div>
                        <div style={{flex:1,display:"flex",alignItems:"center",gap:"0.5rem"}}>
                          <div style={{flex:1,height:2,background:"var(--red)",borderRadius:1}}/>
                          <span style={{fontFamily:"var(--font-mono)",fontWeight:700,fontSize:"var(--text-sm)",color:"var(--red)",whiteSpace:"nowrap"}}>
                            pays ${Math.round(t.amount)}
                          </span>
                          <div style={{flex:1,height:2,background:"var(--green-mid)",borderRadius:1}}/>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",minWidth:100,justifyContent:"flex-end"}}>
                          <span style={{fontWeight:600,fontSize:"var(--text-base)"}}>{toPlayer?.name}</span>
                          <span className={`tag tag-team${toPlayer?.team}`} style={{fontSize:"0.6rem"}}></span>
                        </div>
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
