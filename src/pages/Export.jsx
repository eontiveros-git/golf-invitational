import { useState, useEffect } from "react";
import { useAppData } from "../lib/useAppData";
import { COURSES, COURSE_KEYS, PLAYERS, TEAMS, TOURNAMENT, PRIZES, PAST_WINNERS, courseHandicap } from "../lib/gameData";
import { getRoundTotals, overallStandings, skinPayouts, dailyLowNet, calcBestBall, calcSingles } from "../lib/scoring";
import { getSettings } from "../lib/supabase";

function pName(id) { return PLAYERS.find(p=>p.id===id)?.name ?? id; }
function fmtPar(n) { if(n===0) return "E"; return n>0?`+${n}`:`${n}`; }
function fmtMoney(n) { return n>0?`$${Math.round(n)}`:"—"; }

function buildCSV(rounds, matchups, ctpWinners, ghinOverrides, roundsByCourse, grossByCoursePlayer, prizeWinners, pastWinners) {
  const rows = [];

  rows.push([`${TOURNAMENT.name} ${TOURNAMENT.year} — Full Results`]);
  rows.push([`${TOURNAMENT.edition} · ${TOURNAMENT.location} · ${TOURNAMENT.dates}`]);
  rows.push([]);

  rows.push(["=== INDIVIDUAL ROUND SCORES ==="]); rows.push([]);
  rows.push(["Player","Team","GHIN","Course","Day","Course Hdcp","Gross","Net","Gross +/-","Net +/-"]);
  COURSE_KEYS.forEach(ck => {
    const course = COURSES[ck];
    (roundsByCourse[ck]||[]).forEach(r => {
      const p = PLAYERS.find(x=>x.id===r.playerId);
      const ghin = ghinOverrides[p.id]??p.ghin;
      const ch = courseHandicap(ghin, course.slope);
      const t = getRoundTotals(ck, p.id, r.grossScores, ghinOverrides);
      rows.push([p.name, TEAMS[p.team].name, ghin, course.name, course.day, ch, t.gross, t.net, fmtPar(t.grossToPar), fmtPar(t.netToPar)]);
    });
  });

  rows.push([]); rows.push(["=== OVERALL STANDINGS ==="]); rows.push([]);
  rows.push(["Rank","Player","Team","Rounds","Total Gross","Total Net"]);
  overallStandings(rounds, ghinOverrides)
    .filter(s=>s.rounds>0).sort((a,b)=>a.totalNet-b.totalNet)
    .forEach((s,i) => {
      const p=PLAYERS.find(x=>x.id===s.playerId);
      rows.push([i+1, p.name, TEAMS[p.team].name, s.rounds, s.totalGross, s.totalNet]);
    });

  rows.push([]); rows.push(["=== PRIZE WINNERS ==="]); rows.push([]);
  rows.push(["Prize","Award","Winner"]);
  PRIZES.forEach(prize => {
    const w = prizeWinners?.[prize.id];
    rows.push([prize.label, prize.award, w ? (PLAYERS.find(p=>p.id===w)?.name || w) : "TBD"]);
  });

  rows.push([]); rows.push(["=== SKINS ==="]); rows.push([]);
  COURSE_KEYS.forEach(ck => {
    const cr = roundsByCourse[ck]||[];
    if (!cr.length) return;
    rows.push([`--- ${COURSES[ck].name} (${COURSES[ck].day}) ---`]);
    rows.push(["Hole","Winner","Net Score","Payout"]);
    const { skins, perSkin } = skinPayouts(ck, cr, ghinOverrides);
    skins.forEach(s => {
      rows.push([s.hole, s.winnerId?pName(s.winnerId):s.tied?.length?`Tied (${s.tied.map(pName).join(", ")})`:"—", s.netScore, s.winnerId?fmtMoney(perSkin):"—"]);
    });
    rows.push([]);
  });

  rows.push(["=== DAILY LOW NET ==="]); rows.push([]);
  COURSE_KEYS.forEach(ck => {
    const cr=roundsByCourse[ck]||[];
    if (!cr.length) return;
    rows.push([`--- ${COURSES[ck].name} ---`]);
    rows.push(["Place","Player","Net","Winnings"]);
    const {first,second}=dailyLowNet(ck,cr,ghinOverrides);
    first.forEach(r=>rows.push(["1st",pName(r.playerId),r.net,fmtMoney(80/first.length)]));
    second.forEach(r=>rows.push(["2nd",pName(r.playerId),r.net,fmtMoney(40/second.length)]));
    rows.push([]);
  });

  rows.push(["=== RYDER CUP MATCH PLAY ==="]); rows.push([]);
  rows.push(["Course","Day","Type","Team 1","Team 2","Holes T1","Holes T2","RC Pts T1","RC Pts T2"]);
  matchups.forEach(m => {
    const isSingles=m.course_key==="frostCreek";
    const gMap=grossByCoursePlayer[m.course_key]||{};
    const t1=m.team1_players||[], t2=m.team2_players||[];
    if (isSingles&&t1[0]&&t2[0]&&gMap[t1[0]]&&gMap[t2[0]]) {
      const r=calcSingles(m.course_key,t1[0],t2[0],gMap,ghinOverrides);
      rows.push([COURSES[m.course_key].name,COURSES[m.course_key].day,"Singles",pName(t1[0]),pName(t2[0]),r.holeWins[t1[0]],r.holeWins[t2[0]],r.rcPoints[t1[0]],r.rcPoints[t2[0]]]);
    } else if (!isSingles&&t1.length===2&&t2.length===2&&(t1.some(id=>gMap[id])||t2.some(id=>gMap[id]))) {
      const r=calcBestBall(m.course_key,t1,t2,gMap,ghinOverrides);
      rows.push([COURSES[m.course_key].name,COURSES[m.course_key].day,"Best Ball",t1.map(pName).join(" / "),t2.map(pName).join(" / "),r.holeWins.team1,r.holeWins.team2,r.rcPoints.team1,r.rcPoints.team2]);
    }
  });

  rows.push([]); rows.push(["=== CTP WINNERS ==="]); rows.push([]);
  rows.push(["Course","Day","Hole","Winner"]);
  ctpWinners.forEach(c=>{ rows.push([COURSES[c.course_key].name,COURSES[c.course_key].day,c.hole_index+1,pName(c.player_id)]); });

  rows.push([]); rows.push(["=== PAST CHAMPIONS ==="]); rows.push([]);
  rows.push(["Category","Year","Winner","Score"]);
  const pw = pastWinners || PAST_WINNERS;
  ["lowGross","lowNet","ryderCup"].forEach(key => {
    const labels={lowGross:"Low Gross",lowNet:"Low Net",ryderCup:"Ryder Cup"};
    pw[key]?.forEach(r=>rows.push([labels[key],r.year,r.winner||"TBD",r.score||"—"]));
  });

  return rows.map(r=>r.map(cell=>{
    const s=String(cell??"");
    return s.includes(",")||s.includes('"')?`"${s.replace(/"/g,'""')}"`:s;
  }).join(",")).join("\n");
}

function downloadCSV(content, filename) {
  const blob=new Blob([content],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

function PrintSummary({ rounds, matchups, ctpWinners, ghinOverrides, roundsByCourse, grossByCoursePlayer, prizeWinners, pastWinners }) {
  const standings = overallStandings(rounds, ghinOverrides).filter(s=>s.rounds>0).sort((a,b)=>a.totalNet-b.totalNet);
  const standingsGross = [...standings].sort((a,b)=>a.totalGross-b.totalGross);

  let rc1=0, rc2=0;
  const mvpPts={};
  PLAYERS.forEach(p=>(mvpPts[p.id]=0));
  matchups.forEach(m=>{
    const gMap=grossByCoursePlayer[m.course_key]||{};
    const isSingles=m.course_key==="frostCreek";
    const t1=m.team1_players||[], t2=m.team2_players||[];
    if (isSingles&&t1[0]&&t2[0]&&gMap[t1[0]]&&gMap[t2[0]]) {
      const r=calcSingles(m.course_key,t1[0],t2[0],gMap,ghinOverrides);
      rc1+=(r.rcPoints[t1[0]]||0); rc2+=(r.rcPoints[t2[0]]||0);
      [t1[0],t2[0]].forEach(id=>{mvpPts[id]+=(r.rcPoints[id]||0);});
    } else if (!isSingles&&t1.length===2&&t2.length===2&&(t1.some(id=>gMap[id])||t2.some(id=>gMap[id]))) {
      const r=calcBestBall(m.course_key,t1,t2,gMap,ghinOverrides);
      rc1+=r.rcPoints.team1; rc2+=r.rcPoints.team2;
      t1.forEach(id=>{mvpPts[id]+=r.rcPoints.team1/2;});
      t2.forEach(id=>{mvpPts[id]+=r.rcPoints.team2/2;});
    }
  });
  const maxMvp=Math.max(...Object.values(mvpPts));
  const mvpNames=maxMvp>0?PLAYERS.filter(p=>mvpPts[p.id]===maxMvp).map(p=>p.name).join(" / "):"—";
  const rcWinnerTeam=rc1>rc2?1:rc2>rc1?2:null;

  const money={};
  PLAYERS.forEach(p=>(money[p.id]=0));
  COURSE_KEYS.forEach(ck=>{
    const cr=roundsByCourse[ck]||[];
    if(!cr.length) return;
    const {totals:st}=skinPayouts(ck,cr,ghinOverrides);
    const {payouts:dp}=dailyLowNet(ck,cr,ghinOverrides);
    PLAYERS.forEach(p=>{money[p.id]+=(st[p.id]||0)+(dp[p.id]||0);});
  });

  const pw = pastWinners || PAST_WINNERS;

  const cell={padding:"0.35rem 0.6rem"};
  const hdr={background:"#1a3a2a",color:"#c9a84c",padding:"0.4rem 0.6rem",textAlign:"left",fontSize:"0.72rem",letterSpacing:"0.06em"};

  return (
    <div id="print-summary" style={{fontFamily:"Georgia, serif",color:"#1a3a2a",maxWidth:900,margin:"0 auto",padding:"2rem"}}>
      <div style={{textAlign:"center",borderBottom:"3px solid #c9a84c",paddingBottom:"1rem",marginBottom:"1.5rem"}}>
        <div style={{fontSize:"2.2rem",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>{TOURNAMENT.name} {TOURNAMENT.year}</div>
        <div style={{fontSize:"1rem",color:"#4a8c5c",marginTop:"0.25rem",letterSpacing:"0.12em",textTransform:"uppercase"}}>{TOURNAMENT.edition} · {TOURNAMENT.location} · {TOURNAMENT.dates}</div>
      </div>

      {/* Ryder Cup */}
      <div style={{background:"#1a3a2a",color:"#fff",borderRadius:8,padding:"1rem 1.5rem",marginBottom:"1.5rem",display:"flex",justifyContent:"space-around",alignItems:"center"}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:"0.75rem",letterSpacing:"0.12em",color:"#4a8c5c",textTransform:"uppercase"}}>{TEAMS[1].name}</div>
          <div style={{fontSize:"3rem",fontWeight:700,color:"#c9a84c",lineHeight:1}}>{rc1%1===0?rc1:rc1.toFixed(1)}</div>
          {rcWinnerTeam===1&&<div style={{fontSize:"0.75rem",color:"#c9a84c",marginTop:"0.25rem"}}>🏆 CHAMPIONS</div>}
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:"1rem",color:"#4a8c5c",fontWeight:700}}>RYDER CUP</div>
          <div style={{fontSize:"0.75rem",color:"#c9a84c",marginTop:"0.4rem"}}>MVP: {mvpNames}</div>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:"0.75rem",letterSpacing:"0.12em",color:"#4a8c5c",textTransform:"uppercase"}}>{TEAMS[2].name}</div>
          <div style={{fontSize:"3rem",fontWeight:700,color:"#c9a84c",lineHeight:1}}>{rc2%1===0?rc2:rc2.toFixed(1)}</div>
          {rcWinnerTeam===2&&<div style={{fontSize:"0.75rem",color:"#c9a84c",marginTop:"0.25rem"}}>🏆 CHAMPIONS</div>}
        </div>
      </div>

      {/* Prizes */}
      <div style={{marginBottom:"1.5rem"}}>
        <div style={{fontSize:"1rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",borderBottom:"2px solid #c9a84c",paddingBottom:"0.3rem",marginBottom:"0.5rem"}}>Prize Winners</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:"0.5rem"}}>
          {PRIZES.map(prize=>{
            const winnerId=prizeWinners?.[prize.id];
            const winnerName=winnerId?(PLAYERS.find(p=>p.id===winnerId)?.name||winnerId):"TBD";
            return (
              <div key={prize.id} style={{border:`1px solid ${winnerId?"#c9a84c":"#ddd"}`,borderRadius:5,padding:"0.6rem 0.75rem",background:winnerId?"#fffbf0":"#fff"}}>
                <div style={{fontSize:"0.68rem",fontWeight:700,color:"#4a8c5c",textTransform:"uppercase",letterSpacing:"0.06em"}}>{prize.label}</div>
                <div style={{fontSize:"0.72rem",color:"#c9a84c",margin:"0.1rem 0"}}>{prize.award}</div>
                <div style={{fontWeight:700,fontSize:"0.9rem"}}>{winnerId?"🏆 ":""}{winnerName}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall Standings */}
      <div style={{marginBottom:"1.5rem"}}>
        <div style={{fontSize:"1rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",borderBottom:"2px solid #c9a84c",paddingBottom:"0.3rem",marginBottom:"0.5rem"}}>Overall Standings</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.82rem"}}>
          <thead><tr style={{background:"#1a3a2a",color:"#c9a84c"}}>
            {["#","Player","Team","Rounds","Gross","Net","Money Won"].map(h=><th key={h} style={hdr}>{h}</th>)}
          </tr></thead>
          <tbody>
            {standings.map((s,i)=>{
              const p=PLAYERS.find(x=>x.id===s.playerId);
              return (
                <tr key={s.playerId} style={{background:i%2===0?"#f5f0e8":"#fff"}}>
                  <td style={cell}>{i+1}</td>
                  <td style={{...cell,fontWeight:600}}>{p.name}</td>
                  <td style={{...cell,fontSize:"0.75rem",color:"#4a8c5c"}}>{TEAMS[p.team].name}</td>
                  <td style={{...cell,fontFamily:"monospace"}}>{s.rounds}</td>
                  <td style={{...cell,fontFamily:"monospace"}}>{s.totalGross}</td>
                  <td style={{...cell,fontFamily:"monospace",fontWeight:700}}>{s.totalNet}</td>
                  <td style={{...cell,fontFamily:"monospace",color:"#1a3a2a",fontWeight:700}}>{fmtMoney(money[p.id])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Per-round */}
      {COURSE_KEYS.map(ck=>{
        const cr=roundsByCourse[ck]||[];
        if (!cr.length) return null;
        const course=COURSES[ck];
        const {skins,perSkin}=skinPayouts(ck,cr,ghinOverrides);
        const wonSkins=skins.filter(s=>s.winnerId);
        const {first,second}=dailyLowNet(ck,cr,ghinOverrides);
        const rndLeader=cr.map(r=>({playerId:r.playerId,...getRoundTotals(ck,r.playerId,r.grossScores,ghinOverrides)})).sort((a,b)=>a.net-b.net);
        return (
          <div key={ck} style={{marginBottom:"1.5rem",pageBreakInside:"avoid"}}>
            <div style={{fontSize:"1rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",borderBottom:"2px solid #c9a84c",paddingBottom:"0.3rem",marginBottom:"0.5rem"}}>{course.name} — {course.day}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.75rem"}}>
              <div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.78rem"}}>
                  <thead><tr style={{background:"#f0ede8"}}>{["Player","Gross","Net","Net +/-"].map(h=><th key={h} style={{padding:"0.25rem 0.4rem",textAlign:"left",fontSize:"0.68rem"}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {rndLeader.map((s,i)=>{
                      const p=PLAYERS.find(x=>x.id===s.playerId);
                      return (
                        <tr key={s.playerId} style={{background:i%2===0?"#f5f0e8":"#fff"}}>
                          <td style={{padding:"0.2rem 0.4rem",fontWeight:600}}>{p.name}</td>
                          <td style={{padding:"0.2rem 0.4rem",fontFamily:"monospace"}}>{s.gross}</td>
                          <td style={{padding:"0.2rem 0.4rem",fontFamily:"monospace",fontWeight:700}}>{s.net}</td>
                          <td style={{padding:"0.2rem 0.4rem",fontFamily:"monospace",color:s.netToPar<0?"#2d5a3d":s.netToPar>0?"#c0392b":"#666"}}>{fmtPar(s.netToPar)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div>
                <div style={{fontSize:"0.72rem",fontWeight:700,color:"#4a8c5c",textTransform:"uppercase",marginBottom:"0.25rem"}}>Skins ({wonSkins.length} won · {fmtMoney(perSkin)} ea)</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:"3px",marginBottom:"0.5rem"}}>
                  {skins.map(s=>(
                    <div key={s.hole} style={{width:26,height:26,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:3,fontSize:"0.55rem",fontWeight:700,background:s.winnerId?"#2d5a3d":s.tied?.length?"#ddd":"#f0ede8",color:s.winnerId?"#fff":s.tied?.length?"#666":"#aaa"}}>
                      <span style={{fontSize:"0.5rem",opacity:0.7}}>{s.hole}</span>
                      <span>{s.winnerId?pName(s.winnerId).substring(0,3):s.tied?.length?"TIE":"—"}</span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:"0.72rem",fontWeight:700,color:"#4a8c5c",textTransform:"uppercase",marginBottom:"0.25rem"}}>Daily Low Net</div>
                {first.map(r=><div key={r.playerId} style={{fontSize:"0.8rem"}}>🥇 {pName(r.playerId)} — {r.net} ({fmtMoney(80/first.length)})</div>)}
                {second.map(r=><div key={r.playerId} style={{fontSize:"0.8rem"}}>🥈 {pName(r.playerId)} — {r.net} ({fmtMoney(40/second.length)})</div>)}
              </div>
            </div>
          </div>
        );
      })}

      {/* Past Champions */}
      <div style={{marginBottom:"1.5rem",pageBreakInside:"avoid"}}>
        <div style={{fontSize:"1rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",borderBottom:"2px solid #c9a84c",paddingBottom:"0.3rem",marginBottom:"0.75rem"}}>Past Champions</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0.75rem"}}>
          {[{key:"lowGross",label:"Low Gross"},{key:"lowNet",label:"Low Net"},{key:"ryderCup",label:"Ryder Cup"}].map(({key,label})=>(
            <div key={key}>
              <div style={{fontSize:"0.75rem",fontWeight:700,color:"#4a8c5c",textTransform:"uppercase",marginBottom:"0.3rem"}}>{label}</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.78rem"}}>
                <thead><tr style={{background:"#f0ede8"}}><th style={{padding:"0.2rem 0.4rem",textAlign:"left"}}>Year</th><th style={{padding:"0.2rem 0.4rem",textAlign:"left"}}>Winner</th><th style={{padding:"0.2rem 0.4rem"}}>Score</th></tr></thead>
                <tbody>
                  {pw[key]?.map(r=>(
                    <tr key={r.year} style={{background:r.year===TOURNAMENT.year?"#f0faf4":"",fontWeight:r.year===TOURNAMENT.year?700:400}}>
                      <td style={{padding:"0.2rem 0.4rem",fontFamily:"monospace"}}>{r.year}</td>
                      <td style={{padding:"0.2rem 0.4rem"}}>{r.winner||"TBD"}</td>
                      <td style={{padding:"0.2rem 0.4rem",fontFamily:"monospace",textAlign:"center"}}>{r.score||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      {ctpWinners.length>0&&(
        <div style={{marginBottom:"1.5rem"}}>
          <div style={{fontSize:"1rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",borderBottom:"2px solid #c9a84c",paddingBottom:"0.3rem",marginBottom:"0.5rem"}}>Closest to Pin</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:"0.5rem"}}>
            {ctpWinners.map(c=>(
              <div key={`${c.course_key}-${c.hole_index}`} style={{border:"1px solid #c9a84c",borderRadius:5,padding:"0.5rem 0.75rem",background:"#fffbf0"}}>
                <div style={{fontSize:"0.68rem",color:"#4a8c5c",fontWeight:700,textTransform:"uppercase"}}>{COURSES[c.course_key].name} · Hole {c.hole_index+1}</div>
                <div style={{fontWeight:700,marginTop:"0.1rem"}}>🏆 {pName(c.player_id)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{textAlign:"center",marginTop:"2rem",fontSize:"0.72rem",color:"#999",borderTop:"1px solid #ddd",paddingTop:"0.75rem"}}>
        {TOURNAMENT.name} {TOURNAMENT.year} · Exported {new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}
      </div>
    </div>
  );
}

export default function Export() {
  const { rounds, matchups, ctpWinners, loading, ghinOverrides, roundsByCourse, grossByCoursePlayer } = useAppData();
  const [showPreview, setShowPreview] = useState(false);
  const [prizeWinners, setPrizeWinners] = useState({});
  const [pastWinners, setPastWinners] = useState(PAST_WINNERS);

  useEffect(() => {
    getSettings().then(s => {
      if (s?.prize_winners) setPrizeWinners(s.prize_winners);
      if (s?.past_winners)  setPastWinners(s.past_winners);
    });
  }, []);

  if (loading) return <div className="spinner"/>;
  const hasData = rounds.length > 0;

  function handleCSV() {
    const csv = buildCSV(rounds, matchups, ctpWinners, ghinOverrides, roundsByCourse, grossByCoursePlayer, prizeWinners, pastWinners);
    downloadCSV(csv, `${TOURNAMENT.name.replace(/ /g,"-").toLowerCase()}-${TOURNAMENT.year}-${new Date().toISOString().slice(0,10)}.csv`);
  }

  function handlePrint() {
    setShowPreview(true);
    setTimeout(() => window.print(), 400);
  }

  return (
    <div>
      <div className="card mb-2">
        <div className="card-header"><h2>Export Tournament Data</h2><span className="badge">{TOURNAMENT.year}</span></div>
        <div className="card-body">
          {!hasData ? (
            <p className="text-muted">No scores have been entered yet.</p>
          ) : (
            <>
              <p style={{fontSize:"0.85rem",color:"var(--gray-600)",marginBottom:"1.25rem"}}>
                Export a full record of the {TOURNAMENT.year} {TOURNAMENT.name} — scores, standings, prizes, skins, match play, past champions, and money won.
              </p>
              <div style={{display:"flex",gap:"0.75rem",flexWrap:"wrap"}}>
                <button className="btn btn-primary" onClick={handleCSV}>⬇ Download CSV</button>
                <button className="btn btn-gold" onClick={handlePrint}>🖨 Print / Save PDF</button>
                <button className="btn btn-ghost" onClick={()=>setShowPreview(v=>!v)}>
                  {showPreview?"Hide Preview":"Preview Summary"}
                </button>
              </div>
              <p style={{fontSize:"0.75rem",color:"var(--gray-400)",marginTop:"0.75rem"}}>
                To save as PDF: click Print → choose "Save as PDF" as the printer. Prize winners and past champions are pulled from the Champions tab.
              </p>
            </>
          )}
        </div>
      </div>

      {showPreview && hasData && (
        <div className="card">
          <div className="card-header"><h2>Summary Preview</h2><span className="badge">Print-ready</span></div>
          <div className="card-body" style={{background:"#f5f0e8"}}>
            <PrintSummary
              rounds={rounds} matchups={matchups} ctpWinners={ctpWinners}
              ghinOverrides={ghinOverrides} roundsByCourse={roundsByCourse}
              grossByCoursePlayer={grossByCoursePlayer}
              prizeWinners={prizeWinners} pastWinners={pastWinners}
            />
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .app-shell > header, .app-shell > nav, .card:first-child { display: none !important; }
          .card:last-child { border: none !important; box-shadow: none !important; }
          .card:last-child .card-header { display: none !important; }
          .card:last-child .card-body { background: #fff !important; padding: 0 !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}
