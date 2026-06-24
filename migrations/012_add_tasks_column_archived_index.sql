-- Composite index for the highest-frequency query: loading non-archived tasks
-- per column on the board page (WHERE column_id = ? AND archived = 0).
-- Without this, SQLite scans all tasks in the column (including archived ones)
-- and filters in memory. With it, archived tasks are skipped at the index level.
CREATE INDEX IF NOT EXISTS idx_tasks_column_archived ON tasks(column_id, archived);
