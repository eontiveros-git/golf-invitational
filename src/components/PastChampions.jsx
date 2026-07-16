import { TOURNAMENT } from "../lib/gameData";

/** Read-only past champions table. Rows are driven by the lowGross array;
 *  other categories are matched by YEAR (not index) since the Ryder Cup
 *  started a year later than the stroke-play prizes. */
export default function PastChampions({ pastWinners }) {
  const rows = pastWinners?.lowGross || [];
  if (!rows.length) return <p className="text-muted" style={{padding:"1rem"}}>No history yet.</p>;

  const cell = (entry, dash = "TBD") => (
    <>
      {entry?.winner || <span style={{color:"var(--gray-400)"}}>{dash}</span>}
      {entry?.score ? <span style={{color:"var(--gray-400)",fontSize:"var(--text-xs)"}}> ({entry.score})</span> : ""}
    </>
  );

  return (
    <table className="leaderboard">
      <thead>
        <tr><th>Year</th><th>Low Gross</th><th>Low Net</th><th>Ryder Cup</th></tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const ln = pastWinners.lowNet?.find(x => x.year === r.year);
          const rc = pastWinners.ryderCup?.find(x => x.year === r.year);
          const isThisYear = r.year === TOURNAMENT.year;
          const w = isThisYear ? 700 : 400;
          return (
            <tr key={r.year} style={{background: isThisYear ? "#f0f7f3" : ""}}>
              <td style={{fontWeight:700,fontFamily:"var(--font-mono)"}}>{r.year}</td>
              <td style={{fontWeight:w}}>{cell(r)}</td>
              <td style={{fontWeight:w}}>{cell(ln)}</td>
              {/* em dash, not TBD — the Ryder Cup didn't exist before 2024 */}
              <td style={{fontWeight:w}}>{cell(rc, "—")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
