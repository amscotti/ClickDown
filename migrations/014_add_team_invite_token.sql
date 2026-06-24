-- Secret invite token so team join is not possible with only a guessable slug.
-- Existing rows are backfilled by application code on first token access.
ALTER TABLE teams ADD COLUMN invite_token TEXT;
