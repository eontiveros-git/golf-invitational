import { useState } from "react";
import { useAppData } from "../lib/useAppData";
import { COURSES, COURSE_KEYS } from "../lib/gameData";
import { skinPayouts, splitPot, getDayPayouts, computeRyderCup } from "../lib/scoring";
import { upsertPayment } from "../lib/supabase";

const PLAYER_COUNT = 12;
const BUY_IN = 265;
const TOTAL_POT = PLAYER_COUNT * BUY_IN; // $3,180

// ── Single day card ───────────────────────────────────────────────────────
function DayCard({ ck, dayPayouts, players, dailyPayments, onTogglePaid, defaultOpen, skinCount, perSkin, skinRemainder }) {
  const [open, setOpen] = useState(defaultOpen);
  const dp = dayPayouts[ck] || {};
  if (!Object.keys(dp).length) return null;

  const pName = id => players.find(p => p.id === id)?.name ?? id;

  // Only show players who collect money tonight (positive total)
  const collectors = Object.entries(dp)
    .filter(([, d]) => d.total > 0)
    .sort(([, a], [, b]) => b.total - a.total);

  const totalOut = collectors.reduce((s, [, d]) => s + d.total, 0);

  // Paid tracking — keyed by playerId (organizer pays player)
  const isPaid = (toId) => dailyPayments.some(p =>
    p.course_key === ck && p.to_player === toId && p.paid
  );
  const paidCount = collectors.filter(([pid]) => isPaid(pid)).length;
  const allPaid = collectors.length > 0 && paidCount === collectors.length;

  return (
    <div className="card mb-2">
      <div className="card-header" style={{cursor:"pointer",userSelect:"none"}} onClick={() => setOpen(o => !o)}>
        <div style={{display:"flex",alignItems:"center",gap:"0.6rem"}}>
          {allPaid && <span>✅</span>}
          <h2>{COURSES[ck].name} — {COURSES[ck].day}</h2>
          {!allPaid && paidCount > 0 && (
            <span style={{fontSize:"var(--text-xs)",color:"var(--copper-light)",fontWeight:600}}>{paidCount}/{collectors.length} paid</span>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
          {skinCount > 0 && (
            <span className="badge">
              {skinCount} skins · ${perSkin}{skinRemainder > 0 ? `–${perSkin + 1}` : ""}/skin
            </span>
          )}
          {totalOut > 0 && <span className="badge" style={{background:"var(--pine-mid)"}}>${Math.round(totalOut)} out</span>}
          <span style={{color:"var(--aspen)",fontSize:"var(--text-sm)"}}>{open ? "▾" : "▸"}</span>
        </div>
      </div>

      {open && (
        <div className="card-body" style={{padding:"0.75rem 1rem"}}>
          {collectors.length === 0 ? (
            <p className="text-muted">No winners yet — enter scores and CTP to see payouts.</p>
          ) : (
            <>
              <div style={{fontSize:"var(--text-xs)",fontWeight:700,color:"var(--gray-400)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.5rem"}}>
                Organizer pays tonight — tap to mark paid
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"0.35rem"}}>
                {collectors.map(([pid, d]) => {
                  const paid = isPaid(pid);
                  return (
                    <div key={pid}
                      onClick={() => onTogglePaid(ck, pid, Math.round(d.total), !paid)}
                      style={{
                        display:"flex", alignItems:"center", gap:"0.75rem",
                        padding:"0.6rem 0.9rem", borderRadius:5, cursor:"pointer",
                        border:`1px solid ${paid ? "var(--pine-light)" : "var(--gray-200)"}`,
                        background: paid ? "#f0f7f3" : "var(--white)",
                        opacity: paid ? 0.75 : 1,
                        transition:"all 0.15s",
                      }}>
                      <span style={{fontSize:"1rem",minWidth:"1.2rem"}}>{paid ? "✅" : "◯"}</span>
                      <div style={{flex:1}}>
                        <span style={{
                          fontWeight:700, fontSize:"var(--text-base)",
                          textDecoration: paid ? "line-through" : "none",
                          color: paid ? "var(--gray-400)" : "var(--gray-800)",
                        }}>{pName(pid)}</span>
                        <span style={{fontSize:"var(--text-xs)",color:"var(--gray-400)",marginLeft:"0.5rem"}}>
                          {[
                            d.skins  !== 0 && `skins ${d.skins > 0 ? "+" : ""}${d.skins}`,
                            d.lowNet !== 0 && `LN ${d.lowNet > 0 ? "+" : ""}${d.lowNet}`,
                            d.ctp    !== 0 && `CTP ${d.ctp > 0 ? "+" : ""}${d.ctp}`,
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      <span style={{
                        fontFamily:"var(--font-mono)", fontWeight:700,
                        fontSize:"var(--text-lg)",
                        color: paid ? "var(--gray-400)" : "var(--pine-mid)",
                        textDecoration: paid ? "line-through" : "none",
                      }}>${Math.round(d.total)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function Settlement() {
  const {
    rounds, matchups, ctpWinners, dailyPayments, loading,
    ghinOverrides, roundsByCourse, grossByCoursePlayer,
    players, teams, courses,
  } = useAppData();
  const [payments, setPayments] = useState(null);

  if (loading) return <div className="spinner"/>;

  const roundsPlayed = COURSE_KEYS.filter(ck => (roundsByCourse[ck]?.length || 0) > 0);
  if (!roundsPlayed.length) return (
    <div className="card"><div className="card-body"><p className="text-muted">No scores entered yet.</p></div></div>
  );

  const effectivePayments = payments ?? dailyPayments;
  const pName = id => players.find(p => p.id === id)?.name ?? id;

  async function handleTogglePaid(ck, toId, amount, paid) {
    setPayments(prev => {
      const base = prev ?? dailyPayments;
      const exists = base.find(p => p.course_key === ck && p.to_player === toId);
      if (exists) return base.map(p => p.course_key === ck && p.to_player === toId ? {...p, paid} : p);
      return [...base, {course_key: ck, from_player: "organizer", to_player: toId, amount, paid}];
    });
    await upsertPayment(ck, "organizer", toId, amount, paid);
  }

  // Per-day payouts
  const dayPayouts = {};
  COURSE_KEYS.forEach(ck => {
    dayPayouts[ck] = getDayPayouts(ck, roundsByCourse, ctpWinners, ghinOverrides, courses);
  });

  // Running nightly total per player (net of buy-in)
  const runningTotal = {};
  players.forEach(p => (runningTotal[p.id] = 0));
  COURSE_KEYS.forEach(ck => {
    Object.entries(dayPayouts[ck]).forEach(([pid, d]) => {
      runningTotal[pid] = (runningTotal[pid] || 0) + d.total;
    });
  });

  // Total paid out so far by organizer (nightly)
  const nightlyPaidOut = COURSE_KEYS.reduce((sum, ck) => {
    const dp = dayPayouts[ck];
    return sum + Object.entries(dp)
      .filter(([pid, d]) => d.total > 0 && effectivePayments.some(p => p.course_key === ck && p.to_player === pid && p.paid))
      .reduce((s, [, d]) => s + d.total, 0);
  }, 0);
  const nightlyTotalOut = COURSE_KEYS.reduce((sum, ck) =>
    sum + Object.values(dayPayouts[ck]).filter(d => d.total > 0).reduce((s, d) => s + d.total, 0), 0
  );

  // RC + MVP — shared helper, same numbers as the Dashboard
  const rc = computeRyderCup(matchups, grossByCoursePlayer, players, ghinOverrides, courses);
  const rc1 = rc.team1, rc2 = rc.team2;
  const mvpPts = rc.mvpPoints;
  const rcWinner  = rc.winner;
  const rcWinners = rcWinner ? players.filter(p => p.team === rcWinner) : [];
  const { payouts: rcPay } = splitPot(600, rcWinners.map(p => p.id));
  const maxMvp = rc.maxMvp;
  const mvpWinners = rc.mvpWinners.map(id => players.find(p => p.id === id)).filter(Boolean);
  const { payouts: mvpPay } = splitPot(120, mvpWinners.map(p => p.id));
  const allRoundsIn = roundsPlayed.length === 4;

  // End of trip payout totals (what organizer pays out Sunday)
  const rcTotalOut  = rcWinners.reduce((s, p) => s + (rcPay[p.id] || 0), 0);
  const mvpTotalOut = mvpWinners.reduce((s, p) => s + (mvpPay[p.id] || 0), 0);
  // Organizer's running balance
  const totalCollected = PLAYER_COUNT * BUY_IN;
  const totalPaidOut = nightlyTotalOut + (allRoundsIn ? rcTotalOut + mvpTotalOut : 0);
  const organizerBalance = totalCollected - totalPaidOut;

  // Skin data per course for badge
  const skinData = {};
  COURSE_KEYS.forEach(ck => {
    const cr = roundsByCourse[ck] || [];
    if (cr.length) {
      const sd = skinPayouts(ck, cr, ghinOverrides, courses);
      skinData[ck] = {
        count: sd.skins.filter(s => s.winnerId).length,
        perSkin: sd.perSkin,
        remainder: sd.remainder || 0,
      };
    } else {
      skinData[ck] = { count: 0, perSkin: 0, remainder: 0 };
    }
  });

  return (
    <div>
      {/* ── ORGANIZER SUMMARY ── */}
      <div className="card mb-3" style={{background:"var(--pine-deep)",border:"2px solid var(--copper)"}}>
        <div className="card-body" style={{padding:"1rem 1.25rem"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"1rem",textAlign:"center"}}>
            <div>
              <div style={{fontSize:"var(--text-xs)",color:"var(--pine-light)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.2rem"}}>Collected</div>
              <div style={{fontFamily:"var(--font-mono)",fontWeight:700,fontSize:"var(--text-2xl)",color:"var(--aspen)"}}>${totalCollected.toLocaleString()}</div>
              <div style={{fontSize:"var(--text-xs)",color:"var(--gray-400)"}}>{PLAYER_COUNT} players × ${BUY_IN}</div>
            </div>
            <div>
              <div style={{fontSize:"var(--text-xs)",color:"var(--pine-light)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.2rem"}}>Paid Out</div>
              <div style={{fontFamily:"var(--font-mono)",fontWeight:700,fontSize:"var(--text-2xl)",color:"var(--copper-light)"}}>${Math.round(nightlyPaidOut).toLocaleString()}</div>
              <div style={{fontSize:"var(--text-xs)",color:"var(--gray-400)"}}>of ${Math.round(nightlyTotalOut)} owed nightly</div>
            </div>
            <div>
              <div style={{fontSize:"var(--text-xs)",color:"var(--pine-light)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.2rem"}}>Still Holding</div>
              <div style={{fontFamily:"var(--font-mono)",fontWeight:700,fontSize:"var(--text-2xl)",color:"var(--gold)"}}>${Math.round(organizerBalance).toLocaleString()}</div>
              <div style={{fontSize:"var(--text-xs)",color:"var(--gray-400)"}}>incl. RC + MVP</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── DAILY PAYOUTS ── */}
      <div style={{display:"flex",alignItems:"baseline",gap:"0.6rem",marginBottom:"0.6rem"}}>
        <h2 style={{fontFamily:"var(--font-body)",fontWeight:700,fontSize:"var(--text-lg)"}}>Nightly Payouts</h2>
        <span style={{fontSize:"var(--text-xs)",color:"var(--gray-400)"}}>Organizer pays winners each evening</span>
      </div>

      {COURSE_KEYS.map((ck, i) => (
        <DayCard key={ck} ck={ck}
          dayPayouts={dayPayouts} players={players}
          dailyPayments={effectivePayments} onTogglePaid={handleTogglePaid}
          defaultOpen={i === roundsPlayed.length - 1}
          skinCount={skinData[ck].count} perSkin={skinData[ck].perSkin}
          skinRemainder={skinData[ck].remainder} />
      ))}

      {/* ── RUNNING TOTAL ── */}
      {roundsPlayed.length > 0 && (
        <div className="card mb-3">
          <div className="card-header">
            <h2>Running Total</h2>
            <span className="badge">Collected back · {roundsPlayed.length}/4 rounds</span>
          </div>
          <div className="card-body" style={{padding:0,overflowX:"auto"}}>
            <table className="leaderboard">
              <thead>
                <tr>
                  <th>Player</th>
                  {roundsPlayed.map(ck => <th key={ck} style={{textAlign:"center"}}>{COURSES[ck].day.slice(0,3)}</th>)}
                  <th style={{textAlign:"right"}}>Collected</th>
                  <th style={{textAlign:"right"}}>vs ${BUY_IN}</th>
                </tr>
              </thead>
              <tbody>
                {[...players].sort((a, b) => runningTotal[b.id] - runningTotal[a.id]).map(p => {
                  const collected = Math.round(runningTotal[p.id] || 0);
                  const vsBuyIn = collected - BUY_IN;
                  return (
                    <tr key={p.id}>
                      <td style={{fontWeight:600}}>{p.name}</td>
                      {roundsPlayed.map(ck => {
                        const v = Math.round(dayPayouts[ck][p.id]?.total || 0);
                        return (
                          <td key={ck} className="text-mono" style={{textAlign:"center",
                            color:v>0?"var(--pine-mid)":"var(--gray-300)"}}>
                            {v > 0 ? `$${v}` : "—"}
                          </td>
                        );
                      })}
                      <td style={{textAlign:"right",fontWeight:700,fontFamily:"var(--font-mono)",
                        color:collected>0?"var(--pine-mid)":"var(--gray-400)"}}>
                        {collected > 0 ? `$${collected}` : "—"}
                      </td>
                      <td style={{textAlign:"right",fontWeight:700,fontFamily:"var(--font-mono)",
                        color:vsBuyIn>0?"var(--pine-mid)":vsBuyIn<0?"var(--red)":"var(--gray-400)"}}>
                        {vsBuyIn > 0 ? `+$${vsBuyIn}` : vsBuyIn < 0 ? `-$${Math.abs(vsBuyIn)}` : "Even"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{padding:"0.5rem 1rem",background:"var(--gray-100)",fontSize:"var(--text-xs)",color:"var(--gray-600)",borderTop:"1px solid var(--gray-200)"}}>
            "vs ${BUY_IN}" excludes Ryder Cup and MVP, which pay out Sunday.
          </div>
        </div>
      )}

      {/* ── END OF TRIP ── */}
      <div className="card mb-3">
        <div className="card-header">
          <h2>End of Trip</h2>
          <span className="badge">{allRoundsIn ? "All rounds in · pay Sunday" : `${roundsPlayed.length}/4 rounds · projected`}</span>
        </div>
        <div className="card-body">
          {!allRoundsIn && (
            <p style={{fontSize:"var(--text-xs)",color:"var(--gray-400)",marginBottom:"1rem",fontStyle:"italic"}}>
              Projected based on rounds entered so far. Final after Frost Creek.
            </p>
          )}
          <div className="grid-2">
            {/* Ryder Cup */}
            <div style={{border:`2px solid ${rcWinner ? "var(--pine-mid)" : "var(--gray-200)"}`,borderRadius:6,padding:"0.75rem"}}>
              <div className="form-label" style={{marginBottom:"0.5rem"}}>Ryder Cup · $50/player · $600 pot</div>
              {rcWinner ? (
                <>
                  <div style={{fontWeight:700,color:"var(--pine-mid)",marginBottom:"0.5rem"}}>
                    🏆 {teams[rcWinner].name}
                    <span style={{fontWeight:400,fontSize:"var(--text-xs)",color:"var(--gray-400)",marginLeft:"0.5rem"}}>
                      {rc1 % 1 === 0 ? rc1 : rc1.toFixed(1)} – {rc2 % 1 === 0 ? rc2 : rc2.toFixed(1)}
                    </span>
                  </div>
                  <div style={{fontSize:"var(--text-sm)",color:"var(--gray-600)",marginBottom:"0.4rem"}}>
                    Organizer pays each winner:
                  </div>
                  {rcWinners.map(p => (
                    <div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:"var(--text-sm)",marginBottom:2}}>
                      <span>{p.name}</span>
                      <span style={{fontFamily:"var(--font-mono)",fontWeight:700,color:"var(--pine-mid)"}}>${rcPay[p.id] || 0}</span>
                    </div>
                  ))}
                  <div style={{borderTop:"1px solid var(--gray-200)",marginTop:"0.4rem",paddingTop:"0.4rem",fontSize:"var(--text-xs)",color:"var(--gray-400)"}}>
                    ${rcTotalOut} total out · losing team collects nothing
                  </div>
                </>
              ) : (
                <div style={{fontSize:"var(--text-sm)",color:"var(--gray-400)"}}>
                  {rc1 === rc2 ? "Tied — no winner yet" : `${teams[rc1 > rc2 ? 1 : 2].name} leads ${Math.max(rc1,rc2).toFixed(1)}–${Math.min(rc1,rc2).toFixed(1)}`}
                </div>
              )}
            </div>

            {/* MVP */}
            <div style={{border:`2px solid ${mvpWinners.length ? "var(--copper)" : "var(--gray-200)"}`,borderRadius:6,padding:"0.75rem",background:mvpWinners.length?"var(--copper-pale)":""}}>
              <div className="form-label" style={{marginBottom:"0.5rem"}}>Ryder Cup MVP · $10/player · $120 pot</div>
              {mvpWinners.length > 0 ? (
                <>
                  <div style={{fontSize:"var(--text-sm)",color:"var(--gray-600)",marginBottom:"0.4rem"}}>
                    Organizer pays:
                  </div>
                  {mvpWinners.map(p => (
                    <div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:"var(--text-sm)",marginBottom:2}}>
                      <span style={{fontWeight:700}}>🏅 {p.name} <span style={{fontWeight:400,color:"var(--gray-400)"}}>({mvpPts[p.id].toFixed(1)} pts)</span></span>
                      <span style={{fontFamily:"var(--font-mono)",fontWeight:700,color:"var(--copper)"}}>${mvpPay[p.id] || 0}</span>
                    </div>
                  ))}
                  <div style={{borderTop:"1px solid var(--gray-200)",marginTop:"0.4rem",paddingTop:"0.4rem",fontSize:"var(--text-xs)",color:"var(--gray-400)"}}>
                    ${mvpTotalOut} total out
                  </div>
                </>
              ) : (
                <div style={{fontSize:"var(--text-sm)",color:"var(--gray-400)"}}>TBD — matches not complete</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
