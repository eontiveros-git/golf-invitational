import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── SETTINGS ──────────────────────────────────────────────────────────────
export async function getSettings() {
  const { data } = await supabase.from("settings").select("*").eq("id", 1).single();
  return data;
}
export async function saveSettings(payload) {
  const { data } = await supabase
    .from("settings").upsert({ id: 1, ...payload }).select().single();
  return data;
}

// ── ROUNDS ────────────────────────────────────────────────────────────────
export async function getRounds() {
  const { data } = await supabase.from("rounds").select("*");
  return data || [];
}
export async function saveRound(courseKey, playerId, grossScores) {
  const { data } = await supabase
    .from("rounds")
    .upsert({ course_key: courseKey, player_id: playerId, gross_scores: grossScores },
             { onConflict: "course_key,player_id" })
    .select().single();
  return data;
}
export async function deleteRound(courseKey, playerId) {
  await supabase.from("rounds").delete().match({ course_key: courseKey, player_id: playerId });
}

// ── MATCHUPS ──────────────────────────────────────────────────────────────
export async function getMatchups() {
  const { data } = await supabase.from("matchups").select("*");
  return data || [];
}
export async function saveMatchup(courseKey, matchIndex, team1Players, team2Players) {
  const { data } = await supabase
    .from("matchups")
    .upsert({ course_key: courseKey, match_index: matchIndex, team1_players: team1Players, team2_players: team2Players },
             { onConflict: "course_key,match_index" })
    .select().single();
  return data;
}

// ── CTP ───────────────────────────────────────────────────────────────────
export async function getCtpWinners() {
  const { data } = await supabase.from("ctp_winners").select("*");
  return data || [];
}
export async function saveCtpWinner(courseKey, holeIndex, playerId) {
  const { data } = await supabase
    .from("ctp_winners")
    .upsert({ course_key: courseKey, hole_index: holeIndex, player_id: playerId },
             { onConflict: "course_key,hole_index" })
    .select().single();
  return data;
}
