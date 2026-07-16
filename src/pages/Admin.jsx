import { useState, useEffect } from "react";
import { PLAYERS, COURSES, COURSE_KEYS, courseHandicap, TEAMS as DEFAULT_TEAMS, PRIZES, PAST_WINNERS, TOURNAMENT } from "../lib/gameData";
import { getSettings, saveSettings, getMatchups, saveMatchup } from "../lib/supabase";
import PastChampions from "../components/PastChampions";
import { useAppData } from "../lib/useAppData";
import { computePrizes } from "../lib/scoring";
import { resolvePrizes, historyFromComputed } from "../lib/prizes";

const PIN = "golf26";

function getMatchTemplate(courseKey) {
  if (courseKey==="frostCreek") return Array.from({length:6},(_,i)=>({index:i,type:"singles",team1:[null],team2:[null]}));
  return Array.from({length:3},(_,i)=>({index:i,type:"bestball",team1:[null,null],team2:[null,null]}));
}

export default function Admin({ onSave }) {
  // Read-only live data for the Champions tab (saved state, not local edits)
  const app = useAppData();
  const [unlocked, setUnlocked]       = useState(false);
  const [pinInput, setPinInput]       = useState("");
  const [pinError, setPinError]       = useState(false);
  const [activeTab, setActiveTab]     = useState("teams");

  // Teams
  const [teamNames, setTeamNames]     = useState({1:DEFAULT_TEAMS[1].name, 2:DEFAULT_TEAMS[2].name});
  const [teamRosters, setTeamRosters] = useState({
    1:PLAYERS.filter(p=>p.team===1).map(p=>p.id),
    2:PLAYERS.filter(p=>p.team===2).map(p=>p.id),
  });

  // Handicaps
  const [handicaps, setHandicaps]     = useState({});

  // Courses
  const [courseOverrides, setCourseOverrides] = useState({});
  const [editCourse, setEditCourse]   = useState("bearDance");

  // Matchups
  const [matchupCourse, setMatchupCourse] = useState("bearDance");
  const [matches, setMatches]         = useState(getMatchTemplate("bearDance"));
  const [matchSaved, setMatchSaved]   = useState(false);

  // CTP state removed — CTP is now handled in Enter Scores page

  // Champions
  const [prizeWinners, setPrizeWinners] = useState({});
  const [pastWinners, setPastWinners]   = useState(PAST_WINNERS);

  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);

  useEffect(()=>{
    async function load() {
      const s = await getSettings();
      if (s?.handicaps) setHandicaps(s.handicaps);
      if (s?.teams) {
        setTeamNames({1:s.teams[1]?.name??DEFAULT_TEAMS[1].name, 2:s.teams[2]?.name??DEFAULT_TEAMS[2].name});
        setTeamRosters({1:s.teams[1]?.playerIds??PLAYERS.filter(p=>p.team===1).map(p=>p.id), 2:s.teams[2]?.playerIds??PLAYERS.filter(p=>p.team===2).map(p=>p.id)});
      }
      if (s?.course_overrides) setCourseOverrides(s.course_overrides);
      if (s?.prize_winners) setPrizeWinners(s.prize_winners);
      // Only apply saved past_winners if it has the expected array structure
      if (s?.past_winners?.lowGross?.length) setPastWinners(s.past_winners);
    }
    load();
  },[]);

  useEffect(()=>{
    async function loadMatchups() {
      const tpl = getMatchTemplate(matchupCourse);
      const all = await getMatchups();
      const forCourse = all.filter(m=>m.course_key===matchupCourse);
      forCourse.forEach(m=>{ if(tpl[m.match_index]){tpl[m.match_index].team1=m.team1_players; tpl[m.match_index].team2=m.team2_players;} });
      setMatches(tpl); setMatchSaved(false);
    }
    loadMatchups();
  },[matchupCourse]);

  function tryUnlock() {
    if(pinInput===PIN){setUnlocked(true);setPinError(false);}
    else setPinError(true);
  }

  async function handleSave() {
    setSaving(true);
    const existing = await getSettings();
    await saveSettings({...existing, handicaps, teams:{1:{name:teamNames[1],playerIds:teamRosters[1]}, 2:{name:teamNames[2],playerIds:teamRosters[2]}}, course_overrides:courseOverrides, prize_winners:prizeWinners, past_winners:pastWinners});
    setSaving(false); setSaved(true); onSave?.();
    setTimeout(()=>setSaved(false),2500);
  }

  async function handleMatchSave() {
    for (const m of matches) await saveMatchup(matchupCourse, m.index, m.team1, m.team2);
    setMatchSaved(true); onSave?.();
  }

  function togglePlayerTeam(playerId, toTeam) {
    const other = toTeam===1?2:1;
    setTeamRosters(prev=>({...prev,[toTeam]:prev[toTeam].includes(playerId)?prev[toTeam]:[...prev[toTeam],playerId],[other]:prev[other].filter(id=>id!==playerId)}));
    setSaved(false);
  }

  function setHoleValue(ck, field, hi, val) {
    const parsed = parseInt(val,10);
    if(isNaN(parsed)) return;
    setCourseOverrides(prev=>{
      const base=COURSES[ck]; const ex=prev[ck]||{};
      const arr=[...(ex[field]||base[field])]; arr[hi]=parsed;
      return{...prev,[ck]:{...ex,[field]:arr}};
    });
    setSaved(false);
  }

  function setMatchupSlot(matchIdx, side, slotIdx, playerId) {
    setMatches(prev=>prev.map((m,i)=>{
      if(i!==matchIdx) return m;
      const arr=[...(m[side]||[])]; arr[slotIdx]=playerId||null;
      return{...m,[side]:arr};
    }));
    setMatchSaved(false);
  }

  const ghinForPlayer = id => parseFloat(handicaps[id]??PLAYERS.find(p=>p.id===id)?.ghin??0);
  const allAssigned=[...teamRosters[1],...teamRosters[2]];
  const unassigned=PLAYERS.filter(p=>!allAssigned.includes(p.id));
  const team1Players=PLAYERS.filter(p=>teamRosters[1].includes(p.id));
  const team2Players=PLAYERS.filter(p=>teamRosters[2].includes(p.id));
  const isSingles=matchupCourse==="frostCreek";
  const editCourseData={par:[...((courseOverrides[editCourse]?.par)||COURSES[editCourse].par)],hdcp:[...((courseOverrides[editCourse]?.hdcp)||COURSES[editCourse].hdcp)]};
  const hasOverride=!!courseOverrides[editCourse];

  const computed = computePrizes(
    app.rounds, app.matchups, app.roundsByCourse, app.grossByCoursePlayer,
    app.players, app.ghinOverrides, app.courses
  );
  const resolved = resolvePrizes(computed, prizeWinners, app.players, app.teams);
  const roundsPlayedCount = COURSE_KEYS.filter(ck => (app.roundsByCourse[ck]?.length || 0) > 0).length;
  const allRoundsIn = roundsPlayedCount === 4;

  const TABS=[
    {id:"teams",label:"Teams"},
    {id:"matchups",label:"Matchups"},
    {id:"handicaps",label:"Handicaps"},
    {id:"courses",label:"Courses"},
    {id:"champions",label:"Champions"},
  ];

  if (!unlocked) return (
    <div className="card" style={{maxWidth:380}}>
      <div className="card-header"><h2>Admin Access</h2></div>
      <div className="card-body">
        <p style={{fontSize:"var(--text-sm)",color:"var(--gray-600)",marginBottom:"0.75rem"}}>
          Enter the PIN to edit teams, matchups, handicaps, courses, and awards.
        </p>
        <div style={{display:"flex",gap:"0.5rem"}}>
          <input type="password" className="form-input" placeholder="PIN" value={pinInput} style={{width:120}}
            onChange={e=>{setPinInput(e.target.value);setPinError(false);}} onKeyDown={e=>e.key==="Enter"&&tryUnlock()} />
          <button className="btn btn-primary" onClick={tryUnlock}>Unlock</button>
        </div>
        {pinError&&<p style={{color:"var(--red)",fontSize:"var(--text-sm)",marginTop:"0.4rem"}}>Incorrect PIN.</p>}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{display:"flex",gap:"0.4rem",marginBottom:"1rem",flexWrap:"wrap"}}>
        {TABS.map(t=>(
          <button key={t.id} className={`btn btn-sm${activeTab===t.id?" btn-primary":" btn-ghost"}`} onClick={()=>setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TEAMS ── */}
      {activeTab==="teams"&&(
        <div>
          <div className="card mb-2">
            <div className="card-header"><h2>Team Names</h2></div>
            <div className="card-body">
              <div className="grid-2">
                {[1,2].map(t=>(
                  <div key={t} style={{display:"flex",flexDirection:"column",gap:"0.4rem"}}>
                    <label className="form-label">Team {t} Name</label>
                    <input className="form-input" value={teamNames[t]} onChange={e=>setTeamNames(prev=>({...prev,[t]:e.target.value}))} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="card mb-2">
            <div className="card-header"><h2>Rosters</h2></div>
            <div className="card-body">
              <div className="grid-2" style={{marginBottom:"1rem"}}>
                {[1,2].map(t=>(
                  <div key={t}>
                    <div style={{fontWeight:700,fontSize:"var(--text-base)",marginBottom:"0.5rem",color:t===1?"var(--green-mid)":"var(--blue)",borderBottom:`2px solid ${t===1?"var(--green-light)":"var(--blue)"}`,paddingBottom:"0.3rem"}}>
                      {teamNames[t]} ({teamRosters[t].length})
                    </div>
                    {teamRosters[t].map(id=>{
                      const p=PLAYERS.find(x=>x.id===id);
                      return(
                        <div key={id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0.4rem 0.6rem",borderRadius:4,background:t===1?"#e8f5ee":"#e8eef5",border:`1px solid ${t===1?"var(--green-light)":"var(--blue)"}`,marginBottom:2}}>
                          <span style={{fontWeight:600,fontSize:"var(--text-sm)"}}>{p?.name}</span>
                          <button className="btn btn-ghost btn-sm" onClick={()=>togglePlayerTeam(id,t===1?2:1)}>→ {teamNames[t===1?2:1].split(" ")[0]}</button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              {unassigned.length>0&&(
                <div style={{marginBottom:"1rem"}}>
                  <div style={{fontWeight:700,fontSize:"var(--text-sm)",color:"var(--red)",marginBottom:"0.5rem"}}>⚠ Unassigned</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem"}}>
                    {unassigned.map(p=>(
                      <div key={p.id} style={{display:"flex",gap:"0.3rem",alignItems:"center",border:"1px solid var(--gray-200)",borderRadius:4,padding:"0.3rem 0.5rem"}}>
                        <span style={{fontSize:"var(--text-sm)",fontWeight:600}}>{p.name}</span>
                        <button className="btn btn-ghost btn-sm" onClick={()=>togglePlayerTeam(p.id,1)}>T1</button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>togglePlayerTeam(p.id,2)}>T2</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?"Saving…":saved?"✓ Saved":"Save Teams"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MATCHUPS ── */}
      {activeTab==="matchups"&&(
        <div>
          <div className="card mb-2">
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Round</label>
                <select className="form-select" value={matchupCourse} onChange={e=>setMatchupCourse(e.target.value)}>
                  {COURSE_KEYS.map(ck=><option key={ck} value={ck}>{COURSES[ck].name} — {COURSES[ck].day}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="card mb-2">
            <div className="card-header">
              <h2>{isSingles?"Singles":"Best Ball Pairings"} — {COURSES[matchupCourse].name}</h2>
              <span className="badge">{isSingles?"6 Matches · 1 Pt Each":"3 Matches · 1 Pt Each"}</span>
            </div>
            <div className="card-body">
              {(() => {
                const ov = courseOverrides[matchupCourse]||{};
                const base = COURSES[matchupCourse];
                const mcSlope  = ov.slope  ?? base.slope;
                const mcRating = ov.rating ?? base.rating;
                const mcPar    = (ov.par || base.par).reduce((a,b)=>a+b,0);
                const chFor = id => courseHandicap(ghinForPlayer(id), mcSlope, mcRating, mcPar);
                return (
                  <>
                  {matches.map((m,mi)=>{
                    const used=new Set(matches.filter((_,x)=>x!==mi).flatMap(mm=>[...(mm.team1||[]),...(mm.team2||[])]).filter(Boolean));
                    return (
                  <div key={mi} className="match-card">
                    <div className="match-card-header">
                      <span style={{fontWeight:700,fontSize:"var(--text-sm)",color:"var(--gray-600)",textTransform:"uppercase",letterSpacing:"0.04em"}}>Match {mi+1}</span>
                    </div>
                    <div style={{padding:"0.75rem",display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:"0.75rem",alignItems:"center"}}>
                      <div style={{display:"flex",flexDirection:"column",gap:"0.4rem"}}>
                        <div className="tag tag-team1" style={{display:"inline-block",width:"fit-content",marginBottom:"0.25rem"}}>{teamNames[1]}</div>
                        {(m.team1||[]).map((pid,si)=>(
                          <select key={si} className="form-select" value={pid||""} onChange={e=>setMatchupSlot(mi,"team1",si,e.target.value)}>
                            <option value="">— Select —</option>
                            {team1Players.map(p=>(
                              <option key={p.id} value={p.id} disabled={used.has(p.id)&&pid!==p.id}>{p.name} (CH {chFor(p.id)})</option>
                            ))}
                          </select>
                        ))}
                      </div>
                      <div style={{fontFamily:"var(--font-body)",fontSize:"var(--text-sm)",fontWeight:700,color:"var(--gray-400)",textAlign:"center"}}>VS</div>
                      <div style={{display:"flex",flexDirection:"column",gap:"0.4rem"}}>
                        <div className="tag tag-team2" style={{display:"inline-block",width:"fit-content",marginBottom:"0.25rem"}}>{teamNames[2]}</div>
                        {(m.team2||[]).map((pid,si)=>(
                          <select key={si} className="form-select" value={pid||""} onChange={e=>setMatchupSlot(mi,"team2",si,e.target.value)}>
                            <option value="">— Select —</option>
                            {team2Players.map(p=>(
                              <option key={p.id} value={p.id} disabled={used.has(p.id)&&pid!==p.id}>{p.name} (CH {chFor(p.id)})</option>
                            ))}
                          </select>
                        ))}
                      </div>
                    </div>
                  </div>
                    );
                  })}
                  <button className="btn btn-primary" style={{marginTop:"0.75rem"}} onClick={handleMatchSave}>
                    {matchSaved?"✓ Saved":"Save Matchups"}
                  </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── HANDICAPS ── */}
      {activeTab==="handicaps"&&(
        <div className="card">
          <div className="card-header"><h2>GHIN Handicaps</h2><span className="badge">Lock in July 20</span></div>
          <div className="card-body">
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:"0.5rem",marginBottom:"1rem"}}>
              {PLAYERS.map(p=>(
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:"0.5rem",border:"1px solid var(--gray-200)",borderRadius:5,padding:"0.5rem 0.75rem"}}>
                  <span style={{fontWeight:600,minWidth:60,fontSize:"var(--text-sm)"}}>{p.name}</span>
                  <input type="number" step="0.1" min="0" max="54" className="form-input" style={{width:70}}
                    value={handicaps[p.id]??p.ghin} onChange={e=>setHandicaps(prev=>({...prev,[p.id]:e.target.value}))} />
                  <span style={{fontSize:"var(--text-xs)",color:"var(--gray-400)"}}>GHIN</span>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?"Saving…":saved?"✓ Saved":"Save Handicaps"}</button>
          </div>
        </div>
      )}

      {/* ── COURSES ── */}
      {activeTab==="courses"&&(
        <div className="card">
          <div className="card-header"><h2>Course Scorecard Editor</h2></div>
          <div className="card-body">
            <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap",marginBottom:"1rem"}}>
              {COURSE_KEYS.map(ck=>(
                <button key={ck} className={`btn btn-sm${editCourse===ck?" btn-primary":" btn-ghost"}`} onClick={()=>setEditCourse(ck)}>
                  {COURSES[ck].name.split(" ")[0]}{courseOverrides[ck]&&<span style={{marginLeft:"0.3rem",color:"var(--gold)"}}>✎</span>}
                </button>
              ))}
            </div>
            <div style={{marginBottom:"0.75rem",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"0.5rem"}}>
              <span style={{fontWeight:700}}>{COURSES[editCourse].name}</span>
              {hasOverride&&<button className="btn btn-ghost btn-sm" onClick={()=>{setCourseOverrides(prev=>{const n={...prev};delete n[editCourse];return n;});setSaved(false);}}>Reset to default</button>}
            </div>
            <div style={{display:"flex",gap:"0.75rem",flexWrap:"wrap",marginBottom:"1rem",padding:"0.75rem",background:"var(--gray-100)",borderRadius:5}}>
              {[["Tee Color","tees","text"],["Rating","rating","number"],["Slope","slope","number"]].map(([label,field,type])=>(
                <div key={field} style={{display:"flex",flexDirection:"column",gap:"0.2rem"}}>
                  <label className="form-label">{label}</label>
                  <input className="form-input" type={type} step={field==="rating"?"0.1":"1"} style={{width:field==="tees"?90:80}}
                    value={courseOverrides[editCourse]?.[field]??COURSES[editCourse][field]}
                    onChange={e=>{
                      const v=type==="number"?(field==="slope"?parseInt(e.target.value,10):parseFloat(e.target.value)):e.target.value;
                      setCourseOverrides(prev=>({...prev,[editCourse]:{...(prev[editCourse]||{}), [field]:v}}));
                      setSaved(false);
                    }} />
                </div>
              ))}
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",width:"100%",fontFamily:"var(--font-mono)",fontSize:"var(--text-xs)"}}>
                <thead>
                  <tr>
                    <th style={{background:"var(--green-deep)",color:"var(--gold)",padding:"0.3rem 0.5rem",textAlign:"left",fontFamily:"var(--font-body)",fontSize:"var(--text-xs)"}}>Field</th>
                    {Array.from({length:9},(_,i)=><th key={i} style={{background:"var(--green-deep)",color:"var(--gold)",padding:"0.3rem 0.4rem",textAlign:"center",minWidth:40}}>{i+1}</th>)}
                    <th style={{background:"var(--green-mid)",color:"var(--gold)",padding:"0.3rem 0.4rem",textAlign:"center",fontWeight:700}}>Out</th>
                    {Array.from({length:9},(_,i)=><th key={i+9} style={{background:"var(--green-deep)",color:"var(--gold)",padding:"0.3rem 0.4rem",textAlign:"center",minWidth:40}}>{i+10}</th>)}
                    <th style={{background:"var(--green-mid)",color:"var(--gold)",padding:"0.3rem 0.4rem",textAlign:"center",fontWeight:700}}>In</th>
                    <th style={{background:"var(--green-mid)",color:"var(--gold)",padding:"0.3rem 0.4rem",textAlign:"center",fontWeight:700}}>Tot</th>
                  </tr>
                </thead>
                <tbody>
                  {[["par","Par",3,6],["hdcp","Hdcp Index",1,18]].map(([field,label,min,max])=>(
                    <tr key={field}>
                      <td style={{padding:"0.3rem 0.5rem",fontFamily:"var(--font-body)",fontWeight:600,fontSize:"var(--text-xs)",background:field==="par"?"var(--gray-100)":"var(--white)"}}>{label}</td>
                      {editCourseData[field].slice(0,9).map((v,i)=>(
                        <td key={i} style={{padding:"0.2rem",background:field==="par"?"var(--gray-100)":""}}>
                          <input type="number" min={min} max={max} style={{width:36,textAlign:"center",fontFamily:"var(--font-mono)",fontSize:"var(--text-xs)",fontWeight:600,border:`1px solid ${v!==COURSES[editCourse][field][i]?"var(--gold)":"var(--gray-200)"}`,borderRadius:3,padding:"0.15rem 0"}}
                            value={v} onChange={e=>setHoleValue(editCourse,field,i,e.target.value)} />
                        </td>
                      ))}
                      <td style={{padding:"0.3rem",textAlign:"center",fontWeight:700,background:"var(--green-deep)",color:"var(--gold)"}}>{field==="par"?editCourseData.par.slice(0,9).reduce((a,b)=>a+b,0):"—"}</td>
                      {editCourseData[field].slice(9).map((v,i)=>(
                        <td key={i+9} style={{padding:"0.2rem",background:field==="par"?"var(--gray-100)":""}}>
                          <input type="number" min={min} max={max} style={{width:36,textAlign:"center",fontFamily:"var(--font-mono)",fontSize:"var(--text-xs)",fontWeight:600,border:`1px solid ${v!==COURSES[editCourse][field][i+9]?"var(--gold)":"var(--gray-200)"}`,borderRadius:3,padding:"0.15rem 0"}}
                            value={v} onChange={e=>setHoleValue(editCourse,field,i+9,e.target.value)} />
                        </td>
                      ))}
                      <td style={{background:"var(--green-deep)"}}></td>
                      <td style={{padding:"0.3rem",textAlign:"center",fontWeight:700,background:"var(--green-deep)",color:"var(--gold)"}}>{field==="par"?editCourseData.par.reduce((a,b)=>a+b,0):"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-primary" style={{marginTop:"1rem"}} onClick={handleSave} disabled={saving}>{saving?"Saving…":saved?"✓ Saved":"Save Course Changes"}</button>
          </div>
        </div>
      )}

      {/* ── CHAMPIONS ── */}
      {activeTab==="champions"&&(
        <div>
          <div className="card mb-2">
            <div className="card-header">
              <h2>Prize Winners — {TOURNAMENT.year}</h2>
              <span className="badge">{allRoundsIn ? "Final" : `Projected · ${roundsPlayedCount}/4`}</span>
            </div>
            <div className="card-body">
              <p style={{fontSize:"var(--text-sm)",color:"var(--gray-400)",marginBottom:"1rem"}}>
                Winners are calculated from the scores. Only set an override for something the app can't know —
                a playoff, a DQ, or a captain's call on a tie.
              </p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:"0.75rem",marginBottom:"1rem"}}>
                {resolved.map(({prize, value, detail, isOverride})=>(
                  <div key={prize.id} style={{border:`1px solid ${isOverride?"var(--copper)":"var(--gray-200)"}`,borderRadius:5,padding:"0.75rem"}}>
                    <div style={{fontWeight:700,fontSize:"var(--text-sm)",marginBottom:"0.1rem"}}>{prize.label}</div>
                    <div style={{fontSize:"var(--text-xs)",color:"var(--copper)",marginBottom:"0.5rem"}}>🏆 {prize.award}</div>

                    {/* Computed result */}
                    <div style={{background:"var(--gray-100)",borderRadius:4,padding:"0.4rem 0.5rem",marginBottom:"0.5rem"}}>
                      <div style={{fontSize:"0.62rem",color:"var(--gray-400)",textTransform:"uppercase",letterSpacing:"0.06em"}}>
                        {isOverride ? "Override" : "Calculated"}
                      </div>
                      <div style={{fontWeight:600,fontSize:"var(--text-sm)"}}>{value || <span style={{color:"var(--gray-400)"}}>—</span>}</div>
                      {detail && <div style={{fontSize:"var(--text-xs)",color:"var(--gray-600)",fontFamily:"var(--font-mono)"}}>{detail}</div>}
                    </div>

                    {/* Override control */}
                    {prize.id==="ryderCup" ? (
                      <input className="form-input" style={{width:"100%"}} placeholder="Override — leave blank for auto"
                        value={prizeWinners[prize.id]||""} onChange={e=>setPrizeWinners(prev=>({...prev,[prize.id]:e.target.value}))} />
                    ) : prize.id==="lowDaily" ? (
                      <div style={{display:"flex",flexDirection:"column",gap:"0.35rem"}}>
                        {COURSE_KEYS.map(ck=>(
                          <div key={ck} style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                            <span style={{fontSize:"var(--text-xs)",fontWeight:600,color:"var(--gray-600)",minWidth:38}}>{COURSES[ck].day.slice(0,3)}</span>
                            <select className="form-select" style={{flex:1}}
                              value={prizeWinners?.lowDaily?.[ck]||""}
                              onChange={e=>setPrizeWinners(prev=>({...prev,lowDaily:{...(prev.lowDaily||{}),[ck]:e.target.value}}))}>
                              <option value="">Auto</option>
                              {PLAYERS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <select className="form-select" style={{width:"100%"}} value={prizeWinners[prize.id]||""} onChange={e=>setPrizeWinners(prev=>({...prev,[prize.id]:e.target.value}))}>
                        <option value="">Auto — use calculated</option>
                        {PLAYERS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?"Saving…":saved?"✓ Saved":"Save Overrides"}</button>
                <button className="btn btn-ghost" onClick={()=>{setPrizeWinners({});setSaved(false);}}>Clear all overrides</button>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h2>Past Champions</h2></div>
            <div className="card-body" style={{padding:0}}>
              <PastChampions pastWinners={pastWinners} />
            </div>
          </div>
          <div className="card" style={{marginTop:"0.75rem"}}>
            <div className="card-header"><h2>Update {TOURNAMENT.year} History</h2></div>
            <div className="card-body">
              {[{key:"lowGross",label:"Low Gross"},{key:"lowNet",label:"Low Net"},{key:"ryderCup",label:"Ryder Cup"}].map(({key,label})=>{
                const row2026=pastWinners[key]?.find(r=>r.year===TOURNAMENT.year)||{year:TOURNAMENT.year,winner:"",score:""};
                return(
                  <div key={key} style={{marginBottom:"0.75rem"}}>
                    <div className="form-label" style={{marginBottom:"0.3rem"}}>{label} {TOURNAMENT.year}</div>
                    <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
                      <input className="form-input" placeholder="Winner name(s)" style={{flex:2,minWidth:160}}
                        value={row2026.winner}
                        onChange={e=>setPastWinners(prev=>({...prev,[key]:(prev[key]||[]).map(r=>r.year===TOURNAMENT.year?{...r,winner:e.target.value}:r)}))} />
                      <input className="form-input" placeholder="Score" style={{width:100}}
                        value={row2026.score}
                        onChange={e=>setPastWinners(prev=>({...prev,[key]:(prev[key]||[]).map(r=>r.year===TOURNAMENT.year?{...r,score:e.target.value}:r)}))} />
                    </div>
                  </div>
                );
              })}
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?"Saving…":saved?"✓ Saved":"Save History"}</button>
              <button className="btn btn-ghost" style={{marginLeft:"0.5rem"}}
                onClick={()=>{
                  const h = historyFromComputed(computed, app.players, app.teams);
                  setPastWinners(prev=>{
                    const next = {...prev};
                    ["lowGross","lowNet","ryderCup"].forEach(key=>{
                      if (!h[key]?.winner) return;
                      next[key] = (prev[key]||[]).map(r =>
                        r.year===TOURNAMENT.year ? {...r, winner:h[key].winner, score:h[key].score} : r
                      );
                    });
                    return next;
                  });
                  setSaved(false);
                }}>
                Fill from results
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
