import { COURSES, PLAYERS, courseHandicap, strokesPerHole, playerMap } from "./gameData";

export function getFullNetScores(courseKey, playerId, grossScores, ghinOverrides = {}) {
  const course = COURSES[courseKey];
  const pmap = playerMap(ghinOverrides);
  const ch = courseHandicap(pmap[playerId].ghin, course.slope);
  const strokes = strokesPerHole(ch, course.hdcp);
  return grossScores.map((g, i) => g - strokes[i]);
}

export function getRoundTotals(courseKey, playerId, grossScores, ghinOverrides = {}) {
  const course = COURSES[courseKey];
  const net = getFullNetScores(courseKey, playerId, grossScores, ghinOverrides);
  const gross = grossScores.reduce((a,b)=>a+b,0);
  const netTotal = net.reduce((a,b)=>a+b,0);
  const par = course.par.reduce((a,b)=>a+b,0);
  return { gross, net: netTotal, par, grossToPar: gross-par, netToPar: netTotal-par };
}

export function calcSkins(courseKey, roundsForCourse, ghinOverrides = {}) {
  const skins = [];
  for (let h = 0; h < 18; h++) {
    const holeScores = roundsForCourse.map(r => {
      const net = getFullNetScores(courseKey, r.playerId, r.grossScores, ghinOverrides);
      return { playerId: r.playerId, net: net[h] };
    });
    const minNet = Math.min(...holeScores.map(s => s.net));
    const winners = holeScores.filter(s => s.net === minNet);
    if (winners.length === 1) skins.push({ hole: h+1, winnerId: winners[0].playerId, netScore: minNet });
    else skins.push({ hole: h+1, winnerId: null, netScore: minNet, tied: winners.map(w=>w.playerId) });
  }
  return skins;
}

export function skinPayouts(courseKey, roundsForCourse, ghinOverrides = {}) {
  const skins = calcSkins(courseKey, roundsForCourse, ghinOverrides);
  const pot = 240;
  const wonSkins = skins.filter(s => s.winnerId);
  const perSkin = wonSkins.length > 0 ? pot / wonSkins.length : 0;
  const totals = {};
  PLAYERS.forEach(p => (totals[p.id] = 0));
  wonSkins.forEach(s => (totals[s.winnerId] = (totals[s.winnerId]||0) + perSkin));
  return { skins, perSkin: Math.round(perSkin*100)/100, totals };
}

export function dailyLowNet(courseKey, roundsForCourse, ghinOverrides = {}) {
  const ranked = roundsForCourse
    .map(r => {
      const t = getRoundTotals(courseKey, r.playerId, r.grossScores, ghinOverrides);
      return { playerId: r.playerId, net: t.net };
    })
    .sort((a,b) => a.net - b.net);

  if (ranked.length === 0) return { first:[], second:[], payouts:{} };
  const firstNet = ranked[0].net;
  const first = ranked.filter(r => r.net === firstNet);
  const remaining = ranked.filter(r => r.net !== firstNet);
  const secondNet = remaining[0]?.net;
  const second = secondNet !== undefined ? remaining.filter(r => r.net === secondNet) : [];
  const payouts = {};
  PLAYERS.forEach(p => (payouts[p.id] = 0));
  first.forEach(r  => (payouts[r.playerId] += 80/first.length));
  second.forEach(r => (payouts[r.playerId] += 40/second.length));
  return { first, second, payouts };
}

// Best ball: each match worth 1 RC point (win=1, halved=0.5 each, loss=0)
// "(3 Points)" in itinerary = 3 matches per day × 1 pt each = 3 pts available per day
export function calcBestBall(courseKey, team1Ids, team2Ids, roundsMap, ghinOverrides = {}) {
  const course = COURSES[courseKey];
  const pmap = playerMap(ghinOverrides);
  const allIds = [...team1Ids, ...team2Ids];
  const hdcps = Object.fromEntries(allIds.map(id => [id, courseHandicap(pmap[id].ghin, course.slope)]));
  const minHdcp = Math.min(...allIds.map(id => hdcps[id]));
  const strokes = Object.fromEntries(allIds.map(id => [id, strokesPerHole(hdcps[id]-minHdcp, course.hdcp)]));

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
  // 1 RC point per match
  let rc1=0, rc2=0;
  if (t1Pts > t2Pts)      { rc1=1; rc2=0; }
  else if (t2Pts > t1Pts) { rc1=0; rc2=1; }
  else                     { rc1=0.5; rc2=0.5; }
  return { holes, holeWins:{team1:t1Pts, team2:t2Pts}, rcPoints:{team1:rc1, team2:rc2} };
}

// Singles: each match worth 1 RC point
// "(6 Points)" = 6 singles matches × 1 pt each = 6 pts available Sunday
export function calcSingles(courseKey, p1Id, p2Id, roundsMap, ghinOverrides = {}) {
  const course = COURSES[courseKey];
  const pmap = playerMap(ghinOverrides);
  const h1 = courseHandicap(pmap[p1Id].ghin, course.slope);
  const h2 = courseHandicap(pmap[p2Id].ghin, course.slope);
  const min = Math.min(h1, h2);
  const s1 = strokesPerHole(h1-min, course.hdcp);
  const s2 = strokesPerHole(h2-min, course.hdcp);

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
  // 1 RC point per match
  let rc1=0, rc2=0;
  if (p1Pts > p2Pts)      { rc1=1; rc2=0; }
  else if (p2Pts > p1Pts) { rc1=0; rc2=1; }
  else                     { rc1=0.5; rc2=0.5; }
  return { holes, holeWins:{[p1Id]:p1Pts,[p2Id]:p2Pts}, rcPoints:{[p1Id]:rc1,[p2Id]:rc2} };
}

export function overallStandings(rounds, ghinOverrides = {}) {
  const standings = {};
  PLAYERS.forEach(p => { standings[p.id] = { playerId:p.id, name:p.name, team:p.team, totalGross:0, totalNet:0, rounds:0 }; });
  rounds.forEach(r => {
    if (!r.gross_scores || r.gross_scores.length !== 18) return;
    const t = getRoundTotals(r.course_key, r.player_id, r.gross_scores, ghinOverrides);
    standings[r.player_id].totalGross += t.gross;
    standings[r.player_id].totalNet += t.net;
    standings[r.player_id].rounds++;
  });
  return Object.values(standings);
}

// ── SETTLEMENT CALCULATION ────────────────────────────────────────────────
// Every player pays equal shares into each pot each day.
// Their "balance" = winnings - buy-ins. Settlement finds the minimum
// number of transactions to zero everyone out using a greedy creditor/debtor match.

export function calcSettlement(rounds, matchups, ctpWinners, ghinOverrides, roundsByCourse, grossByCoursePlayer, players) {
  const COURSE_KEYS = ["bearDance","redSky","lakota","frostCreek"];

  // balance[playerId] = net position (+ = owed money, - = owes money)
  const balance = {};
  players.forEach(p => (balance[p.id] = 0));

  // Daily buy-ins per player per course:
  //   $20 skins + $10 daily low net + $5 CTP = $35/day
  // Ryder Cup: $50 flat (one time)
  // MVP: $10 flat (one time)
  const dailyBuyIn = 35; // skins $20 + low net $10 + CTP $5
  const rcBuyIn    = 50;
  const mvpBuyIn   = 10;

  // Deduct buy-ins for each round played
  COURSE_KEYS.forEach(ck => {
    const cr = roundsByCourse[ck] || [];
    if (!cr.length) return;
    cr.forEach(r => { balance[r.playerId] -= dailyBuyIn; });
  });

  // Deduct Ryder Cup + MVP from everyone (paid regardless of rounds played)
  players.forEach(p => { balance[p.id] -= (rcBuyIn + mvpBuyIn); });

  // Add skins winnings
  COURSE_KEYS.forEach(ck => {
    const cr = roundsByCourse[ck] || [];
    if (!cr.length) return;
    const { totals } = skinPayouts(ck, cr, ghinOverrides);
    players.forEach(p => { balance[p.id] += (totals[p.id]||0); });
  });

  // Add daily low net winnings
  COURSE_KEYS.forEach(ck => {
    const cr = roundsByCourse[ck] || [];
    if (!cr.length) return;
    const { payouts } = dailyLowNet(ck, cr, ghinOverrides);
    players.forEach(p => { balance[p.id] += (payouts[p.id]||0); });
  });

  // Add CTP winnings — each par 3 pot = $60 (12 × $5)
  // Count total par 3s across played courses for carryover tracking
  // Simple: each CTP win = $60
  ctpWinners.forEach(c => {
    if (balance[c.player_id] !== undefined) balance[c.player_id] += 60;
  });

  // Ryder Cup winner: winning team splits $600
  let rc1=0, rc2=0;
  matchups.forEach(m => {
    const gMap = grossByCoursePlayer[m.course_key]||{};
    const isSingles = m.course_key==="frostCreek";
    const t1=m.team1_players||[], t2=m.team2_players||[];
    if (isSingles && t1[0]&&t2[0]&&gMap[t1[0]]&&gMap[t2[0]]) {
      const r=calcSingles(m.course_key,t1[0],t2[0],gMap,ghinOverrides);
      rc1+=(r.rcPoints[t1[0]]||0); rc2+=(r.rcPoints[t2[0]]||0);
    } else if (!isSingles&&t1.length===2&&t2.length===2&&(t1.some(id=>gMap[id])||t2.some(id=>gMap[id]))) {
      const r=calcBestBall(m.course_key,t1,t2,gMap,ghinOverrides);
      rc1+=r.rcPoints.team1; rc2+=r.rcPoints.team2;
    }
  });
  const rcWinner = rc1>rc2?1:rc2>rc1?2:null;
  if (rcWinner) {
    const winners = players.filter(p=>p.team===rcWinner);
    winners.forEach(p => { balance[p.id] += 600/winners.length; });
  }

  // MVP: player with most RC points wins $120
  const mvpPts = {};
  players.forEach(p=>(mvpPts[p.id]=0));
  matchups.forEach(m => {
    const gMap=grossByCoursePlayer[m.course_key]||{};
    const isSingles=m.course_key==="frostCreek";
    const t1=m.team1_players||[], t2=m.team2_players||[];
    if (isSingles&&t1[0]&&t2[0]&&gMap[t1[0]]&&gMap[t2[0]]) {
      const r=calcSingles(m.course_key,t1[0],t2[0],gMap,ghinOverrides);
      [t1[0],t2[0]].forEach(id=>{mvpPts[id]+=(r.rcPoints[id]||0);});
    } else if (!isSingles&&t1.length===2&&t2.length===2&&(t1.some(id=>gMap[id])||t2.some(id=>gMap[id]))) {
      const r=calcBestBall(m.course_key,t1,t2,gMap,ghinOverrides);
      t1.forEach(id=>{mvpPts[id]+=r.rcPoints.team1/2;});
      t2.forEach(id=>{mvpPts[id]+=r.rcPoints.team2/2;});
    }
  });
  const maxMvp = Math.max(...Object.values(mvpPts));
  if (maxMvp > 0) {
    const mvpWinners = players.filter(p=>mvpPts[p.id]===maxMvp);
    mvpWinners.forEach(p=>{ balance[p.id] += 120/mvpWinners.length; });
  }

  // Greedy settlement: match biggest debtor with biggest creditor
  const transactions = [];
  const bal = Object.entries(balance).map(([id,amt])=>({ id, amt: Math.round(amt*100)/100 }));

  let debtors   = bal.filter(b=>b.amt<-0.01).sort((a,b)=>a.amt-b.amt);   // most negative first
  let creditors = bal.filter(b=>b.amt> 0.01).sort((a,b)=>b.amt-a.amt);   // most positive first

  while (debtors.length && creditors.length) {
    const debtor   = debtors[0];
    const creditor = creditors[0];
    const amount   = Math.min(Math.abs(debtor.amt), creditor.amt);
    const rounded  = Math.round(amount*100)/100;
    if (rounded > 0.01) {
      transactions.push({ from: debtor.id, to: creditor.id, amount: rounded });
    }
    debtor.amt   += amount;
    creditor.amt -= amount;
    if (Math.abs(debtor.amt)   < 0.01) debtors.shift();
    if (Math.abs(creditor.amt) < 0.01) creditors.shift();
  }

  return { balance, transactions };
}
