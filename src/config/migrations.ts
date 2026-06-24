import type Database from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MigrationResult {
  /** Migration files applied in this run. */
  applied: string[];
  /** Migration files skipped (already tracked, or already present on a legacy DB). */
  skipped: string[];
}

/** Newest migration filename, or null when the directory has no SQL files. */
export function latestMigrationFile(
  migrationsDir = join(process.cwd(), 'migrations')
): string | null {
  if (!existsSync(migrationsDir)) return null;
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files.at(-1) ?? null;
}

/**
 * Apply pending SQL migrations to a database, tracking each one in a
 * `schema_migrations` table so the operation is idempotent and safe to re-run.
 *
 * Robustness properties:
 * - Re-running on a fully-migrated DB is a no-op (each file is recorded).
 * - Legacy untracked ALTER migrations are detected using explicit schema checks.
 * - Applied migration checksums prevent historical SQL from changing silently.
 * - Each migration runs in a transaction; a failure rolls it back cleanly.
 *
 * This is the single source of truth for the schema — the test suite runs the
 * exact same migration files against an in-memory DB, so a migration that the
 * application code requires can never silently go missing from tests.
 */
export function runMigrations(
  database: Database,
  migrationsDir = join(process.cwd(), 'migrations')
): MigrationResult {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrationColumns = database.prepare('PRAGMA table_info(schema_migrations)').all() as Array<{
    name: string;
  }>;
  if (!migrationColumns.some((column) => column.name === 'checksum')) {
    database.exec('ALTER TABLE schema_migrations ADD COLUMN checksum TEXT');
  }

  const tracked = new Map(
    (
      database.prepare('SELECT name, checksum FROM schema_migrations').all() as Array<{
        name: string;
        checksum: string | null;
      }>
    ).map((row) => [row.name, row.checksum])
  );

  const result: MigrationResult = { applied: [], skipped: [] };
  if (!existsSync(migrationsDir)) return result;

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const trackedChecksum = tracked.get(file);
    if (tracked.has(file)) {
      if (trackedChecksum && trackedChecksum !== checksum) {
        throw new Error(`Applied migration was modified: ${file}`);
      }
      if (!trackedChecksum) {
        database
          .prepare('UPDATE schema_migrations SET checksum = ? WHERE name = ?')
          .run(checksum, file);
      }
      result.skipped.push(file);
      continue;
    }

    const legacyColumn =
      file === '010_add_task_archived.sql'
        ? { table: 'tasks', column: 'archived' }
        : file === '014_add_team_invite_token.sql'
          ? { table: 'teams', column: 'invite_token' }
          : null;
    if (legacyColumn) {
      const columns = database.prepare(`PRAGMA table_info(${legacyColumn.table})`).all() as Array<{
        name: string;
      }>;
      if (columns.some((column) => column.name === legacyColumn.column)) {
        database
          .prepare('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)')
          .run(file, checksum);
        result.skipped.push(file);
        continue;
      }
    }

    const tx = database.transaction(() => {
      database.exec(sql);
      database
        .prepare('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)')
        .run(file, checksum);
    });
    tx();
    result.applied.push(file);
  }

  return result;
}
