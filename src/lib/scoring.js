import { COURSES as DEFAULT_COURSES, COURSE_KEYS, PLAYERS, courseHandicap, strokesPerHole, playerMap } from "./gameData";

function getCourse(courseKey, courseOverrides) {
  return (courseOverrides && courseOverrides[courseKey]) || DEFAULT_COURSES[courseKey];
}

export function getFullNetScores(courseKey, playerId, grossScores, ghinOverrides = {}, courseOverrides = null) {
  const course = getCourse(courseKey, courseOverrides);
  const pmap = playerMap(ghinOverrides);
  const ch = courseHandicap(pmap[playerId].ghin, course.slope, course.rating, course.par.reduce((a,b)=>a+b,0));
  const strokes = strokesPerHole(ch, course.hdcp);
  return grossScores.map((g, i) => g - strokes[i]);
}

export function getRoundTotals(courseKey, playerId, grossScores, ghinOverrides = {}, courseOverrides = null) {
  const course = getCourse(courseKey, courseOverrides);
  const net = getFullNetScores(courseKey, playerId, grossScores, ghinOverrides, courseOverrides);
  const gross = grossScores.reduce((a,b)=>a+b,0);
  const netTotal = net.reduce((a,b)=>a+b,0);
  const par = course.par.reduce((a,b)=>a+b,0);
  return { gross, net: netTotal, par, grossToPar: gross-par, netToPar: netTotal-par };
}

export function calcSkins(courseKey, roundsForCourse, ghinOverrides = {}, courseOverrides = null) {
  const skins = [];
  for (let h = 0; h < 18; h++) {
    const holeScores = roundsForCourse.map(r => {
      const net = getFullNetScores(courseKey, r.playerId, r.grossScores, ghinOverrides, courseOverrides);
      return { playerId: r.playerId, net: net[h] };
    });
    const minNet = Math.min(...holeScores.map(s => s.net));
    const winners = holeScores.filter(s => s.net === minNet);
    if (winners.length === 1) skins.push({ hole: h+1, winnerId: winners[0].playerId, netScore: minNet });
    else skins.push({ hole: h+1, winnerId: null, netScore: minNet, tied: winners.map(w=>w.playerId) });
  }
  return skins;
}

/** Split a whole-dollar pot across recipients with no cents left over.
 *  Everyone gets floor(pot/n); the remainder is handed out $1 at a time
 *  following the order of `recipients`. An id may appear more than once
 *  (e.g. a player who won multiple skins) and accumulates correctly.
 *  Returns { payouts: {id: $}, base, remainder }. */
export function splitPot(pot, recipients) {
  const payouts = {};
  if (!recipients.length) return { payouts, base: 0, remainder: 0 };
  const base = Math.floor(pot / recipients.length);
  const remainder = pot - base * recipients.length;
  recipients.forEach((id, i) => {
    payouts[id] = (payouts[id] || 0) + base + (i < remainder ? 1 : 0);
  });
  return { payouts, base, remainder };
}

export function skinPayouts(courseKey, roundsForCourse, ghinOverrides = {}, courseOverrides = null) {
  const skins = calcSkins(courseKey, roundsForCourse, ghinOverrides, courseOverrides);
  const playerCount = roundsForCourse.length;
  const buyIn = 20; // per player
  const pot = buyIn * playerCount;
  // calcSkins returns holes 1→18 in order, so wonSkins is already in hole order.
  // The odd dollars go to the earliest skins on the card.
  const wonSkins = skins.filter(s => s.winnerId);
  const { payouts, base: perSkin, remainder } = splitPot(pot, wonSkins.map(s => s.winnerId));

  const grossWinnings = {};
  PLAYERS.forEach(p => (grossWinnings[p.id] = payouts[p.id] || 0));

  // Net winnings = gross collected − own buy-in (only for players who participated)
  const netWinnings = {};
  PLAYERS.forEach(p => (netWinnings[p.id] = 0));
  roundsForCourse.forEach(r => {
    netWinnings[r.playerId] = (grossWinnings[r.playerId]||0) - buyIn;
  });

  return { skins, perSkin, remainder, totals: grossWinnings, netTotals: netWinnings };
}

export function dailyLowNet(courseKey, roundsForCourse, ghinOverrides = {}, courseOverrides = null) {
  const ranked = roundsForCourse
    .map(r => {
      const t = getRoundTotals(courseKey, r.playerId, r.grossScores, ghinOverrides, courseOverrides);
      return { playerId: r.playerId, net: t.net };
    })
    .sort((a,b) => a.net - b.net);

  if (ranked.length === 0) return { first:[], second:[], payouts:{}, netPayouts:{} };
  const firstNet = ranked[0].net;
  const first = ranked.filter(r => r.net === firstNet);
  const remaining = ranked.filter(r => r.net !== firstNet);
  const secondNet = remaining[0]?.net;
  const second = secondNet !== undefined ? remaining.filter(r => r.net === secondNet) : [];

  // $10/player pot = $120 total. Split: $80 first, $40 second
  const buyIn = 10; // per player per day
  const firstPrize = 80;
  const secondPrize = 40;

  // Ties split their prize; odd dollars go to the lower gross score first
  const { payouts: firstPay }  = splitPot(firstPrize,  first.map(r => r.playerId));
  const { payouts: secondPay } = splitPot(secondPrize, second.map(r => r.playerId));

  const grossPayouts = {};
  PLAYERS.forEach(p => (grossPayouts[p.id] = (firstPay[p.id] || 0) + (secondPay[p.id] || 0)));

  // Net = gross collected − own buy-in
  const netPayouts = {};
  PLAYERS.forEach(p => (netPayouts[p.id] = 0));
  roundsForCourse.forEach(r => {
    netPayouts[r.playerId] = (grossPayouts[r.playerId]||0) - buyIn;
  });

  return { first, second, payouts: grossPayouts, netPayouts };
}

/** Gross nightly payouts for one course — the cash the organizer physically
 *  hands out that evening. Buy-ins are collected upfront ($265/player), so
 *  these are GROSS, not net of buy-in.
 *  Returns { playerId: { skins, lowNet, ctp, total } } for players with scores. */
export function getDayPayouts(courseKey, roundsByCourse, ctpWinners, ghinOverrides = {}, courseOverrides = null) {
  const cr = roundsByCourse[courseKey] || [];
  if (!cr.length) return {};

  const { totals: skinGross } = skinPayouts(courseKey, cr, ghinOverrides, courseOverrides);
  const { payouts: lnGross }  = dailyLowNet(courseKey, cr, ghinOverrides, courseOverrides);

  // Each par 3's CTP winner collects $5 from everyone in the field
  const ctpGross = {};
  cr.forEach(r => { ctpGross[r.playerId] = 0; });
  (ctpWinners || []).filter(c => c.course_key === courseKey).forEach(c => {
    if (!c.player_id) return;
    ctpGross[c.player_id] = (ctpGross[c.player_id] || 0) + 5 * cr.length;
  });

  const result = {};
  cr.forEach(r => {
    const skins  = Math.round(skinGross[r.playerId] || 0);
    const lowNet = Math.round(lnGross[r.playerId]   || 0);
    const ctp    = Math.round(ctpGross[r.playerId]  || 0);
    result[r.playerId] = { skins, lowNet, ctp, total: skins + lowNet + ctp };
  });
  return result;
}

function closeoutResult(holeResults, sideAKey, sideBKey) {
  let margin = 0, decidedAtHole = null, decidedMargin = 0;
  for (let i = 0; i < holeResults.length; i++) {
    const r = holeResults[i];
    if (r === sideAKey) margin += 1;
    else if (r === sideBKey) margin -= 1;
    const holesRemaining = holeResults.length - (i + 1);
    if (decidedAtHole === null && Math.abs(margin) > holesRemaining) {
      decidedAtHole = i + 1; decidedMargin = margin;
    }
  }
  const finalMargin = margin;
  const playedHoles = holeResults.filter(r => r !== null).length;
  if (decidedAtHole !== null && decidedAtHole < holeResults.length) {
    const holesLeft = holeResults.length - decidedAtHole;
    return { isFinal: true, label: `${Math.abs(decidedMargin)} & ${holesLeft}`, margin: decidedMargin };
  }
  if (playedHoles === holeResults.length) {
    if (finalMargin === 0) return { isFinal: true, label: "Halved", margin: 0 };
    return { isFinal: true, label: `${Math.abs(finalMargin)} up`, margin: finalMargin };
  }
  if (margin === 0) return { isFinal: false, label: playedHoles>0 ? "All Square" : "Not started", margin: 0 };
  return { isFinal: false, label: `${Math.abs(margin)} up thru ${playedHoles}`, margin };
}

/** Match-play handicaps for one match: everyone plays off the LOW course
 *  handicap in the group, so the low man is scratch and the rest get the
 *  difference. Returns { fullCH, matchH, low } keyed by playerId.
 *  `overrides` (optional) is { playerId: matchStrokes } and wins when present —
 *  for the hand-adjusted cases a pure formula can't reproduce. */
export function matchHandicaps(courseKey, ids, ghinOverrides = {}, courseOverrides = null, overrides = {}) {
  const course = getCourse(courseKey, courseOverrides);
  const pmap = playerMap(ghinOverrides);
  const par = course.par.reduce((a,b)=>a+b,0);
  const fullCH = {};
  ids.forEach(id => { fullCH[id] = courseHandicap(pmap[id].ghin, course.slope, course.rating, par); });
  const low = Math.min(...ids.map(id => fullCH[id]));
  const matchH = {};
  ids.forEach(id => {
    matchH[id] = (overrides[id] !== undefined && overrides[id] !== "" && overrides[id] !== null)
      ? Number(overrides[id])
      : fullCH[id] - low;
  });
  return { fullCH, matchH, low };
}

export function calcBestBall(courseKey, team1Ids, team2Ids, roundsMap, ghinOverrides = {}, courseOverrides = null, matchOverrides = {}) {
  const course = getCourse(courseKey, courseOverrides);
  const allIds = [...team1Ids, ...team2Ids];
  const { matchH } = matchHandicaps(courseKey, allIds, ghinOverrides, courseOverrides, matchOverrides);
  const strokes = Object.fromEntries(allIds.map(id => [id, strokesPerHole(matchH[id], course.hdcp)]));

  const holes = [];
  let t1Pts=0, t2Pts=0;
  for (let h = 0; h < 18; h++) {
    const t1Nets = team1Ids.filter(id=>roundsMap[id]).map(id=>roundsMap[id][h]-strokes[id][h]);
    const t2Nets = team2Ids.filter(id=>roundsMap[id]).map(id=>roundsMap[id][h]-strokes[id][h]);
    if (!t1Nets.length || !t2Nets.length) { holes.push({ hole:h+1, winner:null }); continue; }
    const t1Best = Math.min(...t1Nets), t2Best = Math.min(...t2Nets);
    let winner;
    if (t1Best < t2Best)      { winner=1; t1Pts++; }
    else if (t2Best < t1Best) { winner=2; t2Pts++; }
    else                       { winner="half"; t1Pts+=0.5; t2Pts+=0.5; }
    holes.push({ hole:h+1, t1Best, t2Best, winner });
  }
  let rc1=0, rc2=0;
  if (t1Pts > t2Pts)      { rc1=1; rc2=0; }
  else if (t2Pts > t1Pts) { rc1=0; rc2=1; }
  else                     { rc1=0.5; rc2=0.5; }
  const matchPlay = closeoutResult(holes.map(h=>h.winner===1?1:h.winner===2?2:h.winner==="half"?"half":null), 1, 2);
  return { holes, holeWins:{team1:t1Pts, team2:t2Pts}, rcPoints:{team1:rc1, team2:rc2}, matchPlay };
}

export function calcSingles(courseKey, p1Id, p2Id, roundsMap, ghinOverrides = {}, courseOverrides = null, matchOverrides = {}) {
  const course = getCourse(courseKey, courseOverrides);
  const { matchH } = matchHandicaps(courseKey, [p1Id, p2Id], ghinOverrides, courseOverrides, matchOverrides);
  const s1 = strokesPerHole(matchH[p1Id], course.hdcp);
  const s2 = strokesPerHole(matchH[p2Id], course.hdcp);

  const holes = [];
  let p1Pts=0, p2Pts=0;
  for (let h = 0; h < 18; h++) {
    if (!roundsMap[p1Id] || !roundsMap[p2Id]) { holes.push({ hole:h+1, winner:null }); continue; }
    const n1 = roundsMap[p1Id][h]-s1[h], n2 = roundsMap[p2Id][h]-s2[h];
    let winner;
    if (n1 < n2)      { winner=p1Id; p1Pts++; }
    else if (n2 < n1) { winner=p2Id; p2Pts++; }
    else               { winner="half"; p1Pts+=0.5; p2Pts+=0.5; }
    holes.push({ hole:h+1, n1, n2, winner });
  }
  let rc1=0, rc2=0;
  if (p1Pts > p2Pts)      { rc1=1; rc2=0; }
  else if (p2Pts > p1Pts) { rc1=0; rc2=1; }
  else                     { rc1=0.5; rc2=0.5; }
  const matchPlay = closeoutResult(holes.map(h=>h.winner===p1Id?"a":h.winner===p2Id?"b":h.winner==="half"?"half":null), "a", "b");
  return { holes, holeWins:{[p1Id]:p1Pts,[p2Id]:p2Pts}, rcPoints:{[p1Id]:rc1,[p2Id]:rc2}, matchPlay };
}

export function overallStandings(rounds, ghinOverrides = {}, courseOverrides = null) {
  const standings = {};
  PLAYERS.forEach(p => { standings[p.id] = { playerId:p.id, name:p.name, team:p.team, totalGross:0, totalNet:0, rounds:0 }; });
  rounds.forEach(r => {
    if (!r.gross_scores || r.gross_scores.length !== 18) return;
    const t = getRoundTotals(r.course_key, r.player_id, r.gross_scores, ghinOverrides, courseOverrides);
    standings[r.player_id].totalGross += t.gross;
    standings[r.player_id].totalNet += t.net;
    standings[r.player_id].rounds++;
  });
  return Object.values(standings);
}

export function calcSettlement(rounds, matchups, ctpWinners, ghinOverrides, roundsByCourse, grossByCoursePlayer, players, courseOverrides = null) {

  // balance tracks each player's NET position:
  // positive = they are owed money, negative = they owe money
  // We use NET winnings (collected − own buy-in) for each pot
  // so a winner never "pays himself" in the transaction list
  const balance = {};
  players.forEach(p => (balance[p.id] = 0));

  // ── Skins: net per player = winnings_collected − $20_buy_in ──────────
  COURSE_KEYS.forEach(ck => {
    const cr = roundsByCourse[ck] || [];
    if (!cr.length) return;
    const { netTotals } = skinPayouts(ck, cr, ghinOverrides, courseOverrides);
    players.forEach(p => { balance[p.id] += (netTotals[p.id]||0); });
  });

  // ── Daily low net: net per player = winnings_collected − $10_buy_in ──
  COURSE_KEYS.forEach(ck => {
    const cr = roundsByCourse[ck] || [];
    if (!cr.length) return;
    const { netPayouts } = dailyLowNet(ck, cr, ghinOverrides, courseOverrides);
    players.forEach(p => { balance[p.id] += (netPayouts[p.id]||0); });
  });

  // ── CTP: $5/player per par 3 hole. Collected upfront for all par 3s. ──
  COURSE_KEYS.forEach(ck => {
    const cr = roundsByCourse[ck] || [];
    if (!cr.length) return;
    const ctpForCourse = ctpWinners.filter(c => c.course_key === ck);
    const coursePar3Count = (getCourse(ck, courseOverrides).par || DEFAULT_COURSES[ck].par)
      .filter(p => p === 3).length;

    // Every player pays $5 per par 3 on this course (collected upfront)
    cr.forEach(r => {
      balance[r.playerId] -= 5 * coursePar3Count;
    });
    // CTP winners collect $5 × player count for their hole
    ctpForCourse.forEach(c => {
      if (c.player_id && balance[c.player_id] !== undefined) {
        balance[c.player_id] += 5 * cr.length;
      }
    });
  });

  // ── Ryder Cup: $50/player pot = $600. Winning team splits. ───────────
  let rc1=0, rc2=0;
  matchups.forEach(m => {
    const gMap = grossByCoursePlayer[m.course_key]||{};
    const isSingles = m.course_key==="frostCreek";
    const t1=m.team1_players||[], t2=m.team2_players||[];
    if (isSingles&&t1[0]&&t2[0]&&gMap[t1[0]]&&gMap[t2[0]]) {
      const r=calcSingles(m.course_key,t1[0],t2[0],gMap,ghinOverrides,courseOverrides);
      rc1+=(r.rcPoints[t1[0]]||0); rc2+=(r.rcPoints[t2[0]]||0);
    } else if (!isSingles&&t1.length===2&&t2.length===2&&(t1.some(id=>gMap[id])||t2.some(id=>gMap[id]))) {
      const r=calcBestBall(m.course_key,t1,t2,gMap,ghinOverrides,courseOverrides);
      rc1+=r.rcPoints.team1; rc2+=r.rcPoints.team2;
    }
  });
  const rcWinner = rc1>rc2?1:rc2>rc1?2:null;
  // Everyone pays $50 into RC pot
  players.forEach(p => { balance[p.id] -= 50; });
  if (rcWinner) {
    const winners = players.filter(p=>p.team===rcWinner);
    // Winners split the full $600 pot (12 × $50), netting $50 back + others' share
    winners.forEach(p => { balance[p.id] += 600/winners.length; });
  }

  // ── MVP: $10/player pot = $120. Winner(s) take it. ───────────────────
  const mvpPts = {};
  players.forEach(p=>(mvpPts[p.id]=0));
  matchups.forEach(m => {
    const gMap=grossByCoursePlayer[m.course_key]||{};
    const isSingles=m.course_key==="frostCreek";
    const t1=m.team1_players||[], t2=m.team2_players||[];
    if (isSingles&&t1[0]&&t2[0]&&gMap[t1[0]]&&gMap[t2[0]]) {
      const r=calcSingles(m.course_key,t1[0],t2[0],gMap,ghinOverrides,courseOverrides);
      [t1[0],t2[0]].forEach(id=>{mvpPts[id]+=(r.rcPoints[id]||0);});
    } else if (!isSingles&&t1.length===2&&t2.length===2&&(t1.some(id=>gMap[id])||t2.some(id=>gMap[id]))) {
      const r=calcBestBall(m.course_key,t1,t2,gMap,ghinOverrides,courseOverrides);
      t1.forEach(id=>{mvpPts[id]+=r.rcPoints.team1/2;});
      t2.forEach(id=>{mvpPts[id]+=r.rcPoints.team2/2;});
    }
  });
  const maxMvp = Math.max(...Object.values(mvpPts));
  players.forEach(p => { balance[p.id] -= 10; }); // everyone pays $10
  if (maxMvp > 0) {
    const mvpWinners = players.filter(p=>mvpPts[p.id]===maxMvp);
    mvpWinners.forEach(p=>{ balance[p.id] += 120/mvpWinners.length; });
  }

  // ── Minimum transactions to settle all balances ───────────────────────
  const transactions = [];
  const bal = Object.entries(balance).map(([id,amt])=>({ id, amt: Math.round(amt*100)/100 }));
  let debtors   = bal.filter(b=>b.amt<-0.01).sort((a,b)=>a.amt-b.amt);
  let creditors = bal.filter(b=>b.amt> 0.01).sort((a,b)=>b.amt-a.amt);

  while (debtors.length && creditors.length) {
    const debtor   = debtors[0];
    const creditor = creditors[0];
    const amount   = Math.min(Math.abs(debtor.amt), creditor.amt);
    const rounded  = Math.round(amount*100)/100;
    if (rounded > 0.01) transactions.push({ from: debtor.id, to: creditor.id, amount: rounded });
    debtor.amt   += amount;
    creditor.amt -= amount;
    if (Math.abs(debtor.amt)   < 0.01) debtors.shift();
    if (Math.abs(creditor.amt) < 0.01) creditors.shift();
  }

  return { balance, transactions };
}


// ── Ryder Cup ─────────────────────────────────────────────────────────────
/** Ryder Cup team points + MVP points from matchups.
 *  Single source of truth — Dashboard, Settlement and prizes all call this. */
export function computeRyderCup(matchups, grossByCoursePlayer, players, ghinOverrides = {}, courseOverrides = null) {
  let team1 = 0, team2 = 0;
  const mvpPoints = {};
  players.forEach(p => (mvpPoints[p.id] = 0));

  (matchups || []).forEach(m => {
    const gMap = grossByCoursePlayer[m.course_key] || {};
    const isSingles = m.course_key === "frostCreek";
    const t1 = m.team1_players || [], t2 = m.team2_players || [];

    const mh = m.match_handicaps || {};
    if (isSingles && t1[0] && t2[0] && gMap[t1[0]] && gMap[t2[0]]) {
      const r = calcSingles(m.course_key, t1[0], t2[0], gMap, ghinOverrides, courseOverrides, mh);
      team1 += r.rcPoints[t1[0]] || 0;
      team2 += r.rcPoints[t2[0]] || 0;
      [t1[0], t2[0]].forEach(id => { mvpPoints[id] += r.rcPoints[id] || 0; });
    } else if (!isSingles && t1.length === 2 && t2.length === 2 && (t1.some(id => gMap[id]) || t2.some(id => gMap[id]))) {
      const r = calcBestBall(m.course_key, t1, t2, gMap, ghinOverrides, courseOverrides, mh);
      team1 += r.rcPoints.team1;
      team2 += r.rcPoints.team2;
      // Best ball is a team result — split the point between the pair for MVP
      t1.forEach(id => { mvpPoints[id] += r.rcPoints.team1 / 2; });
      t2.forEach(id => { mvpPoints[id] += r.rcPoints.team2 / 2; });
    }
  });

  const winner = team1 > team2 ? 1 : team2 > team1 ? 2 : null;
  const maxMvp = Math.max(0, ...Object.values(mvpPoints));
  const mvpWinners = maxMvp > 0 ? players.filter(p => mvpPoints[p.id] === maxMvp).map(p => p.id) : [];

  return { team1, team2, winner, mvpPoints, maxMvp, mvpWinners };
}

// ── Prizes ────────────────────────────────────────────────────────────────
const fmtPts = n => (n % 1 === 0 ? String(n) : n.toFixed(1));

/** Compute every trophy from the scores. Ties return every player tied.
 *  Overall prizes only compare players on the same number of rounds, so the
 *  standings stay fair mid-trip. */
export function computePrizes(rounds, matchups, roundsByCourse, grossByCoursePlayer, players, ghinOverrides = {}, courseOverrides = null) {
  const out = {
    lowGross: [], lowNet: [], highNet: [],
    ryderCup: { winner: null, playerIds: [], score: "", team1: 0, team2: 0 },
    ryderMvp: [], maxMvp: 0,
    lowDaily: {},
    mashie: { net: null, winners: [] },
    roundsComplete: 0,
  };

  // ── Overall gross / net ──
  const standings = overallStandings(rounds, ghinOverrides, courseOverrides).filter(s => s.rounds > 0);
  if (standings.length) {
    // Only compare players who've played the same number of rounds — otherwise
    // someone who skipped a day would "win" low gross on a smaller total.
    const maxRounds = Math.max(...standings.map(s => s.rounds));
    const eligible = standings.filter(s => s.rounds === maxRounds);
    out.roundsComplete = maxRounds;

    const minGross = Math.min(...eligible.map(s => s.totalGross));
    out.lowGross = eligible.filter(s => s.totalGross === minGross).map(s => s.playerId);
    out.lowGrossScore = minGross;

    const minNet = Math.min(...eligible.map(s => s.totalNet));
    out.lowNet = eligible.filter(s => s.totalNet === minNet).map(s => s.playerId);
    out.lowNetScore = minNet;

    const maxNet = Math.max(...eligible.map(s => s.totalNet));
    out.highNet = eligible.filter(s => s.totalNet === maxNet).map(s => s.playerId);
    out.highNetScore = maxNet;
  }

  // ── Ryder Cup + MVP ──
  const rc = computeRyderCup(matchups, grossByCoursePlayer, players, ghinOverrides, courseOverrides);
  out.ryderCup = {
    winner: rc.winner,
    playerIds: rc.winner ? players.filter(p => p.team === rc.winner).map(p => p.id) : [],
    score: (rc.team1 || rc.team2) ? `${fmtPts(rc.team1)} to ${fmtPts(rc.team2)}` : "",
    team1: rc.team1,
    team2: rc.team2,
  };
  out.ryderMvp = rc.mvpWinners;
  out.maxMvp = rc.maxMvp;
  out.mvpPoints = rc.mvpPoints;

  // ── Low daily round — same winners as the $80 daily low net ──
  COURSE_KEYS.forEach(ck => {
    const cr = roundsByCourse[ck] || [];
    if (!cr.length) return;
    const { first } = dailyLowNet(ck, cr, ghinOverrides, courseOverrides);
    out.lowDaily[ck] = first.map(r => r.playerId);
  });

  // ── 1920 Mashie — lowest single net round of the trip ──
  const netRounds = [];
  (rounds || []).forEach(r => {
    if (!r.gross_scores || r.gross_scores.length !== 18) return;
    if (r.gross_scores.some(v => v == null || isNaN(v))) return;
    const t = getRoundTotals(r.course_key, r.player_id, r.gross_scores, ghinOverrides, courseOverrides);
    netRounds.push({ playerId: r.player_id, courseKey: r.course_key, net: t.net });
  });
  if (netRounds.length) {
    const best = Math.min(...netRounds.map(r => r.net));
    out.mashie = { net: best, winners: netRounds.filter(r => r.net === best) };
  }

  return out;
}
