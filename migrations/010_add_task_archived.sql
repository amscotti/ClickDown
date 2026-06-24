-- Adds soft-archive support for tasks (hide without deleting).
ALTER TABLE tasks ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
