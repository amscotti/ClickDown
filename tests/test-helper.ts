import Database from 'bun:sqlite';
import { runMigrations } from '../src/config/migrations';

// Test helper to create fresh database and get services.
// IMPORTANT: the schema comes from the REAL migration files (single source of
// truth). This prevents drift between the test schema and the production schema —
// if the app references a column that a migration forgot to add, tests fail too.
export function createTestDatabase(): Database {
  const testDb = new Database(':memory:');
  testDb.exec('PRAGMA foreign_keys = ON');
  runMigrations(testDb);
  return testDb;
}

// Helper to create a test user
export function createTestUser(
  db: Database,
  overrides: Partial<{
    id: string;
    email: string;
    passwordHash: string;
    displayName: string;
    avatarSeed: string;
  }> = {}
): string {
  const userId = overrides.id || 'user123';
  db.prepare(
    'INSERT OR REPLACE INTO users (id, email, password_hash, display_name, avatar_seed) VALUES (?, ?, ?, ?, ?)'
  ).run(
    userId,
    overrides.email || 'test@example.com',
    overrides.passwordHash || 'hash',
    overrides.displayName || 'Test User',
    overrides.avatarSeed || 'seed123'
  );
  return userId;
}

// Helper to create a test column
export function createTestColumn(
  db: Database,
  boardId: string,
  overrides: Partial<{
    id: string;
    name: string;
    position: number;
    wipLimit: number;
    color: string;
  }> = {}
): string {
  const columnId = overrides.id || 'column123';
  db.prepare(
    'INSERT OR REPLACE INTO columns (id, board_id, name, position, wip_limit, color) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    columnId,
    boardId,
    overrides.name || 'To Do',
    overrides.position ?? 0,
    overrides.wipLimit ?? null,
    overrides.color ?? null
  );
  return columnId;
}
