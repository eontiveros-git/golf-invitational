import { useState } from "react";
import { useAppData } from "../lib/useAppData";
import { COURSES, COURSE_KEYS } from "../lib/gameData";
import { skinPayouts, dailyLowNet, calcSettlement, calcBestBall, calcSingles } from "../lib/scoring";
import { upsertPayment } from "../lib/supabase";

function getDayPayouts(ck, roundsByCourse, ctpWinners, ghinOverrides, courses) {
  const cr = roundsByCourse[ck] || [];
  if (!cr.length) return {};
  const { netTotals: skinNet } = skinPayouts(ck, cr, ghinOverrides, courses);
  const { netPayouts: lnNet  } = dailyLowNet(ck, cr, ghinOverrides, courses);
  const ctpNet = {};
  cr.forEach(r => (ctpNet[r.playerId] = 0));
  ctpWinners.filter(c => c.course_key === ck).forEach(c => {
    if (!c.player_id) return;
    cr.forEach(r => { ctpNet[r.playerId] = (ctpNet[r.playerId]||0) - 5; });
    ctpNet[c.player_id] = (ctpNet[c.player_id]||0) + 5 * cr.length;
  });
  const result = {};
  cr.forEach(r => {
    const skins  = Math.round(skinNet[r.playerId] || 0);
    const lowNet = Math.round(lnNet[r.playerId]   || 0);
    const ctp    = Math.round(ctpNet[r.playerId]  || 0);
    result[r.playerId] = { skins, lowNet, ctp, total: skins + lowNet + ctp };
  });
  return result;
}

function dailyTransactions(dp) {
  const bal = Object.entries(dp).map(([id,d]) => ({ id, amt: Math.round(d.total*100)/100 }));
  const debtors   = [...bal.filter(b=>b.amt<-0.01)].sort((a,b)=>a.amt-b.amt);
  const creditors = [...bal.filter(b=>b.amt> 0.01)].sort((a,b)=>b.amt-a.amt);
  const txns = [];
  while (debtors.length && creditors.length) {
    const debtor=debtors[0], creditor=creditors[0];
    const amount=Math.min(Math.abs(debtor.amt),creditor.amt);
    const rounded=Math.round(amount*100)/100;
    if(rounded>0.01) txns.push({from:debtor.id,to:creditor.id,amount:rounded});
    debtor.amt+=amount; creditor.amt-=amount;
    if(Math.abs(debtor.amt)<0.01) debtors.shift();
    if(Math.abs(creditor.amt)<0.01) creditors.shift();
  }
  return txns;
}

function CollectOwes({ amount }) {
  const r = Math.round(amount);
  if (r>0) return <span style={{fontFamily:"var(--font-mono)",fontWeight:700,color:"var(--pine-mid)"}}>collect ${r}</span>;
  if (r<0) return <span style={{fontFamily:"var(--font-mono)",fontWeight:700,color:"var(--red)"}}>owes ${Math.abs(r)}</span>;
  return <span style={{fontFamily:"var(--font-mono)",color:"var(--gray-400)"}}>even</span>;
}

function DayCard({ ck, dayPayouts, players, dailyPayments, onTogglePaid, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const dp = dayPayouts[ck] || {};
  const txns = dailyTransactions(dp);
  if (!txns.length && !Object.keys(dp).length) return null;

  const collectors = Object.entries(dp).filter(([,d])=>d.total>0).sort(([,a],[,b])=>b.total-a.total);
  const owes       = Object.entries(dp).filter(([,d])=>d.total<0).sort(([,a],[,b])=>a.total-b.total);
  const totalOut   = collectors.reduce((s,[,d])=>s+d.total,0);
  const pName = id => players.find(p=>p.id===id)?.name ?? id;

  // Check paid status for each transaction
  const isPaid = (fromId, toId) => dailyPayments.some(p => p.course_key===ck && p.from_player===fromId && p.to_player===toId && p.paid);
  const paidCount = txns.filter(t=>isPaid(t.from,t.to)).length;
  const allPaid = txns.length > 0 && paidCount === txns.length;

  return (
    <div className="card mb-2">
      <div className="card-header" style={{cursor:"pointer",userSelect:"none"}} onClick={()=>setOpen(o=>!o)}>
        <div style={{display:"flex",alignItems:"center",gap:"0.6rem"}}>
          {allPaid && <span style={{fontSize:"1rem"}}>✅</span>}
          <h2>{COURSES[ck].name} — {COURSES[ck].day}</h2>
          {txns.length>0 && !allPaid && paidCount>0 && (
            <span style={{fontSize:"var(--text-xs)",color:"var(--copper-light)",fontWeight:600}}>{paidCount}/{txns.length} paid</span>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
          {totalOut>0&&<span className="badge">${Math.round(totalOut)} out</span>}
          <span style={{color:"var(--aspen)",fontSize:"var(--text-sm)"}}>{open?"▾":"▸"}</span>
        </div>
      </div>

      {open && (
        <div className="card-body" style={{padding:"0.75rem 1rem"}}>
          {/* Collect / Owes summary */}
          {(collectors.length>0||owes.length>0) && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem",marginBottom:"0.75rem"}}>
              <div>
                {collectors.map(([pid,d])=>(
                  <div key={pid} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.35rem 0.5rem",borderRadius:4,background:"#f0f7f3",marginBottom:2}}>
                    <div>
                      <span style={{fontWeight:700,fontSize:"var(--text-sm)"}}>{pName(pid)}</span>
                      <span style={{fontSize:"var(--text-xs)",color:"var(--gray-400)",marginLeft:"0.4rem"}}>
                        {[d.skins!==0&&`S${d.skins>0?"+":""}${d.skins}`,d.lowNet!==0&&`LN${d.lowNet>0?"+":""}${d.lowNet}`,d.ctp!==0&&`CTP${d.ctp>0?"+":""}${d.ctp}`].filter(Boolean).join(" ")}
                      </span>
                    </div>
                    <CollectOwes amount={d.total} />
                  </div>
                ))}
              </div>
              <div>
                {owes.map(([pid,d])=>(
                  <div key={pid} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.35rem 0.5rem",borderRadius:4,background:"#fdf0f0",marginBottom:2}}>
                    <span style={{fontWeight:600,fontSize:"var(--text-sm)",color:"var(--gray-600)"}}>{pName(pid)}</span>
                    <CollectOwes amount={d.total} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Who pays who — with paid toggle */}
          {txns.length > 0 && (
            <>
              <div style={{fontSize:"var(--text-xs)",fontWeight:700,color:"var(--gray-400)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.4rem"}}>
                Collect tonight — tap to mark paid
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"0.3rem"}}>
                {txns.map((t,i) => {
                  const paid = isPaid(t.from, t.to);
                  const from = players.find(p=>p.id===t.from);
                  const to   = players.find(p=>p.id===t.to);
                  return (
                    <div key={i}
                      onClick={()=>onTogglePaid(ck,t.from,t.to,Math.round(t.amount),!paid)}
                      style={{
                        display:"flex",alignItems:"center",gap:"0.5rem",
                        padding:"0.5rem 0.75rem",borderRadius:5,cursor:"pointer",
                        border:`1px solid ${paid?"var(--pine-light)":"var(--gray-200)"}`,
                        background: paid?"#f0f7f3":"var(--white)",
                        opacity: paid?0.75:1,
                        transition:"all 0.15s",
                      }}>
                      <span style={{fontSize:"1rem",minWidth:"1.2rem"}}>{paid?"✅":"◯"}</span>
                      <span className={`tag tag-team${from?.team}`} style={{fontSize:"0.6rem"}}></span>
                      <span style={{fontWeight:700,fontSize:"var(--text-sm)",textDecoration:paid?"line-through":"none",color:paid?"var(--gray-400)":"var(--gray-800)"}}>{from?.name}</span>
                      <span style={{color:"var(--gray-400)",fontSize:"var(--text-xs)"}}>pays</span>
                      <span style={{fontFamily:"var(--font-mono)",fontWeight:700,fontSize:"var(--text-lg)",color:paid?"var(--gray-400)":"var(--gray-800)"}}>${Math.round(t.amount)}</span>
                      <span style={{color:"var(--gray-400)",fontSize:"var(--text-xs)"}}>to</span>
                      <span style={{fontWeight:700,fontSize:"var(--text-sm)",textDecoration:paid?"line-through":"none",color:paid?"var(--gray-400)":"var(--gray-800)"}}>{to?.name}</span>
                      <span className={`tag tag-team${to?.team}`} style={{fontSize:"0.6rem"}}></span>
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

export default function Settlement() {
  const { rounds, matchups, ctpWinners, dailyPayments, loading, ghinOverrides, roundsByCourse, grossByCoursePlayer, players, teams, courses } = useAppData();
  const [payments, setPayments] = useState(null); // local optimistic state

  if (loading) return <div className="spinner"/>;

  const roundsPlayed = COURSE_KEYS.filter(ck=>(roundsByCourse[ck]?.length||0)>0);
  if (!roundsPlayed.length) return (
    <div className="card"><div className="card-body"><p className="text-muted">No scores entered yet.</p></div></div>
  );

  // Use local state if available (optimistic updates), else from DB
  const effectivePayments = payments ?? dailyPayments;

  async function handleTogglePaid(ck, fromId, toId, amount, paid) {
    // Optimistic update
    const key = `${ck}|${fromId}|${toId}`;
    setPayments(prev => {
      const base = prev ?? dailyPayments;
      const existing = base.find(p=>p.course_key===ck&&p.from_player===fromId&&p.to_player===toId);
      if (existing) return base.map(p=>p.course_key===ck&&p.from_player===fromId&&p.to_player===toId?{...p,paid}:p);
      return [...base, {course_key:ck,from_player:fromId,to_player:toId,amount,paid}];
    });
    await upsertPayment(ck, fromId, toId, amount, paid);
  }

  const dayPayouts = {};
  COURSE_KEYS.forEach(ck => { dayPayouts[ck] = getDayPayouts(ck, roundsByCourse, ctpWinners, ghinOverrides, courses); });

  const runningTotal = {};
  players.forEach(p=>(runningTotal[p.id]=0));
  COURSE_KEYS.forEach(ck=>{ Object.entries(dayPayouts[ck]).forEach(([pid,d])=>{ runningTotal[pid]=(runningTotal[pid]||0)+d.total; }); });

  // RC + MVP
  let rc1=0,rc2=0;
  const mvpPts={};
  players.forEach(p=>(mvpPts[p.id]=0));
  matchups.forEach(m=>{
    const gMap=grossByCoursePlayer[m.course_key]||{};
    const isSingles=m.course_key==="frostCreek";
    const t1=m.team1_players||[],t2=m.team2_players||[];
    if(isSingles&&t1[0]&&t2[0]&&gMap[t1[0]]&&gMap[t2[0]]){
      const r=calcSingles(m.course_key,t1[0],t2[0],gMap,ghinOverrides,courses);
      rc1+=(r.rcPoints[t1[0]]||0);rc2+=(r.rcPoints[t2[0]]||0);
      [t1[0],t2[0]].forEach(id=>{mvpPts[id]+=(r.rcPoints[id]||0);});
    } else if(!isSingles&&t1.length===2&&t2.length===2&&(t1.some(id=>gMap[id])||t2.some(id=>gMap[id]))){
      const r=calcBestBall(m.course_key,t1,t2,gMap,ghinOverrides,courses);
      rc1+=r.rcPoints.team1;rc2+=r.rcPoints.team2;
      t1.forEach(id=>{mvpPts[id]+=r.rcPoints.team1/2;});
      t2.forEach(id=>{mvpPts[id]+=r.rcPoints.team2/2;});
    }
  });
  const rcWinner=rc1>rc2?1:rc2>rc1?2:null;
  const rcWinners=rcWinner?players.filter(p=>p.team===rcWinner):[];
  const rcNetPer=rcWinners.length?Math.round(600/rcWinners.length)-50:0;
  const maxMvp=Math.max(0,...Object.values(mvpPts));
  const mvpWinners=maxMvp>0?players.filter(p=>mvpPts[p.id]===maxMvp):[];
  const mvpNetPer=mvpWinners.length?Math.round(120/mvpWinners.length)-10:0;
  const allRoundsIn=roundsPlayed.length===4;

  const {transactions}=calcSettlement(rounds,matchups,ctpWinners,ghinOverrides,roundsByCourse,grossByCoursePlayer,players,courses);

  const pName = id => players.find(p=>p.id===id)?.name??id;

  // Check how many nightly payments are outstanding
  const nightlyTxnCount = COURSE_KEYS.reduce((sum,ck)=>sum+dailyTransactions(dayPayouts[ck]).length,0);
  const nightlyPaidCount = COURSE_KEYS.reduce((sum,ck)=>{
    return sum+dailyTransactions(dayPayouts[ck]).filter(t=>effectivePayments.some(p=>p.course_key===ck&&p.from_player===t.from&&p.to_player===t.to&&p.paid)).length;
  },0);

  return (
    <div>
      {/* ── 1. DAILY PAYOUTS ── */}
      <div style={{display:"flex",alignItems:"baseline",gap:"0.6rem",marginBottom:"0.6rem"}}>
        <h2 style={{fontFamily:"var(--font-body)",fontWeight:700,fontSize:"var(--text-lg)"}}>Daily Payouts</h2>
        {nightlyTxnCount>0&&(
          <span style={{fontSize:"var(--text-xs)",color:nightlyPaidCount===nightlyTxnCount?"var(--pine-mid)":"var(--gray-400)",fontWeight:600}}>
            {nightlyPaidCount===nightlyTxnCount?"All paid ✅":`${nightlyPaidCount}/${nightlyTxnCount} transactions settled`}
          </span>
        )}
      </div>

      {COURSE_KEYS.map((ck,i)=>(
        <DayCard key={ck} ck={ck} dayPayouts={dayPayouts} players={players}
          dailyPayments={effectivePayments} onTogglePaid={handleTogglePaid}
          defaultOpen={i===roundsPlayed.length-1} />
      ))}

      {/* ── 2. RUNNING TOTAL ── */}
      {roundsPlayed.length>0&&(
        <div className="card mb-3">
          <div className="card-header">
            <h2>Running Total</h2>
            <span className="badge">Nightly pots · {roundsPlayed.length}/4 rounds</span>
          </div>
          <div className="card-body" style={{padding:0,overflowX:"auto"}}>
            <table className="leaderboard">
              <thead>
                <tr>
                  <th>Player</th>
                  {roundsPlayed.map(ck=><th key={ck} style={{textAlign:"center"}}>{COURSES[ck].day.slice(0,3)}</th>)}
                  <th style={{textAlign:"right"}}>Total</th>
                </tr>
              </thead>
              <tbody>
                {[...players].sort((a,b)=>runningTotal[b.id]-runningTotal[a.id]).map(p=>{
                  const total=Math.round(runningTotal[p.id]||0);
                  return(
                    <tr key={p.id}>
                      <td style={{fontWeight:600}}>{p.name}</td>
                      {roundsPlayed.map(ck=>{
                        const v=Math.round(dayPayouts[ck][p.id]?.total||0);
                        return <td key={ck} className="text-mono" style={{textAlign:"center",color:v>0?"var(--pine-mid)":v<0?"var(--red)":"var(--gray-300)"}}>
                          {v>0?`+$${v}`:v<0?`-$${Math.abs(v)}`:"—"}
                        </td>;
                      })}
                      <td style={{textAlign:"right",fontWeight:700,fontFamily:"var(--font-mono)",
                        color:total>0?"var(--pine-mid)":total<0?"var(--red)":"var(--gray-400)"}}>
                        {total>0?`+$${total}`:total<0?`-$${Math.abs(total)}`:"Even"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 3. END OF TRIP ── */}
      <div className="card mb-3">
        <div className="card-header">
          <h2>End of Trip</h2>
          <span className="badge">{allRoundsIn?"All rounds in":"Projected"} · pay Sunday</span>
        </div>
        <div className="card-body">
          {!allRoundsIn&&<p style={{fontSize:"var(--text-xs)",color:"var(--gray-400)",marginBottom:"1rem",fontStyle:"italic"}}>Projected based on rounds entered so far.</p>}
          <div className="grid-2 mb-2">
            <div style={{border:`2px solid ${rcWinner?"var(--pine-mid)":"var(--gray-200)"}`,borderRadius:6,padding:"0.75rem"}}>
              <div className="form-label" style={{marginBottom:"0.5rem"}}>Ryder Cup · $50/player</div>
              {rcWinner?(
                <>
                  <div style={{fontWeight:700,color:"var(--pine-mid)",marginBottom:"0.5rem"}}>
                    🏆 {teams[rcWinner].name}
                    <span style={{fontWeight:400,fontSize:"var(--text-xs)",color:"var(--gray-400)",marginLeft:"0.5rem"}}>{rc1%1===0?rc1:rc1.toFixed(1)} – {rc2%1===0?rc2:rc2.toFixed(1)}</span>
                  </div>
                  {rcWinners.map(p=>(
                    <div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:"var(--text-sm)",marginBottom:2}}>
                      <span>{p.name}</span>
                      <span style={{fontFamily:"var(--font-mono)",fontWeight:700,color:"var(--pine-mid)"}}>+${rcNetPer} net</span>
                    </div>
                  ))}
                  <div style={{borderTop:"1px solid var(--gray-200)",marginTop:"0.4rem",paddingTop:"0.4rem",fontSize:"var(--text-xs)",color:"var(--gray-400)"}}>
                    {players.filter(p=>p.team!==rcWinner).map(p=>p.name).join(", ")} each owe $50
                  </div>
                </>
              ):(
                <div style={{fontSize:"var(--text-sm)",color:"var(--gray-400)"}}>
                  {rc1===rc2?"Tied":`${teams[rc1>rc2?1:2].name} leads ${Math.max(rc1,rc2).toFixed(1)}–${Math.min(rc1,rc2).toFixed(1)}`}
                </div>
              )}
            </div>
            <div style={{border:`2px solid ${mvpWinners.length?"var(--copper)":"var(--gray-200)"}`,borderRadius:6,padding:"0.75rem",background:mvpWinners.length?"var(--copper-pale)":""}}>
              <div className="form-label" style={{marginBottom:"0.5rem"}}>Ryder Cup MVP · $10/player</div>
              {mvpWinners.length>0?(
                mvpWinners.map(p=>(
                  <div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:"var(--text-sm)",marginBottom:2}}>
                    <span style={{fontWeight:700}}>🏅 {p.name} <span style={{fontWeight:400,color:"var(--gray-400)"}}>({mvpPts[p.id].toFixed(1)} pts)</span></span>
                    <span style={{fontFamily:"var(--font-mono)",fontWeight:700,color:"var(--copper)"}}>+${mvpNetPer} net</span>
                  </div>
                ))
              ):<div style={{fontSize:"var(--text-sm)",color:"var(--gray-400)"}}>TBD</div>}
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. FINAL SETTLEMENT ── */}
      {transactions.length>0&&(
        <div className="card">
          <div className="card-header">
            <h2>Final Settlement</h2>
            <span className="badge">{transactions.length} transactions</span>
          </div>
          <div className="card-body">
            <p style={{fontSize:"var(--text-sm)",color:"var(--gray-400)",marginBottom:"1rem"}}>All pots combined — nightly, Ryder Cup, and MVP.</p>
            <div style={{display:"flex",flexDirection:"column",gap:"0.4rem"}}>
              {transactions.map((t,i)=>{
                const from=players.find(p=>p.id===t.from), to=players.find(p=>p.id===t.to);
                return(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"0.6rem 0.9rem",borderRadius:5,border:"1px solid var(--gray-200)",background:"var(--white)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"0.4rem",flex:1}}>
                      <span className={`tag tag-team${from?.team}`} style={{fontSize:"0.6rem"}}></span>
                      <span style={{fontWeight:700,fontSize:"var(--text-sm)"}}>{from?.name}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
                      <span style={{fontSize:"var(--text-xs)",color:"var(--gray-400)"}}>pays</span>
                      <span style={{fontFamily:"var(--font-mono)",fontWeight:700,fontSize:"var(--text-lg)"}}>${Math.round(t.amount)}</span>
                      <span style={{fontSize:"var(--text-xs)",color:"var(--gray-400)"}}>to</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:"0.4rem",flex:1,justifyContent:"flex-end"}}>
                      <span style={{fontWeight:700,fontSize:"var(--text-sm)"}}>{to?.name}</span>
                      <span className={`tag tag-team${to?.team}`} style={{fontSize:"0.6rem"}}></span>
                    </div>
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
