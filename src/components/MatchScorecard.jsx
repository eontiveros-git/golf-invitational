import { strokesPerHole } from "../lib/gameData";
import { matchHandicaps } from "../lib/scoring";

function scoreClass(score, par) {
  const d = score - par;
  if (d <= -2) return "eagle";
  if (d === -1) return "birdie";
  if (d === 1)  return "bogey";
  if (d === 2)  return "double";
  if (d >= 3)   return "triple";
  return "";
}

// Small dot glyph for stroke markers under the gross score. Multiple strokes
// stack as dots. Uses copper to match the rest of the app's accent.
function StrokeDots({ n }) {
  if (!n) return <span style={{visibility:"hidden"}}>·</span>;
  return <span style={{color:"var(--copper)",fontSize:"0.55rem",letterSpacing:"-1px",lineHeight:1}}>{"●".repeat(n)}</span>;
}

/** Full 18-hole match scorecard.
 *  - Best ball: shows all 4 players' gross/net; highlights each hole's WINNING
 *    ball (the team's best net that hole) with a green/blue background.
 *  - Singles: same layout, 2 rows.
 *  Cells with gross < par or > par pick up the birdie/bogey scorecard notation
 *  so a bad entry (a 4 turning into a 14) jumps out visually.
 */
export default function MatchScorecard({ course, courseKey, match, roundsMap, players, teams, ghinOverrides, courseOverrides, isSingles }) {
  const t1 = match.team1_players || [];
  const t2 = match.team2_players || [];
  const ids = [...t1, ...t2].filter(Boolean);
  if (ids.length < 2) return null;

  const { fullCH, matchH, low } = matchHandicaps(courseKey, ids, ghinOverrides, courseOverrides, match.match_handicaps || {});
  const strokes = Object.fromEntries(ids.map(id => [id, strokesPerHole(matchH[id], course.hdcp)]));
  const nameOf  = id => players.find(p => p.id === id)?.name ?? id;

  // Per-hole team best-net + winner. On holes where a player doesn't have a
  // score yet, they contribute nothing and the other player carries the team.
  const holes = Array.from({length:18}, (_, h) => {
    const netsById = {};
    ids.forEach(id => {
      const g = roundsMap[id]?.[h];
      if (g == null || isNaN(g)) return;
      netsById[id] = g - strokes[id][h];
    });
    const t1Nets = t1.map(id => netsById[id]).filter(v => v != null);
    const t2Nets = t2.map(id => netsById[id]).filter(v => v != null);
    if (!t1Nets.length || !t2Nets.length) {
      return { hole: h+1, netsById, winner: null, t1Best: null, t2Best: null };
    }
    const t1Best = Math.min(...t1Nets);
    const t2Best = Math.min(...t2Nets);
    // Which specific player provided the winning net (for the highlight)
    const t1Winner = t1.find(id => netsById[id] === t1Best);
    const t2Winner = t2.find(id => netsById[id] === t2Best);
    let winner = null;
    if (t1Best < t2Best) winner = 1;
    else if (t2Best < t1Best) winner = 2;
    else winner = "half";
    return { hole: h+1, netsById, winner, t1Best, t2Best, t1Winner, t2Winner };
  });

  // Match status running from the team 1 perspective (positive = up, negative = down)
  const status = [];
  let margin = 0, closedAt = null, closedMargin = 0;
  holes.forEach((h, i) => {
    if (h.winner === 1) margin += 1;
    else if (h.winner === 2) margin -= 1;
    const remaining = 18 - (i + 1);
    if (closedAt == null && h.winner && Math.abs(margin) > remaining) {
      closedAt = i + 1; closedMargin = margin;
    }
    status.push({ margin, closed: closedAt != null && (i+1) > closedAt });
  });

  const fmtStatus = m => m === 0 ? "AS" : m > 0 ? `${m}UP` : `${Math.abs(m)}DN`;

  const par = course.par;
  const front9 = Array.from({length:9},(_,i)=>i);
  const back9  = Array.from({length:9},(_,i)=>i+9);

  const HdrRow = ({ holeSet, labelExtra }) => (
    <tr>
      <th style={{textAlign:"left",padding:"0.3rem 0.5rem",fontSize:"var(--text-xs)"}}>Hole {labelExtra}</th>
      {holeSet.map(i => <th key={i} style={{width:34,textAlign:"center",fontSize:"var(--text-xs)"}}>{i+1}</th>)}
      <th style={{width:44,textAlign:"center",fontSize:"var(--text-xs)"}}>{holeSet[0]===0?"Out":"In"}</th>
    </tr>
  );

  const ParRow = ({ holeSet }) => (
    <tr style={{background:"var(--gray-100)"}}>
      <td style={{padding:"0.2rem 0.5rem",fontWeight:700,fontSize:"var(--text-xs)",color:"var(--gray-600)"}}>Par · Hdcp</td>
      {holeSet.map(i => (
        <td key={i} style={{textAlign:"center",padding:"0.15rem 0"}}>
          <div style={{fontWeight:700,fontSize:"0.72rem",lineHeight:1}}>{par[i]}</div>
          <div style={{fontSize:"0.55rem",color:"var(--gray-400)",lineHeight:1}}>{course.hdcp[i]}</div>
        </td>
      ))}
      <td style={{textAlign:"center",fontWeight:700,fontSize:"0.72rem"}}>{holeSet.reduce((s,i)=>s+par[i],0)}</td>
    </tr>
  );

  const PlayerRow = ({ id, team, holeSet }) => {
    const bandCls = team === 1 ? "match-band-t1" : "match-band-t2";
    let outIn = 0;
    return (
      <tr>
        <td style={{padding:"0.25rem 0.5rem",fontSize:"var(--text-xs)",fontWeight:600,whiteSpace:"nowrap"}}>
          <span className={`match-band ${bandCls}`}/>
          {nameOf(id)}
          <span style={{color:"var(--gray-400)",fontWeight:400,marginLeft:4}}>+{matchH[id]}</span>
        </td>
        {holeSet.map(h => {
          const g = roundsMap[id]?.[h];
          const s = strokes[id][h] || 0;
          const net = g != null ? g - s : null;
          if (net != null) outIn += net;
          const isTeamWinner = team === 1
            ? (holes[h].winner === 1 && holes[h].t1Winner === id)
            : (holes[h].winner === 2 && holes[h].t2Winner === id);
          const cls = g != null ? scoreClass(net, par[h]) : "";
          return (
            <td key={h} style={{
              width:34, textAlign:"center", padding:"0.15rem 0",
              background: isTeamWinner ? (team===1 ? "rgba(74,124,89,0.18)" : "rgba(64,110,142,0.18)") : "",
              borderRight: "1px solid var(--gray-100)",
            }}>
              {g == null ? (
                <div style={{color:"var(--gray-300)",fontSize:"0.7rem"}}>—</div>
              ) : (
                <>
                  <div style={{fontSize:"0.55rem",color:"var(--gray-500)",lineHeight:1}}>{g}</div>
                  <div style={{lineHeight:1,margin:"1px 0"}}><StrokeDots n={s}/></div>
                  <span className={cls} style={{display:"inline-block"}}>
                    <span className="score-mark" style={{fontSize:"0.75rem",fontWeight:700}}>{net}</span>
                  </span>
                </>
              )}
            </td>
          );
        })}
        <td style={{textAlign:"center",fontWeight:700,fontFamily:"var(--font-mono)",fontSize:"0.75rem"}}>
          {holeSet.every(h => roundsMap[id]?.[h] != null) ? outIn : ""}
        </td>
      </tr>
    );
  };

  const TeamBestRow = ({ team, holeSet }) => {
    let sum = 0, complete = true;
    return (
      <tr style={{background:team===1?"rgba(74,124,89,0.08)":"rgba(64,110,142,0.08)"}}>
        <td style={{padding:"0.2rem 0.5rem",fontSize:"var(--text-xs)",fontWeight:700,color:team===1?"var(--pine-mid)":"var(--slate-mid)"}}>
          {teams[team]?.name || `Team ${team}`} best
        </td>
        {holeSet.map(h => {
          const best = team === 1 ? holes[h].t1Best : holes[h].t2Best;
          if (best == null) { complete = false; return <td key={h} style={{textAlign:"center",color:"var(--gray-300)"}}>—</td>; }
          sum += best;
          return (
            <td key={h} style={{textAlign:"center",padding:"0.15rem 0",fontWeight:700,fontFamily:"var(--font-mono)",fontSize:"0.8rem",
              color: team===1 ? "var(--pine-mid)" : "var(--slate-mid)"}}>
              {best}
            </td>
          );
        })}
        <td style={{textAlign:"center",fontWeight:700,fontFamily:"var(--font-mono)",fontSize:"0.8rem"}}>
          {complete ? sum : ""}
        </td>
      </tr>
    );
  };

  const StatusRow = ({ holeSet }) => (
    <tr style={{background:"var(--gray-100)"}}>
      <td style={{padding:"0.2rem 0.5rem",fontSize:"var(--text-xs)",fontWeight:700,color:"var(--gray-600)"}}>
        Status
      </td>
      {holeSet.map(h => {
        const st = status[h];
        if (!st) return <td key={h}/>;
        // Show nothing for holes past the closeout — the match is decided
        const played = roundsMap[ids[0]]?.[h] != null; // any player having a score means the hole was played
        if (!played) return <td key={h} style={{textAlign:"center",color:"var(--gray-300)",fontSize:"0.6rem"}}>—</td>;
        if (st.closed) return <td key={h} style={{textAlign:"center",color:"var(--gray-300)",fontSize:"0.55rem"}}>—</td>;
        const label = fmtStatus(st.margin);
        const color = st.margin > 0 ? "var(--pine-mid)" : st.margin < 0 ? "var(--slate-mid)" : "var(--gray-600)";
        return (
          <td key={h} style={{textAlign:"center",padding:"0.15rem 0",fontSize:"0.6rem",fontWeight:700,color,fontFamily:"var(--font-mono)"}}>
            {label}
          </td>
        );
      })}
      <td/>
    </tr>
  );

  const bothTeams = isSingles ? [] : [1, 2];

  return (
    <div style={{overflowX:"auto",marginTop:"0.5rem",background:"var(--white)",border:"1px solid var(--gray-200)",borderRadius:6}}>
      <table style={{width:"100%",minWidth:640,borderCollapse:"collapse",fontSize:"var(--text-xs)"}}>
        <thead>
          <HdrRow holeSet={front9} labelExtra="" />
        </thead>
        <tbody>
          <ParRow holeSet={front9} />
          {t1.filter(Boolean).map(id => <PlayerRow key={"t1f-"+id} id={id} team={1} holeSet={front9} />)}
          {!isSingles && <TeamBestRow team={1} holeSet={front9} />}
          {t2.filter(Boolean).map(id => <PlayerRow key={"t2f-"+id} id={id} team={2} holeSet={front9} />)}
          {!isSingles && <TeamBestRow team={2} holeSet={front9} />}
          <StatusRow holeSet={front9} />
        </tbody>
        <thead>
          <HdrRow holeSet={back9} labelExtra="(back)" />
        </thead>
        <tbody>
          <ParRow holeSet={back9} />
          {t1.filter(Boolean).map(id => <PlayerRow key={"t1b-"+id} id={id} team={1} holeSet={back9} />)}
          {!isSingles && <TeamBestRow team={1} holeSet={back9} />}
          {t2.filter(Boolean).map(id => <PlayerRow key={"t2b-"+id} id={id} team={2} holeSet={back9} />)}
          {!isSingles && <TeamBestRow team={2} holeSet={back9} />}
          <StatusRow holeSet={back9} />
        </tbody>
      </table>
      <div style={{padding:"0.5rem 0.75rem",background:"var(--gray-100)",fontSize:"var(--text-xs)",color:"var(--gray-600)",borderTop:"1px solid var(--gray-200)",display:"flex",flexWrap:"wrap",gap:"1rem"}}>
        <span><span style={{color:"var(--copper)",fontWeight:700}}>●</span> = stroke this hole</span>
        {!isSingles && <span>Shaded net = the ball counting for that team's best</span>}
        <span>Status = team 1 up/down; blank once closed</span>
      </div>
    </div>
  );
}
