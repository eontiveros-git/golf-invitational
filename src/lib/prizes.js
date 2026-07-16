import { PRIZES, COURSES, COURSE_KEYS } from "./gameData";

const fmtPts = n => (n % 1 === 0 ? String(n) : n.toFixed(1));

/** Merge computed prize results with any manual overrides into display rows.
 *  An override always wins — it exists for the things the app can't know:
 *  a playoff on 18, a DQ, or a captain's call on a tie.
 *  Returns [{ prize, value, detail, isOverride }]. */
export function resolvePrizes(computed, overrides = {}, players = [], teams = {}) {
  const nameOf  = id  => players.find(p => p.id === id)?.name ?? id;
  const namesOf = ids => (ids || []).map(nameOf).join(" & ");

  return PRIZES.map(prize => {
    let value = "", detail = "", isOverride = false;

    switch (prize.id) {
      case "lowGross":
        value  = namesOf(computed.lowGross);
        detail = computed.lowGrossScore != null ? `${computed.lowGrossScore} gross` : "";
        break;
      case "lowNet":
        value  = namesOf(computed.lowNet);
        detail = computed.lowNetScore != null ? `${computed.lowNetScore} net` : "";
        break;
      case "highNet":
        value  = namesOf(computed.highNet);
        detail = computed.highNetScore != null ? `${computed.highNetScore} net` : "";
        break;
      case "ryderCup":
        value  = computed.ryderCup?.winner ? (teams[computed.ryderCup.winner]?.name ?? "") : "";
        detail = computed.ryderCup?.score || "";
        break;
      case "ryderMvp":
        value  = namesOf(computed.ryderMvp);
        detail = computed.maxMvp ? `${fmtPts(computed.maxMvp)} pts` : "";
        break;
      case "lowDaily": {
        value = COURSE_KEYS
          .filter(ck => computed.lowDaily?.[ck]?.length)
          .map(ck => `${COURSES[ck].day.slice(0,3)}: ${namesOf(computed.lowDaily[ck])}`)
          .join(" · ");
        break;
      }
      case "mashie": {
        const w = computed.mashie?.winners || [];
        value = namesOf(w.map(x => x.playerId));
        if (computed.mashie?.net != null) {
          const where = w[0] ? ` · ${COURSES[w[0].courseKey].name}` : "";
          detail = `${computed.mashie.net} net${where}`;
        }
        break;
      }
      default:
        break;
    }

    // A manual override replaces whatever was computed
    const ov = overrides[prize.id];
    if (prize.id === "lowDaily" && ov && typeof ov === "object") {
      const parts = COURSE_KEYS.filter(ck => ov[ck])
        .map(ck => `${COURSES[ck].day.slice(0,3)}: ${nameOf(ov[ck])}`);
      if (parts.length) { value = parts.join(" · "); detail = ""; isOverride = true; }
    } else if (typeof ov === "string" && ov.trim()) {
      // Ryder Cup override is free text (a list of names); the rest are player ids
      value = prize.id === "ryderCup" ? ov : nameOf(ov);
      detail = "";
      isOverride = true;
    }

    return { prize, value, detail, isOverride };
  });
}

/** Build the {year, winner, score} rows for the history table from computed
 *  results — used by the "Fill from results" button in Admin. */
export function historyFromComputed(computed, players, teams) {
  const nameOf  = id  => players.find(p => p.id === id)?.name ?? id;
  const namesOf = ids => (ids || []).map(nameOf).join(", ");
  return {
    lowGross: { winner: namesOf(computed.lowGross), score: computed.lowGrossScore != null ? String(computed.lowGrossScore) : "" },
    lowNet:   { winner: namesOf(computed.lowNet),   score: computed.lowNetScore   != null ? String(computed.lowNetScore)   : "" },
    ryderCup: {
      winner: computed.ryderCup?.playerIds?.length ? namesOf(computed.ryderCup.playerIds) : "",
      score:  computed.ryderCup?.score || "",
    },
  };
}
