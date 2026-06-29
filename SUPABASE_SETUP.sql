-- Run this in your Supabase SQL editor to create all required tables

-- Settings (handicaps, overrides)
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  handicaps JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Rounds (one row per player per course)
CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_key TEXT NOT NULL,
  player_id  TEXT NOT NULL,
  gross_scores INTEGER[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_key, player_id)
);

-- Matchups (Ryder Cup pairings per day)
CREATE TABLE IF NOT EXISTS matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_key     TEXT NOT NULL,
  match_index    INTEGER NOT NULL,
  team1_players  TEXT[] NOT NULL DEFAULT '{}',
  team2_players  TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_key, match_index)
);

-- CTP winners
CREATE TABLE IF NOT EXISTS ctp_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_key  TEXT NOT NULL,
  hole_index  INTEGER NOT NULL,
  player_id   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_key, hole_index)
);

-- Enable Row Level Security (open read/write for now — add auth later if needed)
ALTER TABLE settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds      ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchups    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctp_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all" ON settings    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON rounds      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON matchups    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON ctp_winners FOR ALL USING (true) WITH CHECK (true);
