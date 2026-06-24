import Database from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { latestMigrationFile, runMigrations } from '../../src/config/migrations';

const migrationsDir = join(process.cwd(), 'migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

function tables(db: Database): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{
      name: string;
    }>
  ).map((t) => t.name);
}

function columns(db: Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
}

describe('Database migrations', () => {
  test('there is at least one migration file', () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  test('apply all migrations to a fresh DB and produce the expected tables', () => {
    const db = new Database(':memory:');
    const { applied } = runMigrations(db);

    // Every migration file should have been applied on a fresh DB
    expect(applied).toEqual(migrationFiles);

    // Core tables the application depends on:
    for (const t of [
      'users',
      'sessions',
      'teams',
      'team_members',
      'boards',
      'columns',
      'tasks',
      'task_checklist',
      'task_activity',
      'schema_migrations',
    ]) {
      expect(tables(db)).toContain(t);
    }
  });

  test('migrations include the columns application code depends on', () => {
    // This is the guardrail: if code references a column that a migration forgot
    // to add, this assertion fails. Add new column dependencies here.
    const db = new Database(':memory:');
    runMigrations(db);

    expect(columns(db, 'users')).toContain('updated_at');
    expect(columns(db, 'tasks')).toContain('archived');
    expect(columns(db, 'tasks')).toContain('position');
    expect(columns(db, 'teams')).toContain('invite_token');
  });

  test('re-running migrations on a fully-migrated DB is a no-op (idempotent)', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const second = runMigrations(db);

    expect(second.applied).toEqual([]);
    expect(second.skipped.sort()).toEqual(migrationFiles);
  });

  test('rejects changes to an already-applied migration', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clickdown-migrations-'));
    const db = new Database(':memory:');
    try {
      const file = join(dir, '001_test.sql');
      writeFileSync(file, 'CREATE TABLE example (id TEXT PRIMARY KEY);');
      runMigrations(db, dir);
      writeFileSync(file, 'CREATE TABLE example (id TEXT PRIMARY KEY, name TEXT);');
      expect(() => runMigrations(db, dir)).toThrow(/modified/);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('latestMigrationFile returns the newest SQL file or null', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clickdown-migrations-'));
    try {
      expect(latestMigrationFile(dir)).toBeNull();
      writeFileSync(join(dir, '001_a.sql'), 'SELECT 1;');
      writeFileSync(join(dir, '010_b.sql'), 'SELECT 1;');
      writeFileSync(join(dir, 'not-a-migration.txt'), 'ignore me');
      expect(latestMigrationFile(dir)).toBe('010_b.sql');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('latestMigrationFile tracks the repository migrations directory', () => {
    expect(latestMigrationFile()).toBe(migrationFiles.at(-1) ?? null);
  });

  test('re-running on a legacy untracked DB that already has the schema is safe', () => {
    // Simulate a DB migrated by the old untracked script: schema present, no
    // schema_migrations table. Re-running must not throw (e.g. duplicate column).
    const db = new Database(':memory:');
    runMigrations(db); // apply once (untracked legacy state)
    // Drop the tracking table to simulate the legacy DB, then re-run
    db.exec('DROP TABLE schema_migrations');
    expect(() => runMigrations(db)).not.toThrow();
    const tracked = (
      db.prepare('SELECT name FROM schema_migrations').all() as Array<{ name: string }>
    ).map((r) => r.name);
    expect(tracked.sort()).toEqual(migrationFiles);
  });
});
