export const TOURNAMENT = {
  name: "Harlan Invitational",
  year: 2026,
  edition: "4th Annual",
  location: "Colorado",
  dates: "July 23–26, 2026",
};

export const COURSES = {
  bearDance: {
    name: "Bear Dance",
    day: "Thursday",
    tees: "Blue/White",
    rating: 69.2,
    slope: 132,
    par: [4,3,4,4,5,4,3,5,4, 4,4,3,5,4,4,4,3,5],
    hdcp:[3,17,13,11,7,15,9,5,1, 14,6,16,8,12,4,10,18,2],
  },
  redSky: {
    name: "Red Sky (Norman)",
    day: "Friday",
    tees: "Blue",
    rating: 71.4,
    slope: 140,
    par: [4,3,4,5,3,4,4,5,4, 3,4,5,4,4,4,3,4,5],
    hdcp:[5,15,3,13,11,17,9,1,7, 18,12,4,14,6,16,10,2,8],
  },
  lakota: {
    name: "Lakota Links",
    day: "Saturday",
    tees: "Blue",
    rating: 70.1,
    slope: 133,
    par: [5,4,3,5,5,4,3,4,3, 4,5,4,4,4,3,4,3,5],
    hdcp:[6,10,18,2,4,14,16,8,12, 11,5,7,9,13,15,3,17,1],
  },
  frostCreek: {
    name: "Frost Creek",
    day: "Sunday",
    tees: "Creek",
    rating: 71.5,
    slope: 138,
    par: [4,4,5,4,3,4,4,3,5, 4,4,3,4,5,4,3,5,4],
    hdcp:[3,11,5,13,15,1,17,7,9, 4,6,10,16,14,12,18,8,2],
  },
};

export const COURSE_KEYS = ["bearDance","redSky","lakota","frostCreek"];

export const PLAYERS = [
  { id:"david",  name:"David",  ghin:2.9,  team:1 },
  { id:"chet",   name:"Chet",   ghin:6.6,  team:2 },
  { id:"alex",   name:"Alex",   ghin:7.2,  team:1 },
  { id:"jeff",   name:"Jeff",   ghin:8.4,  team:1 },
  { id:"eli",    name:"Eli",    ghin:8.6,  team:2 },
  { id:"jim",    name:"Jim",    ghin:9.2,  team:2 },
  { id:"todd",   name:"Todd",   ghin:9.9,  team:1 },
  { id:"erik",   name:"Erik",   ghin:10.5, team:2 },
  { id:"brent",  name:"Brent",  ghin:14.0, team:1 },
  { id:"drew",   name:"Drew",   ghin:16.3, team:2 },
  { id:"saul",   name:"Saul",   ghin:17.0, team:1 },
  { id:"varoon", name:"Varoon", ghin:18.8, team:2 },
];

export const TEAMS = {
  1: { name: "Team 1",        captain: "jeff" },
  2: { name: "Putt Pirates",  captain: "chet" },
};

// Prizes from the itinerary
export const PRIZES = [
  { id:"lowGross",    label:"Low Gross Overall",    award:"Scorecard Holder" },
  { id:"lowNet",      label:"Low Net Overall",       award:"Scorecard Holder" },
  { id:"highNet",     label:"High Net Overall",      award:"Fairway Headcover" },
  { id:"ryderCup",    label:"Ryder Cup Champions",   award:"Monogramed Glassware" },
  { id:"ryderMvp",    label:"Ryder Cup MVP",         award:"Colorado Hat" },
  { id:"lowDaily",    label:"Low Daily Rounds",      award:"Poker Chip Ballmarker" },
  { id:"mashie",      label:"1920 Mashie (Low Individual Net Round)", award:"Trophy" },
];

// Historical champions from itinerary
export const PAST_WINNERS = {
  lowGross: [
    { year:2023, winner:"David", score:"331", note:"4 rounds" },
    { year:2024, winner:"David", score:"245" },
    { year:2025, winner:"Chet",  score:"256" },
    { year:2026, winner:"",      score:"" },
  ],
  lowNet: [
    { year:2023, winner:"Chet", score:"310", note:"4 rounds" },
    { year:2024, winner:"Jim",  score:"225" },
    { year:2025, winner:"Jeff", score:"230" },
    { year:2026, winner:"",     score:"" },
  ],
  ryderCup: [
    { year:2024, winner:"David, Erik, Eli, Jim",               score:"9.5 to 4.5" },
    { year:2025, winner:"Jeff, Chet, Alex, Drew, Brent, Todd", score:"11.0 to 4.0" },
    { year:2026, winner:"",                                     score:"" },
  ],
};

/** Course handicap per USGA/GHIN:
 *  round( HI × (Slope/113) + (CourseRating − Par) )
 *  The entire expression is computed first, then rounded once. */
export function courseHandicap(ghin, slope, rating, par) {
  return Math.round(ghin * (slope / 113) + ((rating ?? 72) - (par ?? 72)));
}

export function strokesPerHole(courseHdcp, hdcpIndex) {
  const strokes = new Array(18).fill(0);
  for (let i = 0; i < 18; i++) {
    if (courseHdcp >= hdcpIndex[i]) strokes[i]++;
    if (courseHdcp - 18 >= hdcpIndex[i]) strokes[i]++;
  }
  return strokes;
}

export function playerMap(overrides = {}) {
  const map = {};
  PLAYERS.forEach(p => { map[p.id] = { ...p, ghin: overrides[p.id] ?? p.ghin }; });
  return map;
}

export function parTotals(courseKey) {
  const par = COURSES[courseKey].par;
  return {
    front: par.slice(0,9).reduce((a,b)=>a+b,0),
    back:  par.slice(9).reduce((a,b)=>a+b,0),
    total: par.reduce((a,b)=>a+b,0),
  };
}
