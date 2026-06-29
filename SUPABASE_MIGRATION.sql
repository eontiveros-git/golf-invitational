-- Run this in your Supabase SQL editor if you already ran SUPABASE_SETUP.sql
-- Adds missing columns to the settings table

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS handicaps    JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS teams        JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS prize_winners JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS past_winners  JSONB DEFAULT '{}'::jsonb;
