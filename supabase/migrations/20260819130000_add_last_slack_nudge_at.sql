-- Tracks when an admin last sent a Slack qualification nudge to a Digi member.
-- Displayed in the Vue Tier table so admins don't over-notify.

ALTER TABLE membres_digilityx
  ADD COLUMN IF NOT EXISTS last_slack_nudge_at TIMESTAMPTZ DEFAULT NULL;
