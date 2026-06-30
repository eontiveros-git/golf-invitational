-- Run this in your Supabase SQL editor for a fresh install

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  id             INTEGER PRIMARY KEY DEFAULT 1,
  handicaps      JSONB DEFAULT '{}'::jsonb,
  teams          JSONB DEFAULT '{}'::jsonb,
  prize_winners  JSONB DEFAULT '{}'::jsonb,
  past_winners   JSONB DEFAULT '{}'::jsonb,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Rounds
CREATE TABLE IF NOT EXISTS rounds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_key   TEXT NOT NULL,
  player_id    TEXT NOT NULL,
  gross_scores INTEGER[] NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_key, player_id)
);

-- Matchups
CREATE TABLE IF NOT EXISTS matchups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_key    TEXT NOT NULL,
  match_index   INTEGER NOT NULL,
  team1_players TEXT[] NOT NULL DEFAULT '{}',
  team2_players TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_key, match_index)
);

-- CTP winners
CREATE TABLE IF NOT EXISTS ctp_winners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_key  TEXT NOT NULL,
  hole_index  INTEGER NOT NULL,
  player_id   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_key, hole_index)
);

-- Row Level Security (open access — add auth later if needed)
ALTER TABLE settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds      ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchups    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctp_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all" ON settings    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON rounds      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON matchups    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON ctp_winners FOR ALL USING (true) WITH CHECK (true);
