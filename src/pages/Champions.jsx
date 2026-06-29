import { useState, useEffect } from "react";
import { PRIZES, PAST_WINNERS, PLAYERS, TEAMS, TOURNAMENT, COURSES, COURSE_KEYS } from "../lib/gameData";
import { overallStandings, calcBestBall, calcSingles } from "../lib/scoring";
import { getSettings, saveSettings, getRounds, getMatchups } from "../lib/supabase";

const PIN = "golf26";

function pName(id) { return PLAYERS.find(p=>p.id===id)?.name ?? id; }

export default function Champions({ onSave }) {
  const [unlocked, setUnlocked]     = useState(false);
  const [pinInput, setPinInput]     = useState("");
  const [pinError, setPinError]     = useState(false);
  const [prizeWinners, setPrizeWinners] = useState({});
  const [pastWinners, setPastWinners]   = useState(PAST_WINNERS);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [activeTab, setActiveTab]   = useState("prizes");

  // Live computed winners
  const [standings, setStandings]   = useState([]);
  const [mvpPlayers, setMvpPlayers] = useState([]);
  const [rcWinner, setRcWinner]     = useState(null);

  useEffect(() => {
    async function load() {
      const s = await getSettings();
      if (s?.prize_winners) setPrizeWinners(s.prize_winners);
      if (s?.past_winners)  setPastWinners(s.past_winners);

      // Compute live standings for auto-fill suggestions
      const ghinOverrides = {};
      if (s?.handicaps) Object.entries(s.handicaps).forEach(([id,v])=>{ if(v!==null&&v!=="") ghinOverrides[id]=parseFloat(v); });

      const rounds = await getRounds();
      const matchups = await getMatchups();

      const st = overallStandings(rounds, ghinOverrides).filter(x=>x.rounds>0);
      setStandings(st.sort((a,b)=>a.totalNet-b.totalNet));

      // MVP
      const grossByCoursePlayer = {};
      rounds.forEach(r => {
        if (!grossByCoursePlayer[r.course_key]) grossByCoursePlayer[r.course_key]={};
        grossByCoursePlayer[r.course_key][r.player_id] = r.gross_scores;
      });
      const mvpPts = {};
      PLAYERS.forEach(p=>(mvpPts[p.id]=0));
      matchups.forEach(m => {
        const gMap = grossByCoursePlayer[m.course_key]||{};
        const isSingles = m.course_key==="frostCreek";
        const t1=m.team1_players||[], t2=m.team2_players||[];
        if (isSingles && t1[0]&&t2[0]&&gMap[t1[0]]&&gMap[t2[0]]) {
          const r=calcSingles(m.course_key,t1[0],t2[0],gMap,ghinOverrides);
          [t1[0],t2[0]].forEach(id=>{mvpPts[id]+=(r.rcPoints[id]||0);});
        } else if (!isSingles&&t1.length===2&&t2.length===2&&(t1.some(id=>gMap[id])||t2.some(id=>gMap[id]))) {
          const r=calcBestBall(m.course_key,t1,t2,gMap,ghinOverrides);
          t1.forEach(id=>{mvpPts[id]+=r.rcPoints.team1/2;});
          t2.forEach(id=>{mvpPts[id]+=r.rcPoints.team2/2;});
        }
      });
      const maxPts = Math.max(...Object.values(mvpPts));
      setMvpPlayers(maxPts>0 ? PLAYERS.filter(p=>mvpPts[p.id]===maxPts) : []);

      // Ryder Cup winner
      let rc1=0, rc2=0;
      matchups.forEach(m => {
        const gMap=grossByCoursePlayer[m.course_key]||{};
        const isSingles=m.course_key==="frostCreek";
        const t1=m.team1_players||[], t2=m.team2_players||[];
        if (isSingles&&t1[0]&&t2[0]&&gMap[t1[0]]&&gMap[t2[0]]) {
          const r=calcSingles(m.course_key,t1[0],t2[0],gMap,ghinOverrides);
          rc1+=(r.rcPoints[t1[0]]||0); rc2+=(r.rcPoints[t2[0]]||0);
        } else if (!isSingles&&t1.length===2&&t2.length===2&&(t1.some(id=>gMap[id])||t2.some(id=>gMap[id]))) {
          const r=calcBestBall(m.course_key,t1,t2,gMap,ghinOverrides);
          rc1+=r.rcPoints.team1; rc2+=r.rcPoints.team2;
        }
      });
      setRcWinner(rc1>rc2?1:rc2>rc1?2:null);
    }
    load();
  }, []);

  function tryUnlock() {
    if (pinInput===PIN) { setUnlocked(true); setPinError(false); }
    else setPinError(true);
  }

  async function handleSave() {
    setSaving(true);
    const s = await getSettings();
    await saveSettings({ ...s, prize_winners: prizeWinners, past_winners: pastWinners });
    setSaving(false); setSaved(true);
    onSave?.();
    setTimeout(()=>setSaved(false), 2500);
  }

  // Auto-suggest winners from live data
  const suggestions = {
    lowGross: standings.length ? [{ id: standings.slice().sort((a,b)=>a.totalGross-b.totalGross)[0]?.playerId }] : [],
    lowNet:   standings.length ? [{ id: standings[0]?.playerId }] : [],
    highNet:  standings.length ? [{ id: standings[standings.length-1]?.playerId }] : [],
    ryderMvp: mvpPlayers.map(p=>({ id:p.id })),
  };

  const lowGrossPlayer = standings.slice().sort((a,b)=>a.totalGross-b.totalGross)[0];
  const lowNetPlayer   = standings[0];
  const highNetPlayer  = standings[standings.length-1];

  return (
    <div>
      <div style={{display:"flex",gap:"0.4rem",marginBottom:"1rem",flexWrap:"wrap"}}>
        {["prizes","history"].map(t=>(
          <button key={t} className={`btn btn-sm${activeTab===t?" btn-primary":" btn-ghost"}`} onClick={()=>setActiveTab(t)}>
            {t==="prizes"?"Prizes & Winners":"Past Champions"}
          </button>
        ))}
      </div>

      {activeTab==="prizes" && (
        <>
          {/* Live computed awards */}
          <div className="card mb-2">
            <div className="card-header"><h2>Award Leaders — Live</h2><span className="badge">{TOURNAMENT.year}</span></div>
            <div className="card-body" style={{padding:0}}>
              <table className="leaderboard">
                <thead><tr><th>Award</th><th>Prize</th><th>Current Leader</th></tr></thead>
                <tbody>
                  {[
                    { label:"Low Gross Overall",  award:"Scorecard Holder",       leader: lowGrossPlayer ? `${pName(lowGrossPlayer.playerId)} (${lowGrossPlayer.totalGross})` : "—" },
                    { label:"Low Net Overall",    award:"Scorecard Holder",       leader: lowNetPlayer   ? `${pName(lowNetPlayer.playerId)} (${lowNetPlayer.totalNet})` : "—" },
                    { label:"High Net Overall",   award:"Fairway Headcover",      leader: highNetPlayer  ? `${pName(highNetPlayer.playerId)} (${highNetPlayer.totalNet})` : "—" },
                    { label:"Ryder Cup",          award:"Monogramed Glassware",   leader: rcWinner ? `${TEAMS[rcWinner].name} (${rcWinner===1?PLAYERS.filter(p=>p.team===1).map(p=>p.name).join(", "):PLAYERS.filter(p=>p.team===2).map(p=>p.name).join(", ")})` : "TBD" },
                    { label:"Ryder Cup MVP",      award:"Colorado Hat",           leader: mvpPlayers.length ? mvpPlayers.map(p=>p.name).join(" / ") : "—" },
                    { label:"Low Daily Rounds",   award:"Poker Chip Ballmarker",  leader: "See Results tab" },
                    { label:"1920 Mashie",        award:"Low Individual Net Rnd", leader: lowNetPlayer ? `${pName(lowNetPlayer.playerId)}` : "—" },
                  ].map(row=>(
                    <tr key={row.label}>
                      <td style={{fontWeight:600}}>{row.label}</td>
                      <td style={{fontSize:"0.78rem",color:"var(--gray-600)"}}>{row.award}</td>
                      <td style={{fontWeight:700,color:"var(--green-mid)"}}>{row.leader}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* PIN-protected final winner entry */}
          {!unlocked ? (
            <div className="card">
              <div className="card-header"><h2>Record Final Winners</h2></div>
              <div className="card-body">
                <p style={{fontSize:"0.85rem",color:"var(--gray-600)",marginBottom:"0.75rem"}}>
                  Enter the PIN to record official prize winners after the tournament.
                </p>
                <div style={{display:"flex",gap:"0.5rem"}}>
                  <input type="password" className="form-input" placeholder="PIN" value={pinInput}
                    style={{width:120}} onChange={e=>{setPinInput(e.target.value);setPinError(false);}}
                    onKeyDown={e=>e.key==="Enter"&&tryUnlock()} />
                  <button className="btn btn-primary" onClick={tryUnlock}>Unlock</button>
                </div>
                {pinError && <p style={{color:"var(--red)",fontSize:"0.8rem",marginTop:"0.4rem"}}>Incorrect PIN.</p>}
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header"><h2>Record Official Prize Winners</h2><span className="badge">Admin</span></div>
              <div className="card-body">
                <p style={{fontSize:"0.82rem",color:"var(--gray-400)",marginBottom:"1rem"}}>
                  Record the official winners after the awards ceremony. These will appear in the history tab and export.
                </p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"0.75rem",marginBottom:"1rem"}}>
                  {PRIZES.map(prize=>{
                    const suggestion = suggestions[prize.id]?.[0]?.id;
                    return (
                      <div key={prize.id} style={{border:"1px solid var(--gray-200)",borderRadius:5,padding:"0.75rem"}}>
                        <div style={{fontWeight:700,fontSize:"0.85rem",marginBottom:"0.1rem"}}>{prize.label}</div>
                        <div style={{fontSize:"0.72rem",color:"var(--gold)",marginBottom:"0.4rem"}}>🏆 {prize.award}</div>
                        {prize.id==="ryderCup" ? (
                          <input className="form-input" style={{width:"100%"}}
                            placeholder="e.g. Jeff, Chet, Alex, Drew, Brent, Todd"
                            value={prizeWinners[prize.id]||""}
                            onChange={e=>setPrizeWinners(prev=>({...prev,[prize.id]:e.target.value}))} />
                        ) : (
                          <div style={{display:"flex",gap:"0.4rem",alignItems:"center"}}>
                            <select className="form-select" style={{flex:1}}
                              value={prizeWinners[prize.id]||""}
                              onChange={e=>setPrizeWinners(prev=>({...prev,[prize.id]:e.target.value}))}>
                              <option value="">— Select winner —</option>
                              {PLAYERS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            {suggestion && !prizeWinners[prize.id] && (
                              <button className="btn btn-ghost btn-sm"
                                onClick={()=>setPrizeWinners(prev=>({...prev,[prize.id]:suggestion}))}>
                                Use {pName(suggestion)}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving?"Saving…":saved?"✓ Saved":"Save Winners"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab==="history" && (
        <>
          <div className="grid-2 mb-2">
            {/* Low Gross */}
            <div className="card">
              <div className="card-header"><h2>Low Gross Champions</h2></div>
              <div className="card-body" style={{padding:0}}>
                <table className="leaderboard">
                  <thead><tr><th>Year</th><th>Winner</th><th>Score</th></tr></thead>
                  <tbody>
                    {pastWinners.lowGross.map(r=>(
                      <tr key={r.year} style={{background:r.year===TOURNAMENT.year?"#f0faf4":""}}>
                        <td className="text-mono" style={{fontWeight:700}}>{r.year}</td>
                        <td style={{fontWeight:r.year===TOURNAMENT.year?700:400}}>
                          {r.winner || <span style={{color:"var(--gray-400)"}}>TBD</span>}
                          {r.note && <span style={{fontSize:"0.7rem",color:"var(--gray-400)",marginLeft:"0.4rem"}}>({r.note})</span>}
                        </td>
                        <td className="text-mono">{r.score||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Low Net */}
            <div className="card">
              <div className="card-header"><h2>Low Net Champions</h2></div>
              <div className="card-body" style={{padding:0}}>
                <table className="leaderboard">
                  <thead><tr><th>Year</th><th>Winner</th><th>Score</th></tr></thead>
                  <tbody>
                    {pastWinners.lowNet.map(r=>(
                      <tr key={r.year} style={{background:r.year===TOURNAMENT.year?"#f0faf4":""}}>
                        <td className="text-mono" style={{fontWeight:700}}>{r.year}</td>
                        <td style={{fontWeight:r.year===TOURNAMENT.year?700:400}}>
                          {r.winner || <span style={{color:"var(--gray-400)"}}>TBD</span>}
                        </td>
                        <td className="text-mono">{r.score||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Ryder Cup */}
          <div className="card mb-2">
            <div className="card-header"><h2>Ryder Cup Champions</h2></div>
            <div className="card-body" style={{padding:0}}>
              <table className="leaderboard">
                <thead><tr><th>Year</th><th>Champions</th><th>Score</th></tr></thead>
                <tbody>
                  {pastWinners.ryderCup.map(r=>(
                    <tr key={r.year} style={{background:r.year===TOURNAMENT.year?"#f0faf4":""}}>
                      <td className="text-mono" style={{fontWeight:700}}>{r.year}</td>
                      <td style={{fontWeight:r.year===TOURNAMENT.year?700:400}}>
                        {r.winner || <span style={{color:"var(--gray-400)"}}>TBD</span>}
                      </td>
                      <td className="text-mono">{r.score||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Update 2026 results — PIN protected */}
          {!unlocked ? (
            <div className="card">
              <div className="card-header"><h2>Update {TOURNAMENT.year} Results</h2></div>
              <div className="card-body">
                <p style={{fontSize:"0.85rem",color:"var(--gray-600)",marginBottom:"0.75rem"}}>
                  Enter the PIN to record the {TOURNAMENT.year} champions in the history.
                </p>
                <div style={{display:"flex",gap:"0.5rem"}}>
                  <input type="password" className="form-input" placeholder="PIN" value={pinInput}
                    style={{width:120}} onChange={e=>{setPinInput(e.target.value);setPinError(false);}}
                    onKeyDown={e=>e.key==="Enter"&&tryUnlock()} />
                  <button className="btn btn-primary" onClick={tryUnlock}>Unlock</button>
                </div>
                {pinError && <p style={{color:"var(--red)",fontSize:"0.8rem",marginTop:"0.4rem"}}>Incorrect PIN.</p>}
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header"><h2>Update {TOURNAMENT.year} History</h2><span className="badge">Admin</span></div>
              <div className="card-body">
                {["lowGross","lowNet","ryderCup"].map(key=>{
                  const labels = { lowGross:"Low Gross", lowNet:"Low Net", ryderCup:"Ryder Cup" };
                  const row2026 = pastWinners[key].find(r=>r.year===TOURNAMENT.year)||{year:TOURNAMENT.year,winner:"",score:""};
                  return (
                    <div key={key} style={{marginBottom:"1rem"}}>
                      <div className="form-label" style={{marginBottom:"0.4rem"}}>{labels[key]} {TOURNAMENT.year}</div>
                      <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
                        <input className="form-input" placeholder="Winner name(s)" style={{flex:2,minWidth:180}}
                          value={row2026.winner}
                          onChange={e=>{
                            setPastWinners(prev=>({...prev,[key]:prev[key].map(r=>r.year===TOURNAMENT.year?{...r,winner:e.target.value}:r)}));
                          }} />
                        <input className="form-input" placeholder="Score" style={{width:100}}
                          value={row2026.score}
                          onChange={e=>{
                            setPastWinners(prev=>({...prev,[key]:prev[key].map(r=>r.year===TOURNAMENT.year?{...r,score:e.target.value}:r)}));
                          }} />
                      </div>
                    </div>
                  );
                })}
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving?"Saving…":saved?"✓ Saved":"Save History"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
