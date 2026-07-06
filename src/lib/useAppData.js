import { useState, useEffect, useCallback } from "react";
import { getRounds, getSettings, getMatchups, getCtpWinners, getDailyPayments } from "./supabase";
import { PLAYERS, TEAMS as DEFAULT_TEAMS, COURSES, COURSE_KEYS } from "./gameData";

export function useAppData() {
  const [rounds, setRounds]           = useState([]);
  const [settings, setSettings]       = useState(null);
  const [matchups, setMatchups]       = useState([]);
  const [ctpWinners, setCtpWinners]   = useState([]);
  const [dailyPayments, setDailyPayments] = useState([]);
  const [loading, setLoading]         = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s, m, c, p] = await Promise.all([getRounds(), getSettings(), getMatchups(), getCtpWinners(), getDailyPayments()]);
      setRounds(r);
      setSettings(s);
      setMatchups(m);
      setCtpWinners(c);
      setDailyPayments(p);
    } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // GHIN overrides
  const ghinOverrides = {};
  if (settings?.handicaps) {
    Object.entries(settings.handicaps).forEach(([id, val]) => {
      if (val !== null && val !== "") ghinOverrides[id] = parseFloat(val);
    });
  }

  // Team config
  const savedTeams = settings?.teams;
  const teams = {
    1: {
      name: savedTeams?.[1]?.name ?? DEFAULT_TEAMS[1].name,
      playerIds: savedTeams?.[1]?.playerIds ?? PLAYERS.filter(p=>p.team===1).map(p=>p.id),
    },
    2: {
      name: savedTeams?.[2]?.name ?? DEFAULT_TEAMS[2].name,
      playerIds: savedTeams?.[2]?.playerIds ?? PLAYERS.filter(p=>p.team===2).map(p=>p.id),
    },
  };

  // Merge team assignments back onto players
  const players = PLAYERS.map(p => {
    const inTeam1 = teams[1].playerIds.includes(p.id);
    const inTeam2 = teams[2].playerIds.includes(p.id);
    return { ...p, team: inTeam1 ? 1 : inTeam2 ? 2 : p.team };
  });

  // Course overrides — merge saved hdcp/par arrays over defaults
  // Stored as: { bearDance: { hdcp: [...18], par: [...18] }, ... }
  const courseOverrides = settings?.course_overrides || {};
  const courses = {};
  COURSE_KEYS.forEach(ck => {
    const base = COURSES[ck];
    const ov   = courseOverrides[ck] || {};
    courses[ck] = {
      ...base,
      tees:   ov.tees   ?? base.tees,
      rating: ov.rating ?? base.rating,
      slope:  ov.slope  ?? base.slope,
      par:    ov.par    || base.par,
      hdcp:   ov.hdcp   || base.hdcp,
    };
  });

  // Build rounds maps
  const roundsByCourse = {};
  rounds.forEach(r => {
    if (!roundsByCourse[r.course_key]) roundsByCourse[r.course_key] = [];
    roundsByCourse[r.course_key].push({ playerId: r.player_id, grossScores: r.gross_scores });
  });

  const grossByCoursePlayer = {};
  rounds.forEach(r => {
    if (!grossByCoursePlayer[r.course_key]) grossByCoursePlayer[r.course_key] = {};
    grossByCoursePlayer[r.course_key][r.player_id] = r.gross_scores;
  });

  return {
    rounds, settings, matchups, ctpWinners, dailyPayments, loading, reload: load,
    ghinOverrides, roundsByCourse, grossByCoursePlayer,
    teams, players,
    courses,  // COURSES merged with any saved overrides
  };
}
