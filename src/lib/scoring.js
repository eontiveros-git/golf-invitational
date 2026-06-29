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
  first.forEach(r => (payouts[r.playerId] += 80/first.length));
  second.forEach(r => (payouts[r.playerId] += 40/second.length));
  return { first, second, payouts };
}

// Best ball match: handicaps adjusted to lowest in the foursome (all 4 players)
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
  let rc1=0, rc2=0;
  if (t1Pts > t2Pts)      { rc1=3; rc2=0; }
  else if (t2Pts > t1Pts) { rc1=0; rc2=3; }
  else                     { rc1=1.5; rc2=1.5; }
  return { holes, holeWins:{team1:t1Pts, team2:t2Pts}, rcPoints:{team1:rc1, team2:rc2} };
}

// Singles match: handicap to lowest of the two
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
  let rc1=0, rc2=0;
  if (p1Pts > p2Pts)      { rc1=6; rc2=0; }
  else if (p2Pts > p1Pts) { rc1=0; rc2=6; }
  else                     { rc1=3; rc2=3; }
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
