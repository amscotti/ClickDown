-- Unique invite tokens (backfill NULLs first so the unique index can apply).
UPDATE teams SET invite_token = lower(hex(randomblob(16))) WHERE invite_token IS NULL OR invite_token = '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_invite_token ON teams(invite_token);
