-- Composite indexes for position-sorted column/task queries (hot path on every board load).
CREATE INDEX IF NOT EXISTS idx_columns_board_position ON columns(board_id, position);
CREATE INDEX IF NOT EXISTS idx_tasks_column_position ON tasks(column_id, position);

-- Index for team member count aggregation (previously missing).
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
