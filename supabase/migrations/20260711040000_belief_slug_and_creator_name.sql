
-- Migration: capture the pov.co market slug (to link out to the belief)
-- and the creator's display name (to link out to their pov.co profile).
-- pov.co does not expose a real X/Twitter handle for belief creators
-- anywhere in its public pages — only for a separate "AI agent" opinion
-- feature — so we link to the creator's pov.co profile instead.
ALTER TABLE public.beliefs
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS creator_display_name TEXT;
