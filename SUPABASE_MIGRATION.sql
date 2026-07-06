-- Run this in your Supabase SQL editor if you already ran SUPABASE_SETUP.sql
-- Adds missing columns to the settings table

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS handicaps    JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS teams        JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS prize_winners JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS past_winners  JSONB DEFAULT '{}'::jsonb;

-- Daily payment tracking (added for paid/unpaid transaction status)
CREATE TABLE IF NOT EXISTS daily_payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_key  TEXT NOT NULL,
  from_player TEXT NOT NULL,
  to_player   TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  paid        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_key, from_player, to_player)
);
ALTER TABLE daily_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON daily_payments FOR ALL USING (true) WITH CHECK (true);
